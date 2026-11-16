// Bildschirmfotos der 3D-Figuren (für die Prüfung in GitHub Actions)
import { chromium } from "playwright";

const base = process.env.BASE || "http://127.0.0.1:3000";
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
page.on("console", (m) => !m.text().includes("503") && console.log("console:", m.text()));
page.on("pageerror", (e) => console.log("pageerror:", e.message));
for (const teil of [1, 2]) {
  await page.goto(`${base}/figuren?teil=${teil}`, { waitUntil: "load" });
  await page.waitForTimeout(6000);
  const n = await page.locator(".figure-tile.is-3d").count();
  console.log(`Teil ${teil}: ${n} Figuren in 3D`);
  await page.screenshot({ path: `figuren-${teil}.png`, fullPage: true });
}
// Antippen testen
await page.locator(".figure-tile").first().click();
await page.waitForTimeout(400);
await page.screenshot({ path: "figuren-tap.png" });
await browser.close();
