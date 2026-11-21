// Renders every app icon PNG from icon.svg: `node tools/icons.js`. The
// apps' icon sets are made from assets/ by @capacitor/assets in the build
// workflows. Needs Playwright with a Chromium, like tools/shots.js.
const fs = require("fs");
const path = require("path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "icon.svg"), "utf8");
const defs = src.match(/<defs>[\s\S]*?<\/defs>/)[0];
const glyph = src.match(/<g id="glyph"[\s\S]*<\/g>\s*(?=<\/svg>)/)[0];
const tile = (rx) => `<rect width="108" height="108"${rx ? ` rx="${rx}"` : ""} fill="url(#tile)"/>`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108">${defs}${body}</svg>`;

// Android shows the adaptive layers' middle 72 of 108 dp, masked to its own shape;
// at this scale the book's corners stay inside the round mask.
const FG_SCALE = 0.66;

const ICONS = [
  ["assets/icon-only.png", 1024, svg(tile(0) + glyph), true],
  ["assets/icon-background.png", 1024, svg(tile(0)), true],
  ["assets/icon-foreground.png", 1024, svg(`<g transform="translate(54 54) scale(${FG_SCALE}) translate(-54 -54)">${glyph}</g>`), false],
  ["icons/apple-touch-icon.png", 180, svg(tile(0) + glyph), true],
  ["icons/icon-192.png", 192, src, false],
  ["icons/icon-512.png", 512, src, false],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shoot = async (file, size, html, opaque, bg = "transparent") => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:${bg}">${html}</body>`);
    await page.screenshot({ path: path.join(ROOT, file), omitBackground: !opaque });
    console.log(file);
  };
  const sized = (s, w, h, style = "") => s.replace("<svg ", `<svg width="${w}" height="${h}" style="display:block;${style}" `);
  for (const [file, size, s, opaque] of ICONS) await shoot(file, size, sized(s, size, size), opaque);
  // Light splash: the icon, 400 px, in the middle of Paper. The dark one is plain.
  await shoot("assets/splash.png", 2732, sized(src, 400, 400, "margin:1166px"), true, "#F7F4EE");
  await browser.close();
})();
