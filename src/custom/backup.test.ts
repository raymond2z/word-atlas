import assert from "node:assert/strict";
import test from "node:test";
import { parsePersonalBackup } from "./backup";
import { importVocabulary } from "./catalog";
import { Rating, review } from "../store/srs";

test("saved translations handle an auto-detected English row targeting Cantonese", () => {
  const result = importVocabulary("偵測語言,粵語,adapt,適應\n中文 (繁體),英文,證據,evidence", "saved.csv");
  assert.deepEqual(result.words.map((word) => word.word), ["adapt", "evidence"]);
  assert.equal(result.skipped, 0);
});

test("restores source context and individual schedules with remapped word IDs", () => {
  const card = review(undefined, Rating.Good, Date.parse("2025-01-01"));
  const context = {
    sentence: "We need a versatile tool.",
    url: "https://example.com/lesson",
    note: "STEM notes",
  };
  const plan = parsePersonalBackup({
    format: "my-word-atlas-personal-backup",
    version: 2,
    deck: { id: "test-deck", name: "Sample", words: [{ id: "old-id", word: "versatile", zh: "用途廣泛", context }] },
    progress: {
      version: 2, datasetId: "my-word-atlas:deck:test-deck", cards: { "old-id": card },
      skills: { "old-id": { meaning: { card, outcome: "independent" } }, "deleted-id": { listen: { card, outcome: "missed" } } },
    },
  });
  assert.ok(plan);
  const [{ deck, progress }] = plan.decks;
  const [word] = deck.words;
  assert.deepEqual(word.context, context);
  assert.deepEqual(progress.skills, { [word.id]: { meaning: { card, outcome: "independent" } } });
  assert.deepEqual(progress.cards, { [word.id]: card });
  assert.equal(importVocabulary(JSON.stringify([{ ...word, context: { url: "javascript:void(0)" } }])).words[0].context, undefined);
});

test("V1.4.1 migration replays timestamped ratings into independent FSRS cards", () => {
  const first = "2025-02-05T10:00:00.000Z";
  const second = "2025-02-07T10:00:00.000Z";
  const word = { id: "old-id", w: "resilient", senses: [{ zh: "有韌性的", en: "able to recover" }] };
  const plan = parsePersonalBackup({
    format: "my-word-atlas-backup-v1",
    state: {
      schema: 1,
      decks: {
        first: { title: "First", words: [word] },
        second: { title: "Second", words: [word] },
      },
      progress: {
        "first::old-id": { scheduler: "basic", events: [
          { at: second, grade: Rating.Again }, { at: first, grade: Rating.Good }, { at: first, grade: 999 },
        ] },
        "second::old-id": { events: [{ at: "invalid", grade: Rating.Good }] },
        "removed::id": { events: [{ at: first, grade: Rating.Good }] },
      },
    },
  });
  assert.ok(plan?.legacy);
  assert.equal(plan.reviews, 2);
  assert.equal(plan.skippedRecords, 2);
  const [a, b] = plan.decks;
  const [entry] = a.deck.words;
  assert.equal(entry.definition, "able to recover");
  const expected = review(review(undefined, Rating.Good, Date.parse(first)), Rating.Again, Date.parse(second));
  assert.deepEqual(a.progress.cards, { [entry.id]: expected });
  assert.deepEqual(b.progress.cards, {});
  assert.notEqual(a.progress.datasetId, b.progress.datasetId);
  assert.deepEqual(a.progress.mistakes, [entry.id]);
});
