// End-to-end walkthrough that captures screenshots of every screen.
// Usage: start the app (npm run build && npm run start -- -p 3123), then
//   node scripts/screenshots.mjs [baseUrl]
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3123";
const OUT = new URL("../screenshots/", import.meta.url).pathname;

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  mobile: { width: 390, height: 844 },
};

const SAMPLE = `DATABASE_URL=postgres://app:s3cr3t-p4ss@db.internal:5432/prod
STRIPE_SECRET_KEY=sk_live_51Hx…redacted
# rotate after use — this link burns after reading`;

const problems = [];

function watch(page, label) {
  page.on("console", (msg) => {
    if (msg.type() === "error") problems.push(`[${label}] console error: ${msg.text()}`);
  });
  page.on("pageerror", (err) => problems.push(`[${label}] page error: ${err.message}`));
  page.on("requestfailed", (req) => {
    // Navigations aborted by reloads are expected; anything else is not.
    const failure = req.failure()?.errorText ?? "";
    if (failure.includes("ERR_ABORTED")) return;
    problems.push(`[${label}] request failed: ${req.url()} (${failure})`);
  });
}

async function newPage(browser, viewport, label) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    isMobile: viewport.width < 600,
    hasTouch: viewport.width < 600,
    colorScheme: "light",
  });
  const page = await context.newPage();
  watch(page, label);
  return { context, page };
}

async function shot(page, name) {
  // Let toasts/animations settle so screenshots are stable.
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  console.log(`  ✓ ${name}.png`);
}

async function run(browser, vp) {
  const viewport = VIEWPORTS[vp];
  console.log(`${vp} (${viewport.width}x${viewport.height})`);

  // Creator context: type, create, and grab the share link.
  const creator = await newPage(browser, viewport, `${vp}/creator`);
  await creator.page.goto(BASE, { waitUntil: "networkidle" });
  await creator.page.getByTestId("create-textarea").fill(SAMPLE);
  await shot(creator.page, `${vp}-1-create`);

  await creator.page.getByTestId("create-button").click();
  const linkInput = creator.page.getByTestId("share-link");
  await linkInput.waitFor({ state: "visible", timeout: 15_000 });
  const link = await linkInput.inputValue();
  if (!/\/p\/[^#]+#.+/.test(link)) throw new Error(`Unexpected share link: ${link}`);
  await shot(creator.page, `${vp}-2-share`);

  // Recipient context: fresh sessionStorage, so no own-link confirm.
  const recipient = await newPage(browser, viewport, `${vp}/recipient`);
  await recipient.page.goto(link, { waitUntil: "networkidle" });
  await recipient.page.getByTestId("reveal-button").waitFor({ state: "visible" });
  await shot(recipient.page, `${vp}-3-gate`);

  await recipient.page.getByTestId("reveal-button").click();
  const revealed = recipient.page.getByTestId("revealed-content");
  await revealed.waitFor({ state: "visible", timeout: 15_000 });
  const content = await revealed.textContent();
  if (content !== SAMPLE) throw new Error(`Decrypted content mismatch:\n${content}`);
  await shot(recipient.page, `${vp}-4-revealed`);

  await recipient.page.reload({ waitUntil: "networkidle" });
  await recipient.page.getByTestId("reveal-button").click();
  await recipient.page
    .getByText("This paste is gone")
    .waitFor({ state: "visible", timeout: 15_000 });
  await shot(recipient.page, `${vp}-5-gone`);

  await recipient.page.goto(link.split("#")[0], { waitUntil: "networkidle" });
  await recipient.page.getByText("Missing key in the link").waitFor({ state: "visible" });
  await shot(recipient.page, `${vp}-6-missing-key`);

  if (vp === "desktop") {
    await creator.page.goto(`${BASE}/how-it-works`, { waitUntil: "networkidle" });
    await shot(creator.page, `${vp}-7-how-it-works`);

    // Own-link confirm: a second paste opened in the creator's own context.
    await creator.page.goto(BASE, { waitUntil: "networkidle" });
    await creator.page.getByTestId("create-textarea").fill("note to self");
    await creator.page.getByTestId("create-button").click();
    await linkInput.waitFor({ state: "visible", timeout: 15_000 });
    const ownLink = await linkInput.inputValue();
    await creator.page.goto(ownLink, { waitUntil: "networkidle" });
    await creator.page.getByTestId("reveal-button").click();
    await creator.page.getByText("Open your own link?").waitFor({ state: "visible" });
    // Dialog is position:fixed; viewport-only capture shows it centered.
    await creator.page.waitForTimeout(400);
    await creator.page.screenshot({ path: `${OUT}${vp}-8-own-link-confirm.png` });
    console.log(`  ✓ ${vp}-8-own-link-confirm.png`);
  }

  await creator.context.close();
  await recipient.context.close();
}

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const vp of Object.keys(VIEWPORTS)) await run(browser, vp);
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`\n✗ ${problems.length} browser problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("\nAll screenshots captured with no console errors.");
