// Attributing hero-region raster cost at a LARGE viewport.
//
// Reported symptom: scroll jank that scales with viewport height, smooth at
// quarter-height on a 4K and bad above half - the fingerprint of something big
// re-rasterising in proportion to how much screen it covers.
//
// The named cause (a 2200px hero-bloom.png at 130vw) does not exist in this
// repo: there is no *bloom* asset at all, and the largest image on the site is
// portrait-hero-900.webp at 900px / 92KB. So rather than "fix" a file that is
// not there, this ablates the things in the hero that ARE large and expensive
// to rasterise, and reports which one actually owns the cost.
//
// Reports raster DURATION as well as count. Count alone misleads badly here:
// a handful of huge tiles and a swarm of small ones can have the same count and
// wildly different cost, and viewport-scaling is exactly the regime where tile
// size changes.
//
// Usage: node tools/hero-perf.mjs [width] [height]
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';

const W = Number(process.argv[2] || 2560);
const H = Number(process.argv[3] || 2000);
const DPR = Number(process.argv[4] || 1);

const CASES = [
    ['A stock, nebula off      ', '?nebula=off', () => {}],
    ['B stock, nebula present  ', '?nebula=present', () => {}],
    ['C no .hero::before bloom ', '?nebula=off', () => {
        const s = document.createElement('style');
        s.textContent = '.hero::before { display: none !important; }';
        document.head.appendChild(s);
    }],
    ['D bloom promoted         ', '?nebula=off', () => {
        const s = document.createElement('style');
        s.textContent = '.hero::before { will-change: transform; transform: translateZ(0); }';
        document.head.appendChild(s);
    }],
    ['E portrait mask removed  ', '?nebula=off', () => {
        const s = document.createElement('style');
        s.textContent = '.hero-portrait { -webkit-mask-image: none !important; mask-image: none !important; }';
        document.head.appendChild(s);
    }],
    ['F portrait hidden        ', '?nebula=off', () => {
        const s = document.createElement('style');
        s.textContent = '.hero-portrait-wrap { display: none !important; }';
        document.head.appendChild(s);
    }],
    ['G portrait glow removed  ', '?nebula=off', () => {
        const s = document.createElement('style');
        s.textContent = '.hero-portrait-wrap::before { display: none !important; }';
        document.head.appendChild(s);
    }],
];

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${W},${H}`],
});

console.log(`HERO RASTER COST - hero scroll at ${W}x${H} @ DPR ${DPR} = ${W*DPR}x${H*DPR} device px\n`);
console.log('  case                        Paint  RasterTask  rasterMs  bigTiles  longFrames>16ms');

for (const [label, url, mutate] of CASES) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'dark' },
                   { name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.goto('http://localhost:8080/' + url, { waitUntil: 'networkidle0' });
    await page.evaluate(mutate);
    await new Promise(r => setTimeout(r, 900));   // let load-time raster settle

    await page.evaluate(() => {
        window.__f = [];
        let last = performance.now();
        (function loop(t) { window.__f.push(t - last); last = t; requestAnimationFrame(loop); })(last);
    });

    await page.tracing.start({
        categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
        path: 'tools/shots/_hero-trace.json',
    });
    // scroll through the hero specifically, not the whole page
    await cdp.send('Input.synthesizeScrollGesture', {
        x: Math.round(W / 2), y: Math.round(H / 2), xDistance: 0, yDistance: -H * 2, speed: 1600,
    });
    await new Promise(r => setTimeout(r, 700));
    await page.tracing.stop();

    const raw = JSON.parse(await readFile('tools/shots/_hero-trace.json', 'utf8'));
    const events = raw.traceEvents || raw;
    const rasters = events.filter(e => e.name === 'RasterTask');
    const rasterMs = rasters.reduce((a, e) => a + (e.dur || 0), 0) / 1000;
    const bigTiles = rasters.filter(e => (e.dur || 0) > 1000).length;   // >1ms each
    const f = await page.evaluate(() => window.__f.slice(5));
    const long = (100 * f.filter(x => x > 16).length) / f.length;

    console.log(
        `  ${label}  ${String(events.filter(e => e.name === 'Paint').length).padStart(5)}  ` +
        `${String(rasters.length).padStart(10)}  ${rasterMs.toFixed(1).padStart(8)}  ` +
        `${String(bigTiles).padStart(8)}  ${long.toFixed(2).padStart(15)}`
    );
    await page.close();
}

await browser.close();
