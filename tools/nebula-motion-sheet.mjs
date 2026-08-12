// Contact sheet that makes the DRIFT visible.
//
// Shot against the real page the nebula's motion is hard to see, because the
// content scrolling past dominates the frame. So this hides the page and the
// starfield and photographs the nebula alone at increasing scroll depths: the
// only thing that changes between frames is the nebula, so any movement is the
// nebula moving. Intensity is cranked and the falloff pinned off, otherwise the
// density ramp would be mistaken for motion.
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const OUT = 'tools/shots';
await mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1440,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const cdp = await page.createCDPSession();
await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' },
               { name: 'prefers-reduced-motion', value: 'no-preference' }],
});
await page.goto('http://localhost:8080/?nebula=present', { waitUntil: 'networkidle0' });

await page.evaluate(() => {
    document.documentElement.style.setProperty('--neb-i', '9');
    // visibility, NOT display: display:none collapses the document height, the
    // page stops being scrollable, scrollTo() silently does nothing and every
    // frame comes out identical - which looks exactly like "the nebula doesn't
    // move" and is how this rig lied the first time it ran.
    document.querySelectorAll('body > *:not(.bg)').forEach(el => { el.style.visibility = 'hidden'; });
    document.querySelectorAll('.bg-stars').forEach(el => { el.style.display = 'none'; });
    // hold density flat so the ramp cannot be mistaken for movement
    // refresh() first: density is computed from a CACHED copy of --neb-i, so
    // setting the property without telling the engine leaves the planes at the
    // old intensity.
    if (window.__nebula) {
        window.__nebula.refresh();
        window.__nebula.set('top', 1);
        window.__nebula.set('floor', 1);
    }
});

const stops = [0, 3000, 6000, 8894];
for (const y of stops) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise(r => setTimeout(r, 350));
    const sy = await page.evaluate(() => window.scrollY); if (sy !== y) console.log(`  WARN: asked for ${y}, page is at ${sy}`); await page.screenshot({ path: `${OUT}/motion-y${y}.png` });
}
console.log('wrote motion-y{' + stops.join(',') + '}.png');

await browser.close();
