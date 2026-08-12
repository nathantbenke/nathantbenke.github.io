// Screenshot rig for the v1.1 nebula experiment.
// Forces dark mode (headless Chrome otherwise reports prefers-color-scheme:
// light, which is this site's *other* theme and has no nebula at all).
//
// Usage: node tools/nebula-shots.mjs <outPrefix> [presetOrEmpty] [url]
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const PREFIX = process.argv[2] || 'shot';
const PRESET = process.argv[3] || '';
const URL = process.argv[4] || 'http://localhost:8080/';
const OUT = 'tools/shots';

await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const cdp = await page.createCDPSession();
await cdp.send('Emulation.setEmulatedMedia', {
    features: [
        { name: 'prefers-color-scheme', value: 'dark' },
        { name: 'prefers-reduced-motion', value: 'no-preference' },
    ],
});

await page.goto(URL, { waitUntil: 'networkidle0' });

if (PRESET) {
    await page.evaluate((p) => document.documentElement.setAttribute('data-nebula', p), PRESET);
}

// Kill the ticker's caret churn so shots are deterministic.
await new Promise(r => setTimeout(r, 600));

const height = await page.evaluate(() => document.documentElement.scrollHeight);
const stops = [0, 900, 2600, 4200, Math.max(0, height - 1000)];

for (let i = 0; i < stops.length; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), stops[i]);
    // let the rAF parallax settle
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/${PREFIX}-${i}-y${stops[i]}.png` });
}

console.log(`${PREFIX}: pageHeight=${height} stops=${stops.join(',')}`);

// Report where each parallax layer actually sits at max scroll, so we can see
// whether a layer has translated itself off the top of the viewport.
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await new Promise(r => setTimeout(r, 400));
const boxes = await page.evaluate(() =>
    ['.bg-nebula', '.bg-stars-1', '.bg-stars-2', '.bg-stars-3'].map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return `${sel}: absent`;
        const r = el.getBoundingClientRect();
        return `${sel}: top=${r.top.toFixed(0)} bottom=${r.bottom.toFixed(0)} (viewport 0..${window.innerHeight})`;
    })
);
console.log('  at max scroll:\n    ' + boxes.join('\n    '));

await browser.close();
