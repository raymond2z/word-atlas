import assert from "node:assert/strict";
import test from "node:test";
import { importVocabulary, makeCustomAtlas, parseCSV, type PersonalDeck } from "./catalog";

test("CSV parser supports BOM, quoted commas, escaped quotes and newlines", () => {
  const rows = parseCSV('\uFEFFword,zh,example\n"well-being","幸福，福祉","She said ""hello"",\nthen left."');
  assert.deepEqual(rows[0], ["word", "zh", "example"]);
  assert.equal(rows[1][0], "well-being");
  assert.equal(rows[1][1], "幸福，福祉");
  assert.equal(rows[1][2], 'She said "hello",\nthen left.');
});

test("Google Translate CSV supports English-Chinese and reversed rows", () => {
  const csv = "英文,中文 (繁體),versatile,多才多藝的\n中文 (繁體),英文,堅韌的,resilient\n英文,中文 (繁體),versatile,用途廣泛的";
  const result = importVocabulary(csv, "saved-translations.csv");
  assert.deepEqual(result.words.map((w) => w.word), ["versatile", "resilient"]);
  assert.equal(result.words[1].zh, "堅韌的");
  assert.equal(result.duplicates, 1);
  assert.equal(result.skipped, 0);
});

test("Two-column and standard header CSV are accepted without optional fields", () => {
  const standard = importVocabulary("word,zh\nalgorithm,演算法", "words.csv");
  assert.equal(standard.words[0].cefr, "B1");
  assert.equal(standard.words[0].zh, "演算法");
  const backwards = importVocabulary("環境,environment", "words.csv");
  assert.equal(backwards.words[0].word, "environment");
});

test("Word Atlas JSON entries retain senses, examples and collocations", () => {
  const result = importVocabulary(JSON.stringify([{ id: "resilient", w: "resilient", cefr: "B2",
    senses: [{ pos: "adj.", zh: "有韌性的", en: "able to recover" }],
    ex: [{ en: "The resilient community rebuilt.", zh: "社區重建了。" }],
    col: ["resilient community"] }]), "atlas.json");
  assert.equal(result.words[0].word, "resilient");
  assert.equal(result.words[0].pos, "adj.");
  assert.equal(result.words[0].example, "The resilient community rebuilt.");
  assert.deepEqual(result.words[0].collocations, ["resilient community"]);
});

test("V1.4 backup imports word content without treating its progress as FSRS", () => {
  const backup = { format: "my-word-atlas-v1", state: { decks: {
    one: { words: [{ w: "analyze", senses: [{ zh: "分析", pos: "v." }] }] },
  }, stats: { analyze: { due: 1 } } } };
  const result = importVocabulary(JSON.stringify(backup), "legacy.json");
  assert.equal(result.words.length, 1);
  assert.equal(result.words[0].word, "analyze");
});

test("Reject incomplete records, mixed empty rows and broken JSON", () => {
  const result = importVocabulary("word,zh\nvalid,有效\ninvalid,", "words.csv");
  assert.equal(result.words.length, 1);
  assert.equal(result.skipped, 1);
  assert.throws(() => importVocabulary("{missing}", "words.json"), /JSON/);
});

test("Personal atlas adapter creates valid, ordered refs and cached entries", async () => {
  const item = importVocabulary("word,zh,cefr,topic\nresilient,堅韌的,B2,IELTS\nflexible,靈活的,B1,IELTS").words;
  const deck: PersonalDeck = { id: "class-1", name: "IELTS practice", words: item };
  const atlas = makeCustomAtlas(deck);
  assert.equal(atlas.id, "my-word-atlas:deck:class-1");
  assert.equal(atlas.words.length, 2);
  assert.equal(atlas.words[0].topic, 0);
  assert.equal(atlas.words[0].cefr, 3);
  assert.equal(atlas.byId.get(item[0].id)?.order, 0);
  assert.equal((await atlas.entry(item[0].id)).senses[0].zh, "堅韌的");
  assert.equal(atlas.img(atlas.words[0]), null);
  assert.equal(atlas.audio(atlas.words[0], "uk"), null);
});

test("Custom media must be HTTPS", () => {
  const result = importVocabulary(JSON.stringify([{ w: "sunrise", zh: "日出", imageUrl: "javascript:alert(1)",
    audioUkUrl: "https://example.org/sunrise.mp3" }]), "words.json");
  const atlas = makeCustomAtlas({ id: "m", name: "m", words: result.words });
  assert.equal(atlas.img(atlas.words[0]), null);
  assert.equal(atlas.audio(atlas.words[0], "uk"), "https://example.org/sunrise.mp3");
});
