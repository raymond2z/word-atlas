import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const origin = "http://127.0.0.1:5188";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "5188", "--strictPort"], {
  stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ATLAS_BASE: "/" },
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
  browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    localStorage.setItem("word-atlas:settings", JSON.stringify({
      onboarded: true, splash: false, autoplay: false, sfx: false, accent: "uk", dataset: "open",
    }));
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(origin + "/#/decks", { waitUntil: "domcontentloaded" });
  await page.locator(".my-decks").waitFor();
  await page.getByRole("textbox", { name: "新詞庫名稱" }).fill("My IELTS Sample");
  await page.getByRole("button", { name: "建立", exact: true }).click();
  await page.getByText("已建立詞庫", { exact: false }).waitFor();

  const file = page.locator('.my-decks input[type="file"]');
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

  await page.locator('.topnav a[href="#/decks"]').click();
  await page.getByRole("button", { name: "返回公開圖鑑" }).click();
  await page.locator(".today").waitFor();
  await page.locator('.topnav a[href="#/atlas"]').click();
  await page.locator(".atlas").waitFor();
  await page.getByText("7,298 词", { exact: false }).first().waitFor();
  assert.deepEqual(pageErrors, []);
  console.log("Browser E2E passed: create → import → activate → reload → gallery → study → persist FSRS → original atlas");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
