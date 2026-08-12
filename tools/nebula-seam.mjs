// Isolates the vertical seam by photographing each nebula sub-layer alone.
//
// Column-averaging the composite does not work: .neb-grain tiles vertically as
// well as horizontally, so averaging down the image REINFORCES its tile pattern
// instead of cancelling it, and every column-profile is dominated by grain.
// One layer at a time is the only way to attribute a seam.
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const OUT = 'tools/shots';
await mkdir(OUT, { recursive: true });
const W = Number(process.argv[2] || 1440);

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', `--window-size=${W},900`],
});

const LAYERS = ['neb-field', 'neb-veil', 'neb-cols', 'neb-grain'];

for (const solo of LAYERS) {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: 900 });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setEmulatedMedia', {
        features: [{ name: 'prefers-color-scheme', value: 'dark' }],
    });
    await page.goto('http://localhost:8080/?nebula=present', { waitUntil: 'networkidle0' });
    await page.evaluate((keep) => {
        document.documentElement.style.setProperty('--neb-i', '9');
        document.querySelectorAll('body > *:not(.bg)').forEach(el => { el.style.visibility = 'hidden'; });
        document.querySelectorAll('.bg-stars, .bg-atmo').forEach(el => { el.style.display = 'none'; });
        ['neb-field', 'neb-veil', 'neb-cols', 'neb-grain'].forEach(c => {
            const el = document.querySelector('.' + c);
            if (el) el.style.display = (c === keep) ? '' : 'none';
        });
        // grain alone is nearly invisible at its shipping weight
        const g = document.querySelector('.neb-grain');
        if (g && keep === 'neb-grain') g.style.opacity = '1';
        const v = document.querySelector('.neb-veil');
        if (v && keep === 'neb-veil') v.style.opacity = '1';
    }, solo);
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: `${OUT}/seam-${solo}.png` });
    await page.close();
}
console.log('wrote seam-{' + LAYERS.join(',') + '}.png at width ' + W);
await browser.close();
