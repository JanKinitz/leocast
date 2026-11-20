// Bildschirmfotos zur Layout-Prüfung: Sendungsseite und großer Player auf mehreren Handygrößen, jeweils nach dem Scrollen.
import { chromium } from "playwright";

const base = process.env.BASE || "http://127.0.0.1:3000";
const sizes = [
  { name: "a42", width: 412, height: 780 },
  { name: "klein", width: 360, height: 640 },
  { name: "sehrklein", width: 320, height: 560 },
];
const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
for (const s of sizes) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => console.log("pageerror:", e.message));
  await page.goto(`${base}/sendung/laluna`, { waitUntil: "load" });
  await page.waitForTimeout(6000);
  await page.mouse.wheel(0, 600);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `layout-${s.name}-sendung.png` });
  const tile = page.locator(".tile").first();
  if (await tile.count()) {
    await tile.click();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `layout-${s.name}-player.png` });
    await page.evaluate(() => document.querySelector(".dock-full.expanded")?.scrollBy(0, 2000));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `layout-${s.name}-player-gescrollt.png` });
  } else console.log(`${s.name}: keine Kachel gefunden`);
  await page.close();
}
await browser.close();
