import type { Atlas, WordRef } from "../atlas/types";
import { MEDIA } from "../atlas/types";
import { hashSeed, normalize, shuffle } from "../lib/text";
import { isMastered, review, Rating, type Grade } from "./srs";
import { bumpDay, dayKey, REVIEW_SKILLS, store, type ActiveSession, type AnswerOutcome, type Progress, type QuizKind, type ReviewSkill, type Settings, type Step } from "./store";

export function dueIds(p: Progress, now = Date.now()) {
  return Object.entries(p.cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([id]) => id);
}

export function newToday(p: Progress) {
  return p.days[dayKey()]?.n ?? 0;
}

/** Next unseen words along the learning path, starting at the learner's level. */
export function nextNew(atlas: Atlas, p: Progress, settings: Settings, count: number) {
  const out: string[] = [];
  const pass = (from: number) => {
    for (const w of atlas.words) {
      if (out.length >= count) return;
      if (w.cefr < from || p.cards[w.id] || out.includes(w.id)) continue;
      out.push(w.id);
    }
  };
  pass(settings.startLevel);
  if (out.length < count) pass(0);
  return out;
}

export function todayPlan(atlas: Atlas, p: Progress, s: Settings) {
  const due = dueIds(p).filter((id) => atlas.byId.has(id));
  const newLeft = Math.max(0, s.dailyNew - newToday(p));
  const fresh = nextNew(atlas, p, s, newLeft);
  return { due, fresh, minutes: Math.max(1, Math.round(due.length * 0.25 + fresh.length * 0.9)) };
}

function quizKind(ref: WordRef, p: Progress, s: Settings, salt: number): QuizKind {
  const c = p.cards[ref.id];
  const hasImg = !!(ref.media & MEDIA.img);
  const roll = hashSeed(ref.id + salt) % 100;
  if (!c || c.s < 2) {
    if (hasImg && roll < 45) return "picture";
    return roll < 80 ? "meaning" : "listen";
  }
  if (s.spell && (c.s >= 4 || roll < 35)) return roll < 75 ? "spell" : hasImg ? "picture" : "listen";
  return roll < 50 ? "listen" : hasImg ? "picture" : "meaning";
}

