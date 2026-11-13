import type { Atlas, Entry, WordContext, WordRef } from "../atlas/types";
import { MEDIA } from "../atlas/types";

export interface PersonalWord {
  id: string;
  word: string;
  zh: string;
  pos: string;
  cefr: string;
  topic: string;
  example: string;
  exampleZh: string;
  collocations: string[];
  context?: WordContext;
  definition?: string;
  uk?: string;
  us?: string;
  atlasId?: string;
  imageUrl?: string;
  audioUkUrl?: string;
  audioUsUrl?: string;
}

export interface PersonalDeck {
  id: string;
  name: string;
  words: PersonalWord[];
}

export interface CatalogState {
  version: 1;
  activeId: string | null;
  decks: PersonalDeck[];
  installedPreset?: string;
}

export interface ImportedVocabulary {
  words: PersonalWord[];
  skipped: number;
  duplicates: number;
}

export const CATALOG_KEY = "my-word-atlas:catalog:v1";
export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const MAX_WORDS = 5000;
const MAX_DECKS = 60;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const blank = (): CatalogState => ({ version: 1, activeId: null, decks: [] });
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";
export const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const alpha = (s: string) => /[A-Za-z]/.test(s);
const han = (s: string) => /[\u3400-\u9fff]/.test(s);
const key = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
const mediaURL = (value: unknown): string => {
  const raw = text(value);
  if (!raw) return "";
  try { const u = new URL(raw); return u.protocol === "https:" ? u.href : ""; }
  catch { return ""; }
};
const cutoff = (s: string, n: number) => s.slice(0, n);
export function contextURL(value: unknown) {
  const raw = text(value);
  if (!raw || raw.length > 2000) return "";
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}
const validLevel = (s: string) => LEVELS.includes(s.toUpperCase() as typeof LEVELS[number]) ? s.toUpperCase() : "B1";

