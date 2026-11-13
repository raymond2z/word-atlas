import assert from "node:assert/strict";
import test from "node:test";
import { makeCustomAtlas, parseWord } from "../custom/catalog";
import { advance, answer, buildGuidedSession, guidedPlan, guidedRecap, nextSkillReview } from "./session";
import { Rating, review } from "./srs";
import { defaultSettings, emptyProgress, sanitizeProgress, store } from "./store";

test("a legacy word enters skill review at its original due date", () => {
  const word = parseWord({ word: "adapt", zh: "適應" })!;
  const atlas = makeCustomAtlas({ id: "legacy", name: "Legacy", words: [word] });
  const card = review(undefined, Rating.Good, 1_700_000_000_000);
  const progress = sanitizeProgress({ version: 2, cards: { [word.id]: card } }, atlas.id);
  assert.deepEqual(progress.skills, {});
  assert.deepEqual(guidedPlan(atlas, progress, defaultSettings, 5, undefined, card.due - 1).due, []);
  assert.equal(guidedPlan(atlas, progress, defaultSettings, 5, undefined, card.due).due[0]?.kind, "meaning");
});

test("guided learning tracks skills separately and retries leave the schedules unchanged", () => {
  const word = parseWord({ word: "adapt", zh: "適應" })!;
  const other = parseWord({ word: "evidence", zh: "證據" })!;
  const atlas = makeCustomAtlas({ id: "skill-test", name: "Sample", words: [word, other] });
  const priorWindow = globalThis.window;
  globalThis.window = { setTimeout: () => 0, clearTimeout: () => {} } as unknown as Window & typeof globalThis;
  try {
    const progress = emptyProgress(atlas.id);
    const session = buildGuidedSession(atlas, progress, { ...defaultSettings, dailyNew: 1 }, 5);
    store.progress(() => ({ ...progress, session }));
    advance(1);
    const meaning = store.get().progress.session!.steps[1];
    assert.equal(meaning.kind, "meaning");
    answer(atlas, meaning, true, Rating.Good, word.id);
    advance(1);
    const spell = store.get().progress.session!.steps[2];
    assert.equal(spell.kind, "spell");
    answer(atlas, spell, false, Rating.Again, "adopt");
    advance(1);
    const saved = store.get().progress;
    assert.equal(saved.skills[word.id].meaning?.outcome, "independent");
    assert.equal(saved.skills[word.id].spell?.outcome, "missed");
    assert.equal(nextSkillReview(saved, word.id, true)?.kind, "spell");
    assert.notEqual(nextSkillReview(saved, word.id, false)?.kind, "spell");
    const retry = saved.session!.steps[3];
    assert.ok("retry" in retry && retry.retry);
    answer(atlas, retry, true, Rating.Good, "adapt");
    advance(1);
    const recap = guidedRecap(atlas, store.get().progress.session!);
    store.progress((p) => ({ ...p, session: recap }));
    const extra = recap.steps[0];
    if (extra.kind === "intro") throw new Error("Expected a question");
    answer(atlas, extra, true, Rating.Good, "adapt");
    assert.deepEqual(store.get().progress.skills, saved.skills);
    assert.deepEqual(store.get().progress.cards, saved.cards);
  } finally {
    globalThis.window = priorWindow;
  }
});