/** Distractors that look plausible: same level, similar spelling or length, different meaning. */
export function distractors(atlas: Atlas, ref: WordRef, kind: QuizKind, seed: number) {
  const target = normalize(ref.word);
  const zhCore = ref.zh.replace(/^[a-z.]+\s*/, "").split(/[；;，,]/)[0];
  const scored: [number, WordRef][] = [];
  const pool = atlas.words;
  const start = Math.max(0, ref.order - 400);
  for (let i = start; i < Math.min(pool.length, ref.order + 400); i++) {
    const w = pool[i];
    if (w.id === ref.id || normalize(w.word) === target) continue;
    if (w.zh === ref.zh || (zhCore && w.zh.includes(zhCore))) continue;
    let score = hashSeed(w.id + seed) % 100;
    if (kind === "listen" || kind === "picture") {
      if (w.word[0]?.toLowerCase() === target[0]) score += 120;
      score += Math.max(0, 60 - Math.abs(w.word.length - target.length) * 20);
    } else {
      if (w.cefr === ref.cefr) score += 40;
      if (w.zh.split(" ")[0] === ref.zh.split(" ")[0]) score += 60; // same part of speech
    }
    scored.push([score, w]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const seen = new Set<string>();
  const picks: string[] = [];
  for (const [, w] of scored) {
    const key = kind === "meaning" ? w.zh : normalize(w.word);
    if (seen.has(key)) continue;
    seen.add(key);
    picks.push(w.id);
    if (picks.length === 3) break;
  }
  return shuffle([ref.id, ...picks], seed);
}

export function nextSkillReview(p: Progress, id: string, spell: boolean) {
  const wordCard = p.cards[id];
  if (!wordCard) return undefined;
  const skills = p.skills[id];
  // Older cards keep their original due date until we have evidence for a skill.
  // Once tested, queue the other skills within ten minutes of the first skill attempt.
  const introduced = Object.values(skills ?? {}).map(({ card }) => card.seen);
  const firstDue = introduced.length ? Math.min(...introduced) + 10 * 60_000 : wordCard.due;
  const options = REVIEW_SKILLS.filter((kind) => spell || kind !== "spell").map((kind) => {
    const tracked = skills?.[kind];
    const due = tracked?.card.due ?? firstDue;
    return { id, kind, due, tracked: !!tracked };
  });
  return options.sort((a, b) => a.due - b.due || Number(a.tracked) - Number(b.tracked))[0];
}

export function guidedPlan(atlas: Atlas, p: Progress, s: Settings, minutes: 5 | 10, extra?: number, now = Date.now()) {
  const due = Object.keys(p.cards)
    .filter((id) => atlas.byId.has(id))
    .map((id) => nextSkillReview(p, id, s.spell)!)
    .filter((item) => item.due <= now)
    .sort((a, b) => a.due - b.due);
  const review = due.slice(0, Math.floor(minutes * 60 / 18));
  const allowance = extra ?? Math.max(0, s.dailyNew - newToday(p));
  const freshCount = Math.min(allowance, minutes === 5 ? 3 : 6, Math.floor((minutes * 60 - review.length * 18) / 45));
  const fresh = atlas.kind === "private"
    ? atlas.words.filter((w) => !p.cards[w.id])
      .sort((a, b) => Number(!!b.hasExample) - Number(!!a.hasExample))
      .slice(0, freshCount).map((w) => w.id)
    : nextNew(atlas, p, s, freshCount);
  return { due, review, fresh };
}

export function buildGuidedSession(
  atlas: Atlas, p: Progress, s: Settings, minutes: 5 | 10, extra?: number,
): ActiveSession {
  const seed = Date.now();
  const { review: due, fresh: newIds } = guidedPlan(atlas, p, s, minutes, extra);
  const reviewIds = due.map(({ id }) => id);
  const steps: Step[] = due.map(({ id, kind }, i) => guidedQuestion(atlas, id, kind, seed + i));
  for (let start = 0; start < newIds.length; start += 3) {
    const group = newIds.slice(start, start + 3);
    steps.push(...group.map((id): Step => ({ id, kind: "intro" })));
    const recall = shuffle(group, seed + start);
    steps.push(...recall.map((id, i): Step => ({
      ...guidedQuestion(atlas, id, "meaning", seed + i), warmup: s.spell,
    })));
    if (s.spell) steps.push(...shuffle(group, seed + start + 1).map((id) => guidedQuestion(atlas, id, "spell", seed)));
  }
  return { id: `s${seed}`, started: seed, steps, index: 0, graded: {}, newIds, reviewIds, guided: true, outcomes: {} };
}

function guidedQuestion(atlas: Atlas, id: string, kind: QuizKind, seed: number): Extract<Step, { kind: QuizKind }> {
  const ref = atlas.byId.get(id)!;
  const options = kind === "spell" ? undefined : distractors(atlas, ref, "meaning", seed);
  return { id, kind, options };
}

export function guidedRecap(atlas: Atlas, session: ActiveSession): ActiveSession {
  const seed = Date.now();
  const added = new Set<string>();
  const steps = session.steps.flatMap((step): Step[] => {
    if (step.kind === "intro" || step.retry || !atlas.byId.has(step.id)) return [];
    const outcome = session.outcomes?.[step.id]?.[step.kind];
    const key = `${step.id}:${step.kind}`;
    if (!outcome || outcome === "independent" || added.has(key)) return [];
    added.add(key);
    return [guidedQuestion(atlas, step.id, step.kind, seed)];
  });
  return { id: `s${seed}`, started: seed, steps, index: 0, graded: {}, newIds: [], reviewIds: [], guided: true, practiceOnly: true, outcomes: {} };
}

export function buildSession(atlas: Atlas, p: Progress, s: Settings, opts?: { ids?: string[]; reviewOnly?: boolean }): ActiveSession {
  const seed = Date.now();
  const plan = todayPlan(atlas, p, s);
  const reviewIds = opts?.ids ? opts.ids.filter((id) => p.cards[id]) : plan.due.slice(0, 120);
  const newIds = opts?.ids ? opts.ids.filter((id) => !p.cards[id]) : opts?.reviewOnly ? [] : plan.fresh;
  const steps: Step[] = [];
  const quiz = (id: string, salt: number): Step => {
    const ref = atlas.byId.get(id)!;
    const kind = quizKind(ref, p, s, seed + salt);
    return { id, kind, options: kind === "spell" ? undefined : distractors(atlas, ref, kind, seed + salt) };
  };
  // Reviews first while attention is fresh, then new words in small groups:
  // meet five, then recall those five in a different order.
  reviewIds.forEach((id, i) => steps.push(quiz(id, i)));
  for (let g = 0; g < newIds.length; g += 5) {
    const group = newIds.slice(g, g + 5);
    group.forEach((id) => steps.push({ id, kind: "intro" }));
    shuffle(group, seed + g).forEach((id, i) => steps.push(quiz(id, 1000 + g + i)));
  }
  return { id: `s${seed}`, started: seed, steps, index: 0, graded: {}, newIds, reviewIds };
}

export function gradeFor(kind: QuizKind, correct: boolean, ms: number, hinted: boolean): Grade {
  if (!correct) return Rating.Again;
  if (hinted) return Rating.Hard;
  const slow = kind === "spell" ? 20000 : 9000;
  const fast = kind === "spell" ? 6000 : 2500;
  if (ms > slow) return Rating.Hard;
  if (ms < fast && kind === "spell") return Rating.Easy;
  return Rating.Good;
}

/** Update the skill on its first attempt and the original word card once per round. */
export function answer(atlas: Atlas, step: Step & { kind: QuizKind }, correct: boolean, grade: Grade, value: string, hinted = false) {
  const { settings } = store.get();
  store.progress((p) => {
    const sess = p.session;
    if (!sess || sess.pending || sess.steps[sess.index] !== step) return p;
    let next: Progress = { ...p, session: { ...sess, pending: { correct, value, hinted } } };
    if (sess.guided && !step.retry && !sess.outcomes?.[step.id]?.[step.kind]) {
      const outcome: AnswerOutcome = !correct ? "missed" : hinted ? "assisted" : "independent";
      const outcomes = { ...sess.outcomes, [step.id]: { ...sess.outcomes?.[step.id], [step.kind]: outcome } };
      next = { ...next, session: { ...next.session!, outcomes } };
      if (!sess.practiceOnly && step.kind !== "picture") {
        const skills = p.skills[step.id];
        const skill = { card: review(skills?.[step.kind]?.card, grade, Date.now(), settings.retention), outcome };
        next = { ...next, skills: { ...p.skills, [step.id]: { ...skills, [step.kind]: skill } } };
      }
    }
    const first = !(step.id in sess.graded) && !step.retry && !step.warmup && !sess.practiceOnly;
    if (first) {
      next = {
        ...next,
        cards: { ...next.cards, [step.id]: review(p.cards[step.id], grade, Date.now(), settings.retention) },
        session: { ...next.session!, graded: { ...sess.graded, [step.id]: grade } },
        mistakes: correct ? next.mistakes : [step.id, ...next.mistakes.filter((x) => x !== step.id)].slice(0, 300),
      };
      next = bumpDay(next, { r: 1, c: correct ? 1 : 0, n: sess.newIds.includes(step.id) ? 1 : 0 });
    }
    if (!correct || (sess.guided && hinted)) {
      // Practise it again a few steps later in another format; never re-graded.
      const steps = [...next.session!.steps];
      const retries = steps.filter((x) => x.id === step.id && "retry" in x && x.retry && (!sess.guided || x.kind === step.kind)).length;
      if (retries < (sess.guided ? 1 : 2)) {
        const ref = atlas.byId.get(step.id)!;
        const kind: QuizKind = sess.guided ? step.kind : step.kind === "meaning" ? (ref.media & MEDIA.img ? "picture" : "listen") : "meaning";
        const at = Math.min(steps.length, sess.index + 4);
        const retry = sess.guided ? guidedQuestion(atlas, step.id, kind, Date.now()) : { id: step.id, kind, options: distractors(atlas, ref, kind, Date.now()) };
        steps.splice(at, 0, { ...retry, retry: true });
        next = { ...next, session: { ...next.session!, steps } };
      }
    }
    return next;
  });
}

export function useTextQuestion(atlas: Atlas, step: Extract<Step, { kind: QuizKind }>) {
  store.progress((p) => {
    const session = p.session;
    if (!session || session.pending || session.steps[session.index] !== step) return p;
    const steps = [...session.steps];
    steps[session.index] = { ...guidedQuestion(atlas, step.id, "meaning", Date.now()), retry: step.retry, warmup: step.warmup };
    return { ...p, session: { ...session, steps } };
  });
}

/** Move to the next step; `seconds` is time spent on this step, capped so idle tabs don't inflate stats. */
export function advance(seconds: number) {
  store.progress((p) => {
    const s = p.session;
    if (!s) return p;
    const index = s.index + 1;
    const finished = index >= s.steps.length ? Date.now() : undefined;
    const next = bumpDay(p, { t: Math.max(0, Math.min(90, Math.round(seconds))) });
    return { ...next, session: { ...s, index, pending: undefined, finished } };
  });
}

export function sessionStats(s: ActiveSession) {
  const graded = Object.values(s.graded);
  const correct = graded.filter((g) => g !== Rating.Again).length;
  return { total: graded.length, correct, accuracy: graded.length ? Math.round((correct / graded.length) * 100) : 0 };
}

export function guidedStats(s: ActiveSession) {
  const counts = { independent: 0, assisted: 0, missed: 0 };
  for (const skills of Object.values(s.outcomes ?? {})) {
    for (const outcome of Object.values(skills)) if (outcome in counts) counts[outcome]++;
  }
  return counts;
}

export const masteredCount = (p: Progress) => Object.values(p.cards).filter(isMastered).length;

export const SKILL_LABELS: Record<ReviewSkill, string> = { meaning: "認義", listen: "聽辨", spell: "拼寫" };