function makeId(word: string): string {
  let h = 2166136261;
  for (const char of key(word)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return "personal-" + (h >>> 0).toString(36);
}

export function parseWord(value: unknown): PersonalWord | null {
  if (!object(value)) return null;
  const senses = Array.isArray(value.senses) ? value.senses : [];
  const sense: Record<string, unknown> = object(senses[0]) ? senses[0] : {};
  const ex = Array.isArray(value.ex) ? value.ex : [];
  const example: Record<string, unknown> = object(ex[0]) ? ex[0] : {};
  const word = cutoff(text(value.word || value.w || value.en), 180);
  const zh = cutoff(text(value.zh || value.meaning || sense.zh), 500);
  if (!word || !alpha(word) || !zh) return null;
  const collocations = Array.isArray(value.collocations) ? value.collocations :
    Array.isArray(value.col) ? value.col : text(value.collocations).split(/[;；]/);
  const atlasId = text(value.atlasId || (value.atlasMedia && value.id));
  const input = object(value.context) ? value.context : {};
  const sentence = cutoff(text(input.sentence), 1000);
  const url = contextURL(input.url);
  const note = cutoff(text(input.note), 1000);
  return {
    id: makeId(word),
    word,
    zh,
    pos: cutoff(text(value.pos || sense.pos), 35),
    cefr: validLevel(text(value.cefr)),
    topic: cutoff(text(value.topic) || "custom", 40),
    example: cutoff(text(value.example || example.en), 500),
    exampleZh: cutoff(text(value.exampleZh || example.zh), 500),
    ...(sentence || url || note ? { context: { sentence: sentence || undefined, url: url || undefined, note: note || undefined } } : {}),
    collocations: collocations.map(text).filter(Boolean).slice(0, 12),
    definition: cutoff(text(value.definition || sense.en), 500),
    uk: cutoff(text(value.uk), 80),
    us: cutoff(text(value.us), 80),
    atlasId: /^[a-z0-9][a-z0-9-]{0,90}$/.test(atlasId) ? atlasId : undefined,
    imageUrl: mediaURL(value.imageUrl || (object(value.media) && value.media.img)),
    audioUkUrl: mediaURL(value.audioUkUrl || (object(value.media) && value.media.uk)),
    audioUsUrl: mediaURL(value.audioUsUrl || (object(value.media) && value.media.us)),
  };
}

/** Correct RFC-4180-style quotes, embedded commas, and multiline fields. */
export function parseCSV(textCSV: string): string[][] {
  const data = textCSV.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === '"') {
      if (quoted && data[i + 1] === '"') { field += '"'; i++; }
      else if (!field || quoted) quoted = !quoted;
      else field += c;
    } else if (c === "," && !quoted) {
      row.push(field); field = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && data[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (quoted) throw new Error("CSV 引號沒有正確關閉。");
  row.push(field);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}

const englishLang = (s: string) => /^(英文|英语|英語|english|en|en-us|en-gb)$/i.test(text(s));
const chineseLang = (s: string) => /^(中文(?:\s*[(（][^)）]+[)）])?|汉语|漢語|簡體中文|简体中文|繁體中文|繁体中文|粵語|粤语|廣東話|广东话|cantonese|chinese|zh(?:-[a-z]+)?)$/i.test(text(s));
const autoLang = (s: string) => /^(偵測語言|检测语言|detect language|auto)$/i.test(text(s));
const knownLang = (s: string) => englishLang(s) || chineseLang(s) || autoLang(s);
const looksEnglish = (s: string) => alpha(s) && !han(s);

function csvWords(rows: string[][]): unknown[] {
  if (!rows.length) return [];
  const header = rows[0].map((s) => s.trim().toLowerCase());
  const find = (names: string[]) => header.findIndex((h) => names.includes(h));
  const en = find(["word", "w", "english", "en", "英文", "單字", "单词", "詞彙", "词汇"]);
  const zh = find(["zh", "chinese", "meaning", "translation", "中文", "中文意思", "翻譯", "翻译", "釋義", "释义"]);
  if (en >= 0 && zh >= 0) {
    const col = (row: string[], names: string[]) => {
      const i = find(names);
      return i < 0 ? "" : row[i] || "";
    };
    return rows.slice(1).map((r) => ({
      word: r[en], zh: r[zh],
      pos: col(r, ["pos", "part of speech", "詞性", "词性"]),
      cefr: col(r, ["cefr", "level", "難度", "难度"]),
      topic: col(r, ["topic", "category", "主題", "主题", "分類", "分类"]),
      example: col(r, ["example", "sentence", "例句"]),
      exampleZh: col(r, ["examplezh", "example_zh", "例句中文"]),
      context: {
        sentence: col(r, ["source_sentence", "來源原句", "原句"]),
        url: col(r, ["source_url", "來源連結"]),
        note: col(r, ["personal_note", "個人筆記"]),
      },
      definition: col(r, ["definition", "英文釋義"]),
      collocations: col(r, ["collocations", "col", "搭配"]),
      imageUrl: col(r, ["imageurl", "image_url"]),
      audioUkUrl: col(r, ["audioukurl", "audio_uk_url"]),
      audioUsUrl: col(r, ["audiousurl", "audio_us_url"]),
    }));
  }
  // Google Translate Saved Translations: source language, target language, source, translation.
  const sample = rows.slice(0, 12);
  if (sample.filter((r) => r.length >= 4 && knownLang(r[0]) && knownLang(r[1])).length >= Math.ceil(sample.length * 0.7)) {
    return rows.map((r) => {
      if (r.length < 4) return null;
      if (chineseLang(r[1]) && (englishLang(r[0]) || (autoLang(r[0]) && looksEnglish(r[2]))))
        return { word: r[2], zh: r[3] };
      if (chineseLang(r[0]) && (englishLang(r[1]) || (autoLang(r[1]) && looksEnglish(r[3]))))
        return { word: r[3], zh: r[2] };
      return null;
    });
  }
  // Headerless ordinary two-column CSV, including reversed Chinese-English rows.
  return rows.map((r) => {
    if (r.length < 2) return null;
    return han(r[0]) && alpha(r[1]) ? { word: r[1], zh: r[0] } : { word: r[0], zh: r[1] };
  });
}

export function importVocabulary(raw: string, filename = ""): ImportedVocabulary {
  if (new Blob([raw]).size > MAX_FILE_BYTES) throw new Error("檔案超過 4 MB，請分批匯入。");
  let source: unknown[];
  if (filename.toLowerCase().endsWith(".json") || /^[\s\uFEFF]*[\[{]/.test(raw)) {
    let parsed: unknown;
    try { parsed = JSON.parse(raw.replace(/^\uFEFF/, "")); }
    catch { throw new Error("JSON 格式不正確。"); }
    if (Array.isArray(parsed)) source = parsed;
    else if (object(parsed) && Array.isArray(parsed.words)) source = parsed.words;
    else if (object(parsed) && object(parsed.state) && object(parsed.state.decks)) {
      // Legacy V1.4.1 export; vocabulary is importable but FSRS progress is not.
      source = Object.values(parsed.state.decks).flatMap((d) => object(d) && Array.isArray(d.words) ? d.words : []);
    } else throw new Error("JSON 需要是單字陣列、含 words 的詞庫，或舊版詞庫備份。");
  } else source = csvWords(parseCSV(raw));

  if (source.length > MAX_WORDS) throw new Error("一次最多匯入 5,000 個詞條，請分批匯入。");
  const dedup = new Map<string, PersonalWord>();
  let skipped = 0;
  let duplicates = 0;
  for (const row of source) {
    const word = parseWord(row);
    if (!word) { skipped++; continue; }
    const k = key(word.word);
    if (dedup.has(k)) { duplicates++; continue; }
    dedup.set(k, word);
  }
  return { words: [...dedup.values()], skipped, duplicates };
}

export function makeCustomAtlas(deck: PersonalDeck, open: Atlas | null = null): Atlas {
  const levels = [...LEVELS];
  const categories = [...new Set(deck.words.map((w) => w.topic || "custom"))];
  const topics: [string, string][] = (categories.length ? categories : ["custom"]).map((t) => [t, t]);
  const entries = new Map<string, Entry>();
  const words: WordRef[] = deck.words.map((w, order) => {
    const twin = w.atlasId ? open?.byId.get(w.atlasId) : undefined;
    const img = w.imageUrl || (twin && open?.img(twin, "thumb")) || null;
    const uk = w.audioUkUrl || (twin && open?.audio(twin, "uk")) || null;
    const us = w.audioUsUrl || (twin && open?.audio(twin, "us")) || null;
    const media = (img ? MEDIA.img : 0) | (uk ? MEDIA.uk : 0) | (us ? MEDIA.us : 0);
    entries.set(w.id, {
      id: w.id, w: w.word, uk: w.uk || "", us: w.us || "",
      senses: [{ pos: w.pos, zh: w.zh, en: w.definition || "" }],
      ex: w.example ? [{ en: w.example, zh: w.exampleZh }] : [],
      context: w.context,
      col: w.collocations, fam: [], syn: [], ant: [], tip: "",
      cefr: w.cefr, topic: w.topic, m: media,
      media: { img, uk, us },
    });
    return { id: w.id, word: w.word, zh: [w.pos, w.zh].filter(Boolean).join(" "), ipa: w.uk || w.us || "",
      cefr: Math.max(0, levels.indexOf(w.cefr as typeof LEVELS[number])),
      topic: Math.max(0, categories.indexOf(w.topic)), media, hasExample: !!w.example, order };
  });
  const byId = new Map(words.map((w) => [w.id, w]));
  return {
    id: customDatasetId(deck.id),
    name: deck.name, kind: "private", count: words.length,
    examples: [...entries.values()].reduce((n, e) => n + e.ex.length, 0),
    illustrated: words.filter((w) => !!(w.media & MEDIA.img)).length,
    topics, cefr: levels, words, byId,
    peek: (id) => entries.get(id),
    entry: async (id) => {
      const found = entries.get(id);
      if (!found) throw new Error("找不到詞條：" + id);
      return found;
    },
    img: (ref) => entries.get(ref.id)?.media?.img || null,
    audio: (ref, kind) => {
      if (kind !== "uk" && kind !== "us") return null;
      return entries.get(ref.id)?.media?.[kind] || null;
    },
    wordFallbackAudio: (ref) => {
      if (typeof __WORD_ATLAS_PRIVATE_AUDIO__ === "undefined") return null;
      const file = __WORD_ATLAS_PRIVATE_AUDIO__[ref.id];
      return file ? `${import.meta.env.BASE_URL}${file}` : null;
    },
  };
}

export function installPreset(catalog: CatalogState, preset: unknown): CatalogState {
  if (!object(preset) || typeof preset.id !== "string" || !/^preset-[a-z0-9-]{1,70}$/.test(preset.id) ||
      !Array.isArray(preset.words) || preset.words.length > MAX_WORDS) return catalog;
  const name = cutoff(text(preset.name), 80);
  const words = [...new Map(preset.words.map(parseWord).filter((word): word is PersonalWord => !!word)
    .map((word) => [key(word.word), word])).values()];
  if (!name || !words.length) return catalog;

  const installedPreset = preset.id;
  if (catalog.installedPreset === installedPreset) {
    const deck = catalog.decks.find((item) => item.id === installedPreset);
    if (!deck) return catalog;
    const examples = new Map(words.filter((word) => word.example).map((word) => [word.id, word]));
    let updated = false;
    const enriched = deck.words.map((word) => {
      const supplied = examples.get(word.id);
      if (!supplied || word.zh !== supplied.zh || (word.pos && word.pos !== supplied.pos)) return word;
      if (word.example) return word;
      updated = true;
      return {
        ...word,
        pos: word.pos || supplied.pos,
        example: supplied.example,
        exampleZh: supplied.exampleZh,
        collocations: word.collocations.length ? word.collocations : supplied.collocations,
      };
    });
    return updated ? { ...catalog, decks: catalog.decks.map((item) => item === deck ? { ...deck, words: enriched } : item) } : catalog;
  }
  const alreadyImported = catalog.decks.some((deck) => {
    if (deck.id === installedPreset) return true;
    if (deck.words.length < words.length) return false;
    const existing = new Set(deck.words.map((word) => key(word.word)));
    return words.every((word) => existing.has(key(word.word)));
  });
  if (alreadyImported) return { ...catalog, installedPreset };
  if (catalog.decks.length >= MAX_DECKS) return catalog;

  return {
    ...catalog,
    installedPreset,
    activeId: catalog.decks.length ? catalog.activeId : installedPreset,
    decks: [{ id: installedPreset, name, words }, ...catalog.decks],
  };
}

function readCatalog(): CatalogState {
  try {
    const data = JSON.parse(localStorage.getItem(CATALOG_KEY) || "null") as unknown;
    if (!object(data) || data.version !== 1 || !Array.isArray(data.decks)) return blank();
    const decks: PersonalDeck[] = [];
    for (const v of data.decks.slice(0, MAX_DECKS)) {
      if (!object(v) || typeof v.id !== "string" || typeof v.name !== "string" || !Array.isArray(v.words)) continue;
      decks.push({ id: v.id, name: cutoff(v.name, 80),
        words: v.words.slice(0, MAX_WORDS).map(parseWord).filter((w): w is PersonalWord => !!w) });
    }
    const selected = text(data.activeId);
    const activeId = decks.some((d) => d.id === selected && d.words.length) ? selected : null;
    return { version: 1, activeId, decks, installedPreset: text(data.installedPreset) || undefined };
  } catch { return blank(); }
}

function initialCatalog(): CatalogState {
  const saved = readCatalog();
  if (typeof __WORD_ATLAS_PRESET__ === "undefined" || !__WORD_ATLAS_PRESET__) return saved;
  const seeded = installPreset(saved, __WORD_ATLAS_PRESET__);
  if (seeded !== saved) {
    try { localStorage.setItem(CATALOG_KEY, JSON.stringify(seeded)); }
    catch { /* The supplied deck is still available for this visit. */ }
  }
  return seeded;
}

let state: CatalogState = initialCatalog();
const listeners = new Set<() => void>();
const announce = () => listeners.forEach((fn) => fn());
function commit(next: CatalogState) {
  // Never show a successful edit if localStorage rejected it.
  localStorage.setItem(CATALOG_KEY, JSON.stringify(next));
  state = next;
  announce();
}
export const newDeckId = () => "deck-" + crypto.randomUUID();
export const customDatasetId = (deckId: string) => "my-word-atlas:deck:" + deckId;

export const customCatalog = {
  getSnapshot: () => state,
  subscribe: (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); },
  create(name: string): string {
    const label = cutoff(name.trim(), 80);
    if (!label) throw new Error("請先輸入詞庫名稱。");
    const id = newDeckId();
    if (state.decks.length >= MAX_DECKS) throw new Error("最多可儲存 60 個詞庫。");
    commit({ ...state, decks: [...state.decks, { id, name: label, words: [] }] });
    return id;
  },
  select(id: string | null) {
    if (id && !state.decks.some((d) => d.id === id && d.words.length))
      throw new Error("詞庫沒有單字，請先匯入或新增單字。");
    commit({ ...state, activeId: id });
  },
  addRestored(decks: PersonalDeck[]) {
    if (state.decks.length + decks.length > MAX_DECKS) throw new Error("還原會超過 60 個詞庫的上限。");
    commit({ ...state, decks: [...state.decks, ...decks] });
  },
  rename(id: string, name: string) {
    const label = cutoff(name.trim(), 80);
    if (!label) throw new Error("名稱不能空白。");
    commit({ ...state, decks: state.decks.map((d) => d.id === id ? { ...d, name: label } : d) });
  },
  remove(id: string) {
    commit({ ...state, activeId: state.activeId === id ? null : state.activeId, decks: state.decks.filter((d) => d.id !== id) });
  },
  put(id: string, raw: unknown) {
    const w = parseWord(raw);
    if (!w) throw new Error("必須有英文及中文意思。");
    const found = state.decks.find((d) => d.id === id);
    if (!found) throw new Error("詞庫不存在。");
    const previous = found.words.find((x) => key(x.word) === key(w.word));
    const words = previous ? found.words.map((x) => x.id === previous.id ? { ...w, id: previous.id } : x) : [...found.words, w];
    if (words.length > MAX_WORDS) throw new Error("每個詞庫最多 5,000 個單字。");
    commit({ ...state, decks: state.decks.map((d) => d.id === id ? { ...d, words } : d) });
    return w;
  },
  merge(id: string, entries: PersonalWord[]): { added: number; existing: number } {
    const found = state.decks.find((d) => d.id === id);
    if (!found) throw new Error("詞庫不存在。");
    const existing = new Set(found.words.map((w) => key(w.word)));
    const additions = entries.filter((w) => {
      const k = key(w.word);
      if (existing.has(k)) return false;
      existing.add(k);
      return true;
    });
    if (found.words.length + additions.length > MAX_WORDS) throw new Error("超過詞庫上限 5,000 個詞條。");
    commit({ ...state, decks: state.decks.map((d) => d.id === id ? { ...d, words: [...d.words, ...additions] } : d) });
    return { added: additions.length, existing: entries.length - additions.length };
  },
  deleteWord(deckId: string, wordId: string) {
    const decks = state.decks.map((d) => d.id === deckId ? { ...d, words: d.words.filter((w) => w.id !== wordId) } : d);
    const activeId = decks.some((d) => d.id === state.activeId && d.words.length) ? state.activeId : null;
    commit({ ...state, activeId, decks });
  },
};

if (typeof window !== "undefined") window.addEventListener("storage", (e) => {
  if (e.key === CATALOG_KEY) { state = readCatalog(); announce(); }
});
