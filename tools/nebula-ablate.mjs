// Ablation harness: which part of the nebula costs the scroll frames?
//
// Each variant is applied in-page AFTER load, so every run shares one browser,
// one page load and one machine state - the only difference between rows is the
// mutation. Interleaved (round-robin) rather than run-in-a-row, because this
// box drifts over tens of seconds and a block design would attribute that drift
// to whichever variant ran during it.
import puppeteer from 'puppeteer-core';

const REPS = Number(process.argv[2] || 5);

const VARIANTS = {
    'v0-no-nebula': () => { document.querySelector('.bg-nebula').remove(); },
    'v1-as-built': () => {},
    'v2-static-no-parallax': () => {
        // strip the nebula out of the rAF parallax loop by renaming it
        document.querySelector('.bg-nebula').classList.remove('bg-nebula');
        document.querySelector('.neb-field').parentElement.classList.add('bg-nebula-static');
    },
    'v3-one-opacity': () => {
        const n = document.querySelector('.bg-nebula');
        n.style.opacity = '0.5';
        ['field', 'veil', 'cols', 'grain'].forEach(k => {
            const el = document.querySelector('.neb-' + k);
            if (el) el.style.opacity = '1';
        });
    },
    'v4-no-cols-scale': () => {
        document.querySelector('.neb-cols').style.transform = 'rotate(11deg)';
    },
    'v5-no-will-change': () => {
        document.querySelector('.bg-nebula').style.willChange = 'auto';
    },
    'v6-no-veil-mask': () => {
        const v = document.querySelector('.neb-veil');
        v.style.webkitMaskImage = 'none';
        v.style.maskImage = 'none';
    },
    'v7-field-only': () => {
        ['veil', 'cols', 'grain'].forEach(k => {
            document.querySelector('.neb-' + k).remove();
        });
    },
};

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,900'],
});

const acc = {};
Object.keys(VARIANTS).forEach(k => { acc[k] = []; });

for (let rep = 0; rep < REPS; rep++) {
    for (const [name, mutate] of Object.entries(VARIANTS)) {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 900 });
        const cdp = await page.createCDPSession();
        await cdp.send('Emulation.setEmulatedMedia', {
            features: [
                { name: 'prefers-color-scheme', value: 'dark' },
                { name: 'prefers-reduced-motion', value: 'no-preference' },
            ],
        });
        await page.goto('http://localhost:8080/?nebula=medium', { waitUntil: 'networkidle0' });
        await page.evaluate(mutate);
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
        acc[name].push((100 * f.filter(x => x > 25).length) / f.length);
        await page.close();
    }
    process.stderr.write(`  rep ${rep + 1}/${REPS} done\n`);
}

const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`\nlong-frame % (>25ms), ${REPS} interleaved reps, medium preset\n`);
for (const [name, xs] of Object.entries(acc)) {
    console.log(`  ${name.padEnd(24)} median=${med(xs).toFixed(2).padStart(6)}  all=[${xs.map(x => x.toFixed(1)).join(', ')}]`);
}

await browser.close();
