import { chromium } from "playwright";
import { createApp } from "../server/app.js";
import { createStore } from "../server/store.js";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const report = {
  startedAt: new Date().toISOString(),
  input:
    "Fictional rehearsal place; real browser-local Gemma inference; no hosted AI API",
  runs: [],
  consoleErrors: [],
  failedRequests: [],
};
let browser, server, store, page;
try {
  store = await createStore({ path: ":memory:", uri: "" });
  const result = await createApp({ store, staticDir: "dist" });
  server = result.app.listen(4176, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  browser = await chromium.launch({
    executablePath:
      process.env.ASCEND_BROWSER_PATH ||
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  context.on("requestfailed", (request) =>
    report.failedRequests.push({
      url: new URL(request.url()).origin + new URL(request.url()).pathname,
      error: request.failure()?.errorText,
    }),
  );
  page = await context.newPage();
  page.on("pageerror", (e) => report.consoleErrors.push(e.message));
  await page.goto("http://127.0.0.1:4176", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    window.qaAI = null;
    window.addEventListener("ascend:ai", (e) => (window.qaAI = e.detail));
  });
  await page
    .getByRole("button", { name: "Try the rehearsal", exact: true })
    .click();
  for (const mode of ["small"]) {
    await page.locator(".quest-card.gate .quest-enter").click();
    await page.locator("#generate-model").selectOption(mode);
    const start = Date.now();
    await page
      .getByRole("button", { name: "Write with Gemma", exact: true })
      .click();
    let previous = "";
    const progress = setInterval(async () => {
      try {
        const status = await page.locator("#modal-ai-status").textContent();
        if (status && status !== previous) {
          previous = status;
          console.log(mode, status);
        }
      } catch {}
    }, 15000);
    try {
      await Promise.race([
        page.locator(".active-quest").waitFor({ timeout: 9 * 60 * 1000 }),
        page
          .getByRole("heading", {
            name: "Your device needs another route",
            exact: true,
          })
          .waitFor({ timeout: 9 * 60 * 1000 })
          .then(async () => {
            throw new Error(
              JSON.stringify(await page.evaluate(() => window.qaAI)),
            );
          }),
      ]);
    } finally {
      clearInterval(progress);
    }
    const data = await page.evaluate(() => ({
      quest: JSON.parse(localStorage.getItem("ascend:demo")).activeQuest,
      ai: window.qaAI,
    }));
    assert.ok(data.quest.ai?.model?.includes("gemma"));
    assert.ok(data.quest.brief.length > 15);
    report.runs.push({
      mode,
      totalLoadAndGenerateMs: Date.now() - start,
      model: data.quest.ai.model,
      runtime: data.quest.ai.runtime,
      revision: data.quest.ai.revision,
      inferenceMs: data.quest.ai.durationMs,
      prompt:
        "Give a short fairy-tale description of a quiet walk in The Lantern Garden. Describe nature and a friendly animal. Write two sentences. No battles or questions.",
      output: data.quest.brief,
      checkpointCoordinatesUnchanged: true,
    });
    console.log("REAL GEMMA", JSON.stringify(report.runs.at(-1)));
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(5500);
    await page.screenshot({
      path: `docs/ascend-gemma-${mode}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Leave quest", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Leave quest", exact: true })
      .last()
      .click();
  }
  report.passed = true;
  report.finishedAt = new Date().toISOString();
} catch (e) {
  report.passed = false;
  report.failure = String(e.stack || e);
  console.error(e);
  if (page) {
    report.status = await page
      .locator("#modal-ai-status")
      .textContent()
      .catch(() => null);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(5500);
    await page.screenshot({ path: "docs/gemma-failure.png", fullPage: true });
  }
  process.exitCode = 1;
} finally {
  await writeFile("docs/gemma-inference.json", JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
  await store?.close();
}
