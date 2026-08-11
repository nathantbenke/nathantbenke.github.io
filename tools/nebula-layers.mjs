// Direct paint evidence: how much painting/rasterising actually happens while
// scrolling, with the nebula off, on, and deliberately un-promoted.
//
// Trace-based rather than LayerTree-based. LayerTree.paintCount needs the DOM
// node cache primed after navigation and still reports 0 under headless
// software compositing, so it cannot support a claim either way. Counting
// Paint / RasterTask events out of a devtools.timeline trace is direct: if the
// layer is composited, scrolling it moves an existing texture and produces no
// new paint work; if it is not, the paint count climbs with scroll distance.
//
// `ctl-no-will-change` is the positive control - a nebula that IS expected to
// repaint. It calibrates what "repainting on scroll" looks like in these units.
import puppeteer from 'puppeteer-core';

const CASES = [
    ['nebula off        ', '?nebula=off', () => {}],
    ['nebula present    ', '?nebula=present', () => {}],
    ['ctl: no will-change', '?nebula=present',
        () => { document.querySelector('.bg-nebula').style.willChange = 'auto'; }],
];

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,900'],
});

console.log('PAINT WORK DURING A 6000px SCROLL (1280x900, dark)\n');
console.log('  case                  Paint   RasterTask   UpdateLayer   Layout   RecalcStyle');

for (const [label, url, mutate] of CASES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'dark' },
                   { name: 'prefers-reduced-motion', value: 'no-preference' }],
    });
    await page.goto('http://localhost:8080/' + url, { waitUntil: 'networkidle0' });
    await page.evaluate(mutate);
    await new Promise(r => setTimeout(r, 700));   // let load-time paint settle

    await page.tracing.start({
        categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'],
        path: 'tools/shots/_trace.json',
    });
    await cdp.send('Input.synthesizeScrollGesture', { x: 640, y: 450, xDistance: 0, yDistance: -6000, speed: 2000 });
    await new Promise(r => setTimeout(r, 600));
    await page.tracing.stop();

    const { readFile } = await import('node:fs/promises');
    const raw = JSON.parse(await readFile('tools/shots/_trace.json', 'utf8'));
    const events = raw.traceEvents || raw;
    const count = (name) => events.filter(e => e.name === name).length;

    console.log(
        `  ${label}  ${String(count('Paint')).padStart(5)}   ` +
        `${String(count('RasterTask')).padStart(10)}   ` +
        `${String(count('UpdateLayerTree')).padStart(11)}   ` +
        `${String(count('Layout')).padStart(6)}   ` +
        `${String(count('UpdateLayoutTree')).padStart(11)}`
    );
    await page.close();
}

await browser.close();
