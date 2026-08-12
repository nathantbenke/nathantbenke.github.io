// Does the nebula's cost scale with VIEWPORT AREA x LAYER COUNT?
//
// The nebula was cleared of wrongdoing on a raster-count argument: it does 1
// RasterTask on scroll, which is true. But raster is not composite. Five
// full-bleed promoted layers have to be BLENDED every frame, and blend cost
// scales with viewport area - so a layer that is free at 1280x900 can be
// ruinous at 4K. That is precisely the reported fingerprint (smooth at
// quarter-height, bad above half), and raster counts are blind to it.
//
// Interleaved, because this box drifts. Layer count is varied by hiding planes,
// which removes both their texture and their blend.
//
// Usage: node tools/nebula-fillrate.mjs [width] [height] [reps]
import puppeteer from 'puppeteer-core';

const W = Number(process.argv[2] || 2560);
const H = Number(process.argv[3] || 1440);
const REPS = Number(process.argv[4] || 9);
// CPU throttle. Without it this measurement is a coin flip: on a quiet box even
// the known-bad config fits inside the frame budget and EVERY row reads 7.1ms,
// including the positive controls - which means the run proves nothing in
// either direction. Throttling scales all main-thread and (under headless
// software compositing) all raster/blend work by the same factor, so a real
// difference becomes resolvable instead of hiding under the headroom.
const THROTTLE = Number(process.argv[5] || 6);

// The two CTL rows deliberately re-introduce what v1.1.2 removed. They are the
// positive controls: if they do not reproduce the regression, this run had no
// discriminating power and the "as built" row is evidence of nothing.
const VARIANTS = {
    'baseline (nebula off)': () => { document.querySelector('.bg-nebula').remove(); },
    'v1.1.2 as built': () => {},
    'ctl: group surface back': () => {
        // exactly what v1.1.1 did: an extra full-bleed render surface that all
        // four planes must composite into before it is alpha-blended
        const g = document.querySelector('.bg-nebula');
        g.style.willChange = 'opacity';
        g.style.opacity = '0.6';
    },
    'ctl: 520px slack back': () => {
        document.querySelector('.bg-nebula').style.bottom = '-520px';
    },
    'ctl: both (= v1.1.1)': () => {
        const g = document.querySelector('.bg-nebula');
        g.style.willChange = 'opacity';
        g.style.opacity = '0.6';
        g.style.bottom = '-520px';
    },
};

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${W},${H}`],
});

const acc = {};
Object.keys(VARIANTS).forEach(k => { acc[k] = []; });

for (let rep = 0; rep < REPS; rep++) {
    for (const [name, mutate] of Object.entries(VARIANTS)) {
        const page = await browser.newPage();
        await page.setViewport({ width: W, height: H });
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: 'dark' },
                       { name: 'prefers-reduced-motion', value: 'no-preference' }],
        });
        if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
        await page.goto('http://localhost:8080/?nebula=present', { waitUntil: 'networkidle0' });
        await page.evaluate(mutate);
        await new Promise(r => setTimeout(r, 400));

        await page.evaluate(() => {
            window.__f = [];
            let last = performance.now();
            (function loop(t) { window.__f.push(t - last); last = t; requestAnimationFrame(loop); })(last);
        });
        await cdp.send('Input.synthesizeScrollGesture', {
            x: Math.round(W / 2), y: Math.round(H / 2), xDistance: 0, yDistance: -6000, speed: 2200,
        });
        await new Promise(r => setTimeout(r, 300));
        await cdp.send('Input.synthesizeScrollGesture', {
            x: Math.round(W / 2), y: Math.round(H / 2), xDistance: 0, yDistance: 6000, speed: 2200,
        });
        await new Promise(r => setTimeout(r, 300));

        const f = await page.evaluate(() => window.__f.slice(5));
        const s = [...f].sort((a, b) => a - b);
        acc[name].push({
            long16: (100 * f.filter(x => x > 16).length) / f.length,
            p99: s[Math.floor(s.length * 0.99)],
            avg: f.reduce((a, b) => a + b, 0) / f.length,
        });
        await page.close();
    }
    process.stderr.write(`  rep ${rep + 1}/${REPS}\n`);
}

const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[(s.length - 1) >> 1]; };
const trimmed = xs => {
    const s = [...xs].sort((a, b) => a - b);
    const k = Math.floor(s.length * 0.2);
    const core = s.slice(k, s.length - k);
    return core.reduce((a, b) => a + b, 0) / core.length;
};

console.log(`\nNEBULA FILL RATE - ${W}x${H}, ${REPS} interleaved reps\n`);
console.log('  variant                       >16ms%    p99 frame   avg frame');
for (const [name, xs] of Object.entries(acc)) {
    console.log(
        `  ${name.padEnd(28)} ${trimmed(xs.map(x => x.long16)).toFixed(2).padStart(6)}   ` +
        `${med(xs.map(x => x.p99)).toFixed(1).padStart(8)}ms   ${med(xs.map(x => x.avg)).toFixed(1).padStart(7)}ms`
    );
}
console.log('\n  If "0 layers" is clearly cheaper than "5 layers", the nebula IS paying');
console.log('  viewport-scaled compositing cost and the raster-count argument was blind to it.');

await browser.close();
