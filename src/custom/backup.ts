import { customCatalog, customDatasetId, importVocabulary, newDeckId, object, parseWord, type PersonalDeck } from "./catalog";
import { Rating, review, type Grade } from "../store/srs";
import { dayKey, emptyProgress, readDeckProgress, restoreNewDeckProgress, sanitizeProgress, sanitizeSettings, store, type Progress, type Settings } from "../store/store";

const FORMAT = "my-word-atlas-personal-backup";
const LEGACY_FORMAT = "my-word-atlas-backup-v1";

export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

interface RestorePlan {
  decks: { deck: PersonalDeck; progress: Progress }[];
  reviews: number;
  skippedRecords: number;
  legacy: boolean;
  settings?: Settings;
}

export function exportPersonalBackup(deck: PersonalDeck): string {
  const progress = readDeckProgress(customDatasetId(deck.id));
  return JSON.stringify({ format: FORMAT, version: 2, exported: new Date().toISOString(), deck,
    progress: { ...progress, session: null }, settings: store.get().settings }, null, 1);
}

function restoreDeck(source: Record<string, unknown>, name: unknown) {
  if (!Array.isArray(source.words)) throw new Error("備份缺少詞條資料。");
  const { words, skipped } = importVocabulary(JSON.stringify(source.words), "words.json");
  if (skipped || words.length === 0) throw new Error("備份含無法還原的詞條，或詞庫是空的。");
  const deck = { id: newDeckId(), name: typeof name === "string" && name.trim() ? name.trim().slice(0, 80) : "還原的詞庫", words };
  const ids = new Set(words.map((word) => word.id));
  const idMap = new Map<string, string>();
  for (const raw of source.words) {
    if (!object(raw) || typeof raw.id !== "string") continue;
    const word = parseWord(raw);
    if (word && ids.has(word.id)) idMap.set(raw.id, word.id);
  }
  return { deck, idMap };
}

export function parsePersonalBackup(data: unknown): RestorePlan | null {
  if (!object(data)) return null;
  if (data.format === FORMAT) {
    if ((data.version !== 1 && data.version !== 2) || !object(data.deck) || !object(data.progress) || data.progress.version !== 2 ||
      !object(data.progress.cards) || typeof data.deck.id !== "string" || data.progress.datasetId !== customDatasetId(data.deck.id)) {
      throw new Error("詞庫備份版本或學習資料不相符。");
    }
    const { deck, idMap } = restoreDeck(data.deck, data.deck.name);
    const progress = sanitizeProgress({ ...data.progress, session: null }, customDatasetId(deck.id));
    const cards = Object.entries(progress.cards).flatMap(([id, card]) => {
      const mapped = idMap.get(id);
      return mapped ? [[mapped, card] as const] : [];
    });
    const mapIds = (ids: string[]) => [...new Set(ids.flatMap((id) => idMap.get(id) ?? []))];
    progress.cards = Object.fromEntries(cards);
    progress.bookmarks = mapIds(progress.bookmarks);
    progress.mistakes = mapIds(progress.mistakes);
    return { decks: [{ deck, progress }], reviews: 0, skippedRecords: Object.keys(data.progress.cards).length - cards.length, legacy: false,
      settings: data.version === 2 && object(data.settings) ? sanitizeSettings(data.settings) : undefined };
  }
  if (data.format !== LEGACY_FORMAT) return null;
  if (!object(data.state) || data.state.schema !== 1 || !object(data.state.decks) || !object(data.state.progress)) {
    throw new Error("V1.4.1 備份格式不正確。");
  }
  const entries = Object.entries(data.state.decks);
  if (entries.length > 60) throw new Error("備份超過可還原的詞庫數量。");
  const legacyProgress = data.state.progress;
  let reviews = 0;
  const allRecords = new Set(Object.keys(legacyProgress));
  const matchedRecords = new Set<string>();
  const decks: RestorePlan["decks"] = [];
  for (const [legacyId, source] of entries) {
    if (!object(source) || !Array.isArray(source.words)) throw new Error("舊版備份的詞庫格式不正確。");
    if (!source.words.length) continue;
    const { deck, idMap } = restoreDeck(source, source.title);
    const progress = emptyProgress(customDatasetId(deck.id));
    const eventsByWord = new Map<string, { at: number; grade: Grade }[]>();
    for (const [oldId, id] of idMap) {
      const key = `${legacyId}::${oldId}`;
      const record = legacyProgress[key];
      if (!object(record) || !Array.isArray(record.events)) continue;
      const events = record.events.flatMap((event) => {
        if (!object(event) || typeof event.at !== "string" || !Number.isInteger(event.grade) ||
          Number(event.grade) < Rating.Again || Number(event.grade) > Rating.Easy) return [];
        const at = Date.parse(event.at);
        return Number.isFinite(at) && at >= 0 && at <= Date.now() ? [{ at, grade: event.grade as Grade }] : [];
      });
      if (!events.length) continue;
      matchedRecords.add(key);
      eventsByWord.set(id, [...(eventsByWord.get(id) ?? []), ...events]);
    }
    const mistakes = new Map<string, number>();
    for (const [id, events] of eventsByWord) {
      events.sort((a, b) => a.at - b.at);
      for (const [index, { at, grade }] of events.entries()) {
        progress.cards[id] = review(progress.cards[id], grade, at);
        const day = dayKey(new Date(at));
        const stat = progress.days[day] ??= { n: 0, r: 0, c: 0, t: 0 };
        if (index === 0) stat.n++;
        stat.r++;
        if (grade !== Rating.Again) stat.c++;
        else mistakes.set(id, at);
        reviews++;
      }
    }
    progress.mistakes = [...mistakes].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([id]) => id);
    decks.push({ deck, progress });
  }
  if (!decks.length) throw new Error("備份沒有可還原的詞庫。");
  return { decks, reviews, skippedRecords: allRecords.size - matchedRecords.size, legacy: true };
}

export function installPersonalBackup(plan: RestorePlan) {
  restoreNewDeckProgress(plan.decks.map(({ progress }) => progress), () =>
    customCatalog.addRestored(plan.decks.map(({ deck }) => deck)),
  );
}
