// Hunts the ripple/moire in .neb-base by rendering it one ingredient at a time.
//
// Three things in that layer can produce a periodic or concentric artifact and
// they need separating before anything is "fixed":
//   A. the --neb-mask radial, whose alpha ramps very gradually over a huge
//      radius - long shallow ramps are exactly what banding shows up on, and
//      the rings would be centred on the mask centre (64vw 61vh)
//   B. the emission gradients, same quantisation problem at low alpha
//   C. the turbulence tiles, upscaled ~10x from a 256px source - bilinear
//      interpolation at that ratio can print its own grid/diamond structure
//
// Also renders with grain on and off, because grain is the dither that is
// supposed to be hiding A and B.
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const OUT = 'tools/shots';
await mkdir(OUT, { recursive: true });
const W = Number(process.argv[2] || 1920);
const H = Number(process.argv[3] || 1080);
const BOOST = process.argv[4] || '3';

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${W},${H}`],
});

const CASES = {
    'base-plus-grain': () => {},
    'base-only': () => { document.querySelector('.neb-grain').style.display = 'none'; },
    'base-no-mask': () => {
        document.querySelector('.neb-grain').style.display = 'none';
        const b = document.querySelector('.neb-base');
        b.style.webkitMaskImage = 'none';
        b.style.maskImage = 'none';
    },
    'base-gradients-only': () => {
        document.querySelector('.neb-grain').style.display = 'none';
        const b = document.querySelector('.neb-base');
        const cs = getComputedStyle(b).backgroundImage;
        // drop the two leading turbulence tiles, keep the gradients
        const parts = cs.split(/,(?![^(]*\))/).slice(2);
        b.style.backgroundImage = parts.join(',');
    },
    'base-tiles-only': () => {
        document.querySelector('.neb-grain').style.display = 'none';
        const b = document.querySelector('.neb-base');
        const cs = getComputedStyle(b).backgroundImage;
        const parts = cs.split(/,(?![^(]*\))/).slice(0, 2);
        b.style.backgroundImage = parts.join(',');
        b.style.backgroundSize = '190vw 190vh, 240vw 240vh';
        b.style.backgroundPosition = '18% 22%, 58% 40%';
        b.style.backgroundRepeat = 'no-repeat';
    },
};

for (const [name, mutate] of Object.entries(CASES)) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await page.goto('http://localhost:8080/?nebula=present', { waitUntil: 'networkidle0' });
    await page.evaluate((boost) => {
        document.documentElement.style.setProperty('--neb-i', boost);
        document.querySelectorAll('body > *:not(.bg)').forEach(el => { el.style.visibility = 'hidden'; });
        document.querySelectorAll('.bg-stars, .bg-atmo, .neb-drift').forEach(el => { el.style.display = 'none'; });
    }, BOOST);
    await page.evaluate(mutate);
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/base-${name}.png` });
    await page.close();
}
console.log('wrote base-{' + Object.keys(CASES).join(',') + '}.png at ' + W + 'x' + H + ', --neb-i ' + BOOST);
await browser.close();
