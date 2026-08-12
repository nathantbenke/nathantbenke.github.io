// What does a LIGHT-MODE scroll actually spend time on?
//
// Light mode renders no nebula at all, so anything left is theme-independent
// base-page cost. This does not measure frame timings (this box is confirmed
// non-discriminating for that); it reports WHERE time goes, by event type and
// total duration, which is deterministic enough to act on.
//
// Specifically hunts the four named suspects:
//   - forced synchronous layout (a Layout that happens INSIDE a script task,
//     i.e. something read geometry after mutating it)
//   - image decode work landing during the scroll
//   - observer callbacks (ResizeObserver / IntersectionObserver) firing per scroll
//   - the scroll handler itself
//
// Usage: node tools/light-scroll-trace.mjs [theme] [width] [height]
import puppeteer from 'puppeteer-core';
import { readFile } from 'node:fs/promises';

const THEME = process.argv[2] || 'light';
// pass "block" as argv[5] to drop third-party analytics and A/B it
const BLOCK_3P = /block/.test(process.argv[5] || '');
const NO_TICKER = /noticker/.test(process.argv[5] || '');
const W = Number(process.argv[3] || 2560);
const H = Number(process.argv[4] || 1440);

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${W},${H}`],
});
const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: THEME },
               { name: 'prefers-reduced-motion', value: 'no-preference' }],
});

// Instrument BEFORE the page's own script runs, so we can count how often the
// scroll handler runs and whether anything reads layout inside it.
await page.evaluateOnNewDocument(() => {
    window.__stats = { scrollEvents: 0, rafs: 0, layoutReads: 0, readStacks: {} };
    const origAdd = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
        if (type === 'scroll' && typeof fn === 'function') {
            window.__stats.scrollPassive = !!(opts && opts.passive);
            const wrapped = function (e) { window.__stats.scrollEvents++; return fn.call(this, e); };
            return origAdd.call(this, type, wrapped, opts);
        }
        return origAdd.call(this, type, fn, opts);
    };
    const origRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = function (cb) {
        return origRaf.call(window, function (t) { window.__stats.rafs++; return cb(t); });
    };
    // flag any geometry read that happens while we are scrolling
    function trap(obj, prop) {
        const d = Object.getOwnPropertyDescriptor(obj, prop);
        if (!d || !d.get) return;
        Object.defineProperty(obj, prop, {
            configurable: true,
            get: function () {
                if (window.__scrolling) {
                    window.__stats.layoutReads++;
                    const s = (new Error()).stack.split('\n')[2] || '?';
                    window.__stats.readStacks[s.trim()] = (window.__stats.readStacks[s.trim()] || 0) + 1;
                }
                return d.get.call(this);
            },
        });
    }
    ['offsetTop', 'offsetHeight', 'offsetWidth', 'clientHeight', 'clientWidth', 'scrollHeight']
        .forEach(p => trap(HTMLElement.prototype, p));
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
        if (window.__scrolling) {
            window.__stats.layoutReads++;
            const s = (new Error()).stack.split('\n')[2] || '?';
            window.__stats.readStacks[s.trim()] = (window.__stats.readStacks[s.trim()] || 0) + 1;
        }
        return origRect.call(this);
    };
});

if (BLOCK_3P) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (/clarity\.ms|googletagmanager|google-analytics/.test(req.url())) req.abort();
        else req.continue();
    });
}
await page.goto(`http://localhost:8080/?theme=${THEME}`, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 900));
if (NO_TICKER) {
    // the "I build ..." ticker retypes a character every 34ms forever, whether
    // or not the hero is on screen - each textContent write is a layout
    await page.evaluate(() => {
        let id = setTimeout(() => {}, 0);
        while (id--) clearTimeout(id);
    });
}

const themeCheck = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    nebula: (() => {
        const n = document.querySelector('.bg-nebula');
        return n ? getComputedStyle(n).display : 'absent';
    })(),
}));
console.log(`theme=${THEME}  body-bg=${themeCheck.bg}  nebula.display=${themeCheck.nebula}\n`);

await page.evaluate(() => { window.__scrolling = true; });
await page.tracing.start({
    categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
    path: 'tools/shots/_light-trace.json',
});
await cdp.send('Input.synthesizeScrollGesture', {
    x: Math.round(W / 2), y: Math.round(H / 2), xDistance: 0, yDistance: -9000, speed: 1800,
});
await new Promise(r => setTimeout(r, 800));
await page.tracing.stop();
await page.evaluate(() => { window.__scrolling = false; });

const stats = await page.evaluate(() => window.__stats);
const raw = JSON.parse(await readFile('tools/shots/_light-trace.json', 'utf8'));
const events = (raw.traceEvents || raw).filter(e => e.dur !== undefined);

const byName = {};
for (const e of events) {
    if (!byName[e.name]) byName[e.name] = { n: 0, ms: 0, max: 0 };
    const b = byName[e.name];
    b.n++; b.ms += e.dur / 1000; b.max = Math.max(b.max, e.dur / 1000);
}
const rows = Object.entries(byName).sort((a, b) => b[1].ms - a[1].ms).slice(0, 16);

console.log('TIME BY TRACE EVENT during a 9000px scroll (total ms across the gesture)\n');
console.log('  event                          count      total ms    worst single');
for (const [name, b] of rows) {
    console.log(`  ${name.padEnd(30)} ${String(b.n).padStart(5)}   ${b.ms.toFixed(1).padStart(10)}   ${b.max.toFixed(1).padStart(10)}ms`);
}

const decode = events.filter(e => /Decode|ImageDecode/i.test(e.name));
const decodeMs = decode.reduce((a, e) => a + e.dur / 1000, 0);
console.log(`\nIMAGE DECODE during scroll: ${decode.length} events, ${decodeMs.toFixed(1)}ms total, ` +
            `worst ${decode.length ? Math.max(...decode.map(e => e.dur / 1000)).toFixed(1) : 0}ms`);

console.log('\nHANDLER BEHAVIOUR (instrumented in-page)');
console.log(`  scroll events handled : ${stats.scrollEvents}`);
console.log(`  passive listener      : ${stats.scrollPassive}`);
console.log(`  rAF callbacks         : ${stats.rafs}`);
console.log(`  layout reads while scrolling : ${stats.layoutReads}`);
if (stats.layoutReads) {
    console.log('  read sites:');
    Object.entries(stats.readStacks).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .forEach(([s, n]) => console.log(`     ${n} x  ${s}`));
}

await browser.close();
