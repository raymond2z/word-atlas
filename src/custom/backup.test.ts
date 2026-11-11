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
