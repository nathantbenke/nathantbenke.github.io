// Scroll-jank probe for the v1.1 nebula experiment.
//
// Same rAF-delta methodology as perf-scroll.mjs, with three changes that the
// nebula work actually needs:
//
//  1. DARK MODE IS FORCED (Emulation.setEmulatedMedia). Headless Chrome reports
//     prefers-color-scheme: light, and this site's dark theme is the *default*
//     branch of that query - so the original probe was measuring the LIGHT
//     theme. The nebula is dark-only, so a light-mode run would measure nothing.
//  2. Repeats each run and reports the MEDIAN, because a single 6000px gesture
//     has enough variance (~0.2pp of long-frame rate) to swallow a small
//     regression.
//  3. Takes a URL so intensity presets can be profiled individually.
//
// Usage: node tools/perf-scroll-nebula.mjs <label> [url] [reps]
import puppeteer from 'puppeteer-core';

const LABEL = process.argv[2] || 'run';
const URL = process.argv[3] || 'http://localhost:8080/';
const REPS = Number(process.argv[4] || 5);

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,900'],
});

const results = [];

for (let rep = 0; rep < REPS; rep++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', {
        features: [
            { name: 'prefers-color-scheme', value: 'dark' },
            { name: 'prefers-reduced-motion', value: 'no-preference' },
        ],
    });

    await page.goto(URL, { waitUntil: 'networkidle0' });

    // Fail loudly rather than silently profiling the wrong theme.
    const probe = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        nebula: (() => {
            const n = document.querySelector('.bg-nebula');
            if (!n) return 'absent';
            const cs = getComputedStyle(n);
            return `${cs.display} op=${cs.opacity}`;
        })(),
        preset: document.documentElement.getAttribute('data-nebula') || '(default)',
    }));
    if (rep === 0) console.log(`  ctx: body-bg=${probe.bg} nebula=${probe.nebula} preset=${probe.preset}`);

    await page.evaluate(() => {
        window.__frames = [];
        let last = performance.now();
        function loop(t) { window.__frames.push(t - last); last = t; requestAnimationFrame(loop); }
        requestAnimationFrame(loop);
    });

    await cdp.send('Input.synthesizeScrollGesture', {
        x: 640, y: 450, xDistance: 0, yDistance: -6000, speed: 2500,
    });
    await new Promise(r => setTimeout(r, 300));
    await cdp.send('Input.synthesizeScrollGesture', {
        x: 640, y: 450, xDistance: 0, yDistance: 6000, speed: 2500,
    });
    await new Promise(r => setTimeout(r, 300));

    const frames = await page.evaluate(() => window.__frames.slice(5));
    const total = frames.length;
    const avg = frames.reduce((a, b) => a + b, 0) / total;
    const long = frames.filter(f => f > 25).length;
    results.push({
        total, avg, longPct: (100 * long) / total, worst: Math.max(...frames),
    });
    await page.close();
}

const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

const longPct = median(results.map(r => r.longPct));
const avg = median(results.map(r => r.avg));
const worst = median(results.map(r => r.worst));

console.log(
    `[${LABEL}] reps=${REPS} medianAvgFrame=${avg.toFixed(1)}ms (~${(1000 / avg).toFixed(0)}fps) ` +
    `medianLong(>25ms)=${longPct.toFixed(2)}% medianWorst=${worst.toFixed(0)}ms`
);
console.log(
    `         long% per rep: ${results.map(r => r.longPct.toFixed(2)).join(', ')}`
);

await browser.close();
