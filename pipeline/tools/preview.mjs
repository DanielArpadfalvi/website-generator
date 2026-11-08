// Email-előnézeti kép készítése egy demo oldal első képernyőjéről.
// Használat:
//   cd pipeline/tools && npm install && node preview.mjs ../../<slug>/index.html ../../<slug>/preview.jpg
// A Google Fonts helyett a @fontsource csomagok betűtípusait tölti be (a felhős környezet nem éri el a fonts.googleapis.com-ot).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [, , input, output = 'preview.jpg'] = process.argv;
if (!input) { console.error('Használat: node preview.mjs <index.html> [kimenet.jpg]'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const fsrc = path.join(here, 'node_modules', '@fontsource');

// Minden telepített @fontsource család latin + latin-ext fájljaiból @font-face
let css = '';
if (fs.existsSync(fsrc)) {
  for (const pkg of fs.readdirSync(fsrc)) {
    const dir = path.join(fsrc, pkg, 'files');
    if (!fs.existsSync(dir)) continue;
    const family = pkg.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    for (const f of fs.readdirSync(dir)) {
      const m = f.match(/-(latin|latin-ext)-(\d{3})-(normal|italic)\.woff2$/);
      if (!m) continue;
      const range = m[1] === 'latin' ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
                                     : 'U+0100-02AF,U+0304,U+0308,U+0329,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF';
      css += `@font-face{font-family:"${family}";font-style:${m[3]};font-weight:${m[2]};src:url("${pathToFileURL(path.join(dir, f))}") format("woff2");unicode-range:${range};}\n`;
    }
  }
}

const exe = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => fs.existsSync(p));
const browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 720, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.resolve(input)).href, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
if (css) await page.addStyleTag({ content: css });
// a térkép iframe és egyéb külső elemek ne zavarjanak
await page.addStyleTag({ content: 'iframe{visibility:hidden}' });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: output, type: 'jpeg', quality: 82, clip: { x: 0, y: 0, width: 1200, height: 720 } });
await browser.close();
console.log('Kész:', output);
