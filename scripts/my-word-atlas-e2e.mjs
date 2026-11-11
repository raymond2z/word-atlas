import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const base = process.env.ATLAS_BASE || "/";
const origin = "http://127.0.0.1:5188" + base;
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", "5188", "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
server.stdout.on("data", (x) => { output += x.toString(); });
server.stderr.on("data", (x) => { output += x.toString(); });
async function ready() {
  for (let i = 0; i < 120; i++) {
    if (server.exitCode !== null) throw new Error("Vite terminated: " + output);
    try {
      const r = await fetch(origin);
      if (r.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Timed out waiting for Vite:\n" + output);
}

let browser;
try {
  await ready();
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE,
    headless: true, args: ["--disable-dev-shm-usage", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("word-atlas:settings", JSON.stringify({
      onboarded: true, splash: false, autoplay: false, sfx: false, accent: "uk", dataset: "open",
    }));
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin + "#/decks", { waitUntil: "domcontentloaded" });
  await page.locator(".my-decks").waitFor();
  await page.getByRole("textbox", { name: "新詞庫名稱" }).fill("My IELTS Sample");
  await page.getByRole("button", { name: "建立", exact: true }).click();
  await page.getByText("已建立詞庫", { exact: false }).waitFor();

  const file = page.getByLabel("詞庫 CSV 或 JSON");
  const csv = [
    "英文,中文 (繁體),versatile,多才多藝的",
    "中文 (繁體),英文,堅韌的,resilient",
    "英文,中文 (繁體),versatile,用途廣泛的",
    "英文,中文 (繁體),substantial,相當大的",
    "英文,中文 (繁體),evidence,證據",
  ].join("\n");
  await file.setInputFiles({ name: "saved-translations.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await page.getByText("成功新增 4 筆", { exact: false }).waitFor();
  assert.equal(await page.locator(".my-deck-word").count(), 4);
  await page.getByRole("button", { name: "使用此詞庫開始學習" }).click();
  await page.locator(".today").waitFor();
  const activeId = await page.evaluate(() => JSON.parse(localStorage.getItem("my-word-atlas:catalog:v1")).activeId);
  assert.ok(activeId);

  await page.reload();
  await page.locator(".today").waitFor();
  const reloadedId = await page.evaluate(() => JSON.parse(localStorage.getItem("my-word-atlas:catalog:v1")).activeId);
  assert.equal(reloadedId, activeId); // Selecting a deck does not write an empty FSRS file.
  await page.locator('.topnav a[href="#/atlas"]').click();
  await page.locator(".atlas").waitFor();
  await page.getByText("4 词", { exact: false }).first().waitFor();
  // Make a real first answer before checking FSRS persistence.
  await page.locator('.topnav a[href="#/"]').click();
  await page.getByRole("button", { name: /开始今天的旅程/ }).click();
  await page.locator(".intro").waitFor();
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: /认识了/ }).click();
  }
  await page.locator(".quiz .options button").first().click();
  await page.waitForFunction(() => {
    const k = Object.keys(localStorage).find((name) => name.startsWith("word-atlas:v2:my-word-atlas:deck:"));
    if (!k) return false;
    const data = JSON.parse(localStorage.getItem(k));
    return Object.keys(data.cards ?? {}).length === 1;
  });
  await page.reload();
  await page.waitForFunction(() => {
    const k = Object.keys(localStorage).find((name) => name.startsWith("word-atlas:v2:my-word-atlas:deck:"));
    return k && Object.keys(JSON.parse(localStorage.getItem(k)).cards ?? {}).length === 1;
  });

  // The focus-mode Learn screen hides the top nav; navigate by URL instead.
  await page.goto(origin + "#/decks", { waitUntil: "domcontentloaded" });
  await page.locator(".my-decks").waitFor();
  const backupDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "備份詞庫與進度" }).click();
  const backup = await readFile(await (await backupDownload).path());
  const saved = JSON.parse(backup);
  assert.equal(saved.deck.words.length, 4);
  assert.equal(Object.keys(saved.progress.cards).length, 1);
  assert.equal(saved.progress.session, null);
  await page.getByRole("button", { name: "返回公開圖鑑" }).click();
  await page.locator(".today").waitFor();
  await page.locator('.topnav a[href="#/atlas"]').click();
  await page.locator(".atlas").waitFor();
  await page.getByText("7,298 词", { exact: false }).first().waitFor();
  assert.deepEqual(pageErrors, []);

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
  });
  const phone = await mobile.newPage();
  const mobileErrors = [];
  const offlineFailures = [];
  phone.on("pageerror", (error) => mobileErrors.push(error.message));
  phone.on("requestfailed", (request) => offlineFailures.push([request.url(), request.failure()?.errorText]));
  await phone.goto(origin + "#/decks", { waitUntil: "domcontentloaded" });
  await phone.getByRole("heading", { name: "我的詞庫", exact: true }).waitFor();
  assert.equal(await phone.getByRole("dialog").count(), 0);
  const nav = await phone.locator(".tabbar a").evaluateAll((links) => links.map((el) => el.getBoundingClientRect().y));
  assert.equal(nav.length, 5);
  assert.equal(new Set(nav).size, 1);
  const importOnPhone = async (name, source, count) => {
    await phone.getByRole("textbox", { name: "新詞庫名稱" }).fill(name);
    await phone.getByRole("button", { name: "建立", exact: true }).click();
    await phone.getByLabel("詞庫 CSV 或 JSON").setInputFiles(source);
    await phone.getByRole("status").filter({ hasText: `成功新增 ${count} 筆` }).waitFor();
    await phone.locator(".my-deck-list").getByRole("button", { name: new RegExp(name + " · " + count) }).waitFor();
  };
  const sample = { name: "saved-translations.csv", mimeType: "text/csv", buffer: Buffer.from(csv) };
  const rawPath = process.env.WORD_ATLAS_RAW_CSV;
  await importOnPhone("Translation CSV", rawPath || sample, rawPath ? 306 : 4);
  if (rawPath) {
    await phone.getByRole("status").filter({ hasText: /檔內重複 3 筆、缺資料略過 0 筆/ }).waitFor();
    await phone.getByRole("button", { name: /載入更多/ }).click();
    assert.equal(await phone.locator(".my-deck-word").count(), 120);
  }
  const cleanPath = process.env.WORD_ATLAS_CLEAN_CSV;
  if (cleanPath) {
    await importOnPhone("Clean CSV", cleanPath, 306);
    const wordLists = await phone.evaluate(() => JSON.parse(localStorage.getItem("my-word-atlas:catalog:v1"))
      .decks.map((deck) => deck.words.map((word) => word.id)));
    assert.deepEqual(wordLists[0], wordLists[1]);
  }
  await phone.getByLabel("學習備份 JSON").setInputFiles({ name: "deck-backup.json", mimeType: "application/json", buffer: backup });
  await phone.getByRole("status").filter({ hasText: "已還原 1 個詞庫副本和 1 張 FSRS 詞卡" }).waitFor();
  await phone.getByRole("button", { name: "使用此詞庫開始學習" }).click();
  await phone.locator(".today").waitFor();
  const restored = await phone.evaluate(() => {
    const { activeId } = JSON.parse(localStorage.getItem("my-word-atlas:catalog:v1"));
    return JSON.parse(localStorage.getItem("word-atlas:v2:my-word-atlas:deck:" + activeId));
  });
  assert.notEqual(restored.datasetId, saved.progress.datasetId);
  assert.deepEqual(restored.cards, saved.progress.cards);
  await phone.waitForFunction(() => !!navigator.serviceWorker.controller);
  await mobile.setOffline(true);
  try {
    await phone.reload();
    await phone.locator(".today").waitFor({ timeout: 10000 });
  } catch (error) {
    console.error("Offline boot failed", {
      url: phone.url(),
      page: (await phone.locator("body").innerText().catch(() => "")).slice(0, 300),
      cached: await phone.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) =>
        (await (await caches.open(name)).keys()).map((request) => request.url)))).flat()).catch(() => []),
      errors: mobileErrors, requests: offlineFailures,
    });
    throw error;
  }
  assert.equal(await phone.getByRole("dialog").count(), 0);
  await phone.locator('.tabbar a[href="#/atlas"]').click();
  await phone.getByText("4 词", { exact: false }).first().waitFor();
  await phone.getByRole("button", { name: "星图视图" }).click();
  await phone.getByRole("img", { name: /词汇星图：4 颗星，已点亮 1 颗/ }).waitFor();
  await phone.locator('.tabbar a[href="#/"]').click();
  await phone.getByRole("button", { name: /开始今天的旅程/ }).click();
  await phone.locator(".intro, .quiz").waitFor();
  assert.deepEqual(mobileErrors, []);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  console.log("Browser E2E passed: desktop study, mobile import, exact FSRS restore on a separate browser context, and offline study");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
