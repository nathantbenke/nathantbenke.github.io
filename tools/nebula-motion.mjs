// Verifies the thing v1.1.0 got wrong: that the nebula actually MOVES, and
// that its planes move by DIFFERENT amounts (which is what reads as volume
// rather than as a smudge), while all staying slower than the starfield.
//
// Reads the live transforms off each layer at several scroll depths, so this
// reports what the compositor was actually handed - not what the source says.
import puppeteer from 'puppeteer-core';

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
await new Promise(r => setTimeout(r, 500));

const SELS = ['.neb-field', '.neb-grain', '.neb-veil', '.neb-cols',
              '.bg-stars-1', '.bg-stars-2', '.bg-stars-3'];

async function sample(y) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise(r => setTimeout(r, 260));
    return page.evaluate((sels) => {
        const out = {};
        for (const s of sels) {
            const el = document.querySelector(s);
            if (!el) { out[s] = null; continue; }
            // read the COMPUTED matrix, not the inline string
            const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
            out[s] = m.f;   // translateY
        }
        out.__op = parseFloat(getComputedStyle(document.querySelector('.neb-field')).opacity);
        out.__y = window.scrollY;
        return out;
    }, sels => sels, SELS).catch(() => null);
}

// puppeteer's evaluate with two args needs the array passed properly
async function sample2(y) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await new Promise(r => setTimeout(r, 260));
    return page.evaluate((sels) => {
        const out = {};
        for (const s of sels) {
            const el = document.querySelector(s);
            if (!el) { out[s] = null; continue; }
            const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
            out[s] = m.f;
        }
        out.__op = parseFloat(getComputedStyle(document.querySelector('.neb-field')).opacity);
        out.__y = window.scrollY;
        return out;
    }, SELS);
}

const stops = [0, 700, 1400, 3000, 6000, 9000];
const rows = [];
for (const y of stops) rows.push(await sample2(y));

const pageH = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(`page height ${pageH}, viewport 900\n`);
console.log('translateY(px) per layer at each scroll depth  (negative = moved up)\n');
console.log('  scrollY  ' + SELS.map(s => s.replace('.', '').padStart(11)).join('') + '   .neb-field opacity');
for (const r of rows) {
    console.log('  ' + String(Math.round(r.__y)).padStart(7) + '  ' +
        SELS.map(s => (r[s] === null ? 'n/a' : r[s].toFixed(1)).padStart(11)).join('') +
        '   ' + r.__op.toFixed(3));
}

const last = rows[rows.length - 1];
console.log('\ndifferential travel across the nebula at max scroll:');
const f = Math.abs(last['.neb-field']), c = Math.abs(last['.neb-cols']);
console.log(`  far plane  (.neb-field) ${f.toFixed(0)}px`);
console.log(`  near plane (.neb-cols)  ${c.toFixed(0)}px`);
console.log(`  spread between them     ${(c - f).toFixed(0)}px  <- this is the volume cue`);
console.log(`  slowest star layer      ${Math.abs(last['.bg-stars-1']).toFixed(0)}px  ` +
    `(nebula must stay under this: ${c < Math.abs(last['.bg-stars-1']) ? 'OK' : 'VIOLATED'})`);

await browser.close();
