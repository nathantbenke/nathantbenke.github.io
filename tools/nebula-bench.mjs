// Final before/after benchmark for the v1.1 nebula.
//
// Two things this proves, because frame timings alone would not:
//
//  A. COMPOSITOR EVIDENCE. CDP LayerTree says whether .bg-nebula really got its
//     own layer and how much it is repainting. "It should be composited" is an
//     assumption; paintCount on a named layer is a fact.
//  B. TIMING, INTERLEAVED. Variants alternate within each rep instead of running
//     in blocks. This box has background interference that can spike ANY variant
//     to 80%+ long frames - including the no-nebula baseline - so a block design
//     would blame whichever variant happened to be running. Interleaving spreads
//     that noise evenly, and the trimmed mean drops it.
//
// `ctl-no-will-change` is a POSITIVE CONTROL: a deliberately un-promoted nebula,
// which does repaint on scroll. If the harness cannot separate that from the
// baseline, the harness is not sensitive enough to claim "no regression" either.
import puppeteer from 'puppeteer-core';

const REPS = Number(process.argv[2] || 13);
const W = Number(process.argv[3] || 1280);
const H = Number(process.argv[4] || 900);

const VARIANTS = {
    'before (no nebula)': { url: '?nebula=off', mutate: () => {} },
    'v1.1.2 (4 planes moving)': { url: '?nebula=present', mutate: () => {} },
    'v1.1.2 @ 1.5x rate': {
        url: '?nebula=present',
        mutate: () => { if (window.__nebula) window.__nebula.set('speed', 1.5); },
    },
    'ctl: v1.1.1 group surface': {
        // the extra render surface v1.1.2 removed - positive control for the
        // fill-rate regression, which raster counts cannot see
        url: '?nebula=present',
        mutate: () => {
            const g = document.querySelector('.bg-nebula');
            g.style.willChange = 'opacity';
            g.style.opacity = '0.6';
            g.style.bottom = '-520px';
        },
    },
    'ctl-no-will-change': {
        url: '?nebula=present',
        mutate: () => {
            document.querySelector('.bg-nebula').style.willChange = 'auto';
            ['.neb-field', '.neb-veil', '.neb-cols', '.neb-grain'].forEach(s => {
                document.querySelector(s).style.willChange = 'auto';
            });
        },
    },
};

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${W},${H}`],
});

// ---------- A. compositor evidence ----------
{
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'dark' },
                   { name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await cdp.send('LayerTree.enable');

    const snapshots = [];
    cdp.on('LayerTree.layerTreeDidChange', ({ layers }) => { if (layers) snapshots.push(layers); });

    await page.goto('http://localhost:8080/?nebula=present', { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 600));
    const before = snapshots[snapshots.length - 1] || [];

    // scroll the whole page, then look at what repainted
    await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(W/2), y: Math.round(H/2), xDistance: 0, yDistance: -6000, speed: 2500 });
    await new Promise(r => setTimeout(r, 800));
    const after = snapshots[snapshots.length - 1] || [];

    // map backendNodeId -> a readable name for the layers we care about
    const named = {};
    for (const sel of ['.bg-nebula', '.bg-stars-1', '.bg-stars-3', '.bg-atmo']) {
        const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
        if (!nodeId) continue;
        const { node } = await cdp.send('DOM.describeNode', { nodeId });
        named[node.backendNodeId] = sel;
    }

    const paintOf = (layers, sel) => layers
        .filter(l => named[l.backendNodeId] === sel)
        .reduce((a, l) => a + (l.paintCount || 0), 0);

    console.log('COMPOSITOR (preset=present, full-page scroll)\n');
    console.log('  layer          own layer?   paints before   paints after   repaints during scroll');
    for (const sel of Object.values(named)) {
        const has = after.some(l => named[l.backendNodeId] === sel);
        const b = paintOf(before, sel), a = paintOf(after, sel);
        console.log(`  ${sel.padEnd(14)} ${(has ? 'yes' : 'no').padEnd(12)} ${String(b).padEnd(15)} ${String(a).padEnd(14)} ${a - b}`);
    }
    console.log(`\n  total composited layers: ${before.length} -> ${after.length}`);
    await page.close();
}

// ---------- B. interleaved timing ----------
const acc = {};
Object.keys(VARIANTS).forEach(k => { acc[k] = []; });

for (let rep = 0; rep < REPS; rep++) {
    for (const [name, cfg] of Object.entries(VARIANTS)) {
        const page = await browser.newPage();
        await page.setViewport({ width: W, height: H });
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'prefers-color-scheme', value: 'dark' },
                       { name: 'prefers-reduced-motion', value: 'no-preference' }],
        });
        await page.goto('http://localhost:8080/' + cfg.url, { waitUntil: 'networkidle0' });
        await page.evaluate(cfg.mutate);
        await new Promise(r => setTimeout(r, 250));

        await page.evaluate(() => {
            window.__f = [];
            let last = performance.now();
            (function loop(t) { window.__f.push(t - last); last = t; requestAnimationFrame(loop); })(last);
        });
        await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(W/2), y: Math.round(H/2), xDistance: 0, yDistance: -6000, speed: 2500 });
        await new Promise(r => setTimeout(r, 250));
        await cdp.send('Input.synthesizeScrollGesture', { x: Math.round(W/2), y: Math.round(H/2), xDistance: 0, yDistance: 6000, speed: 2500 });
        await new Promise(r => setTimeout(r, 250));

        const f = await page.evaluate(() => window.__f.slice(5));
        const sorted = [...f].sort((a, b) => a - b);
        const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
        acc[name].push({
            long25: (100 * f.filter(x => x > 25).length) / f.length,
            // 25ms is ~3.5x the frame budget on this box (7ms avg, ~144Hz) and
            // has no resolution: an earlier run put the KNOWN-BAD control at
            // 0.00% alongside the baseline, which means that metric proved
            // nothing either way. 16ms and the tail percentiles do separate.
            long16: (100 * f.filter(x => x > 16).length) / f.length,
            p95: pct(0.95),
            p99: pct(0.99),
            avg: f.reduce((a, b) => a + b, 0) / f.length,
        });
        await page.close();
    }
    process.stderr.write(`  rep ${rep + 1}/${REPS}\n`);
}

const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[(s.length - 1) >> 1]; };
// drop the top and bottom 20% before averaging: this box spikes, and one
// interference event should not decide the verdict
const trimmed = xs => {
    const s = [...xs].sort((a, b) => a - b);
    const k = Math.floor(s.length * 0.2);
    const core = s.slice(k, s.length - k);
    return core.reduce((a, b) => a + b, 0) / core.length;
};

console.log(`\n\nSCROLL TIMING - ${REPS} interleaved reps, 1280x900, dark, 6000px down + 6000px up\n`);
console.log('  variant                    >25ms%   >16ms%   p95 frame   p99 frame   avg frame');
for (const [name, xs] of Object.entries(acc)) {
    console.log(
        `  ${name.padEnd(24)} ${trimmed(xs.map(x => x.long25)).toFixed(2).padStart(6)}   ` +
        `${trimmed(xs.map(x => x.long16)).toFixed(2).padStart(6)}   ` +
        `${med(xs.map(x => x.p95)).toFixed(1).padStart(7)}ms   ` +
        `${med(xs.map(x => x.p99)).toFixed(1).padStart(7)}ms   ` +
        `${med(xs.map(x => x.avg)).toFixed(1).padStart(7)}ms`
    );
}
console.log('\n  >25/>16 are trimmed means (top and bottom 20% of reps dropped, because');
console.log('  this box spikes); p95/p99/avg are medians across reps.');
console.log('\n  READ ctl-no-will-change FIRST. It is a deliberately un-promoted nebula that');
console.log('  the paint trace shows doing ~70x the rasterisation. If it does NOT separate');
console.log('  from the baseline, this run had no discriminating power and the other rows');
console.log('  are evidence of nothing - do not read them as a pass.');

await browser.close();
