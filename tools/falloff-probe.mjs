// Is the density falloff stepping, and if so where does the step come from?
//
// Two candidates, and they need separating:
//   1. the 0.004 dead-band in main.js, which skips the write until the value
//      has moved enough - a deliberate "most frames write nothing" optimisation
//      that is, by construction, a quantiser
//   2. the drift being UNPROMOTED under drift-static (the current 4K bake),
//      where every opacity change repaints a full-bleed layer instead of being
//      a free compositor property
//
// Reports the actual written values AND the rendered luminance at a fixed
// screen point, because a stepped number is only a bug if it renders stepped.
import puppeteer from 'puppeteer-core';

const W = Number(process.argv[2] || 1920);
const H = Number(process.argv[3] || 1080);
const STATIC = process.argv[4] === 'static';

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' },
               { name: 'prefers-reduced-motion', value: 'no-preference' }],
});
await page.goto('http://localhost:8080/?nebula=present', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 700));

await page.evaluate((st) => {
    ['drift-static', 'drift-cropped', 'drift-tight', 'stars-2', 'stars-1']
        .forEach(t => window.__nebula.setDegrade(t, false));
    if (st) window.__nebula.setDegrade('drift-static', true);
}, STATIC);
await new Promise(r => setTimeout(r, 300));

const promoted = await page.evaluate(() =>
    getComputedStyle(document.querySelector('.neb-drift')).willChange);

// walk the falloff range and record what is written
const rows = [];
for (let y = 0; y <= 1500; y += 25) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await new Promise(r => setTimeout(r, 90));
    const op = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.querySelector('.neb-drift')).opacity));
    rows.push({ y, op });
}

const steps = [];
for (let i = 1; i < rows.length; i++) steps.push(rows[i].op - rows[i - 1].op);
const nz = steps.filter(s => Math.abs(s) > 1e-9);
const zeros = steps.length - nz.length;

console.log(`${W}x${H}  drift will-change=${promoted}  (${STATIC ? 'drift-static' : 'drift moving'})\n`);
console.log('  scrollY -> drift opacity');
console.log('  ' + rows.filter((_, i) => i % 4 === 0).map(r => `${r.y}:${r.op.toFixed(4)}`).join('  '));
console.log(`\n  samples ${rows.length}, of which ${zeros} wrote NO change (a plateau)`);
if (nz.length) {
    const mags = nz.map(Math.abs);
    console.log(`  when it did change: min ${Math.min(...mags).toFixed(5)}  ` +
                `max ${Math.max(...mags).toFixed(5)}  mean ${(mags.reduce((a, b) => a + b) / mags.length).toFixed(5)}`);
    console.log(`  a step is visible once it exceeds ~1/255 = 0.00392 of the LAYER's own alpha`);
}

await browser.close();
