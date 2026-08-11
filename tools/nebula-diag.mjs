// Diagnostic render of the nebula layer ALONE, at exaggerated intensity.
// The shipping intensities are too quiet to judge structure by eye, so this
// strips the page away and cranks --neb-i to see what is actually being drawn.
// Usage: node tools/nebula-diag.mjs [intensity]
import puppeteer from 'puppeteer-core';
import { mkdir } from 'node:fs/promises';

const I = process.argv[2] || '9';
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
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
});
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle0' });

const report = await page.evaluate((intensity) => {
    document.documentElement.style.setProperty('--neb-i', intensity);
    // hide everything except the background stack
    document.querySelectorAll('body > *:not(.bg)').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.bg-stars').forEach(el => { el.style.display = 'none'; });
    const n = document.querySelector('.bg-nebula');
    const r = n.getBoundingClientRect();
    return {
        box: `${r.width}x${r.height}`,
        children: [...n.children].map(c => {
            const cs = getComputedStyle(c);
            const imgs = cs.backgroundImage;
            return `${c.className}: opacity=${cs.opacity} bgLayers=${imgs.split(/,(?![^(]*\))/).length} ` +
                   `hasData=${imgs.includes('data:image') ? 'yes' : 'n/a'}`;
        }),
    };
}, I);

console.log(`nebula box: ${report.box}`);
report.children.forEach(c => console.log('  ' + c));

await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: `${OUT}/diag-i${I}.png` });

// and one with the field/veil hidden, so the dust columns are isolated
await page.evaluate(() => {
    document.querySelector('.neb-field').style.display = 'none';
    document.querySelector('.neb-veil').style.display = 'none';
    document.querySelector('.neb-grain').style.display = 'none';
});
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/diag-cols-i${I}.png` });

// and the veil alone (turbulence only)
await page.evaluate(() => {
    document.querySelector('.neb-cols').style.display = 'none';
    document.querySelector('.neb-veil').style.display = '';
});
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/diag-veil-i${I}.png` });

// grain alone: chasing a hard-edged block that showed up at the top-left of the
// full composite. If it appears here it is the tile; if it only appears in the
// composite it is the rasteriser, not the CSS.
await page.evaluate(() => {
    document.querySelector('.neb-veil').style.display = 'none';
    document.querySelector('.neb-grain').style.display = '';
    document.querySelector('.bg-atmo').style.display = 'none';
});
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: `${OUT}/diag-grain-i${I}.png` });

await browser.close();
