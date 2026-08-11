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

const VARIANTS = {
    'before (no nebula)': { url: '?nebula=off', mutate: () => {} },
    'after  (subtle)': { url: '?nebula=subtle', mutate: () => {} },
    'after  (medium)': { url: '?nebula=medium', mutate: () => {} },
    'after  (present)': { url: '?nebula=present', mutate: () => {} },
    'ctl-no-will-change': {
        url: '?nebula=present',
        mutate: () => { document.querySelector('.bg-nebula').style.willChange = 'auto'; },
    },
};

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,900'],
});

// ---------- A. compositor evidence ----------
{
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
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
    await cdp.send('Input.synthesizeScrollGesture', { x: 640, y: 450, xDistance: 0, yDistance: -6000, speed: 2500 });
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
        await page.setViewport({ width: 1280, height: 900 });
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
        await cdp.send('Input.synthesizeScrollGesture', { x: 640, y: 450, xDistance: 0, yDistance: -6000, speed: 2500 });
        await new Promise(r => setTimeout(r, 250));
        await cdp.send('Input.synthesizeScrollGesture', { x: 640, y: 450, xDistance: 0, yDistance: 6000, speed: 2500 });
        await new Promise(r => setTimeout(r, 250));

        const f = await page.evaluate(() => window.__f.slice(5));
        acc[name].push({
            long: (100 * f.filter(x => x > 25).length) / f.length,
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
console.log('  variant                long% median   long% trimmed-mean   avg frame   worst rep');
for (const [name, xs] of Object.entries(acc)) {
    const longs = xs.map(x => x.long);
    const avgs = xs.map(x => x.avg);
    console.log(
        `  ${name.padEnd(22)} ${med(longs).toFixed(2).padStart(11)}   ${trimmed(longs).toFixed(2).padStart(17)}` +
        `   ${med(avgs).toFixed(1).padStart(8)}ms   ${Math.max(...longs).toFixed(1).padStart(6)}%`
    );
}
console.log('\n  (worst rep is shown to make the machine noise visible rather than hidden:');
console.log('   interference spikes hit the no-nebula baseline too.)');

await browser.close();
