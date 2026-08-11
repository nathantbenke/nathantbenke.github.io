// Brand web-export pipeline. Run from tools/:  node brand-export.mjs
//
// Reads private masters from assets/brand-src/ (gitignored: never committed)
// and emits cleaned, display-resolution derivatives into assets/img/brand/
// (committed). No master ever lands in a committed path verbatim:
//   - SVG: content-bbox cropped, ids/version/width/height stripped, coordinate
//     precision rounded, whitespace collapsed, optionally recolored.
//   - PNG: luminance keyed to alpha where the master is white-on-black,
//     trimmed to content, resized down, re-encoded.

import sharp from 'sharp';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const SRC = (...p) => path.join(root, 'assets', 'brand-src', ...p);
const OUT = (...p) => path.join(root, 'assets', 'img', 'brand', ...p);
await mkdir(OUT(), { recursive: true });

const kb = async (f) => `${((await stat(f)).size / 1024).toFixed(1)} KB`;
const report = [];

// ---------- helpers ----------

// Content bounding box from the alpha channel of a rasterized buffer.
async function alphaBBox(buffer, width) {
    const { data, info } = await sharp(buffer)
        .resize({ width })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    let minX = info.width, minY = info.height, maxX = -1, maxY = -1;
    for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
            if (data[(y * info.width + x) * info.channels + 3] > 8) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    return { minX, minY, maxX, maxY, w: info.width, h: info.height };
}

async function cleanSvg({ src, dst, recolor, label }) {
    let svg = await readFile(src, 'utf8');

    // 1. crop the master canvas to the artwork's real bounds
    const vb = svg.match(/viewBox="([-\d.\s]+)"/)[1].trim().split(/\s+/).map(Number);
    const [vbX, vbY, vbW, vbH] = vb;
    const rasterW = Math.min(1600, Math.round(vbW));
    const box = await alphaBBox(Buffer.from(svg), rasterW);
    const scale = vbW / box.w;
    const nx = +(vbX + box.minX * scale).toFixed(2);
    const ny = +(vbY + box.minY * scale).toFixed(2);
    const nw = +((box.maxX - box.minX + 1) * scale).toFixed(2);
    const nh = +((box.maxY - box.minY + 1) * scale).toFixed(2);

    // 2. strip editor/master artifacts
    svg = svg
        .replace(/\sversion="[^"]*"/g, '')
        .replace(/\sid="[^"]*"/g, '')
        .replace(/\s(?:width|height)="[^"]*"/g, '')
        .replace(/viewBox="[-\d.\s]+"/, `viewBox="${nx} ${ny} ${nw} ${nh}"`)
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/-?\d*\.\d+/g, (m) => String(+(+m).toFixed(2)))
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim();

    // 3. optional recolor (e.g. dark-background variant of a navy wordmark)
    if (recolor) {
        for (const [from, to] of Object.entries(recolor)) {
            svg = svg.replace(new RegExp(from, 'gi'), to);
        }
    }

    await writeFile(dst, svg + '\n');
    report.push([label, path.relative(root, src), path.relative(root, dst), await kb(src), await kb(dst)]);
}

// White-on-black master → white-on-transparent (luminance becomes alpha).
async function keyToAlpha(src) {
    const grey = sharp(src).flatten({ background: '#000000' }).toColourspace('b-w');
    const { data, info } = await grey.raw().toBuffer({ resolveWithObject: true });
    return sharp({
        create: { width: info.width, height: info.height, channels: 3, background: '#ffffff' },
    })
        .joinChannel(data, { raw: { width: info.width, height: info.height, channels: 1 } })
        .png()
        .toBuffer();
}

// ---------- 1. NTB monogram ----------
{
    const src = SRC('NTB - NTBoomin Logos', 'NTB-LogoFinalV1.png');
    const keyed = await keyToAlpha(src);
    const trimmed = await sharp(keyed).trim().toBuffer();

    const png512 = OUT('ntb-mark.png'); // icon-generation master (committed derivative)
    await sharp(trimmed).resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png({ compressionLevel: 9 }).toFile(png512);
    report.push(['NTB', path.relative(root, src), path.relative(root, png512), await kb(src), await kb(png512)]);

    const webp = OUT('ntb-mark.webp'); // on-page use
    await sharp(trimmed).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 90, alphaQuality: 90 }).toFile(webp);
    report.push(['NTB', path.relative(root, src), path.relative(root, webp), await kb(src), await kb(webp)]);
}

// ---------- 2. NTBoomin wordmark ----------
{
    const src = SRC('NTB - NTBoomin Logos', 'NTBoomin-LogoFinalV1Transparent.png');
    const dst = OUT('ntboomin-wordmark.webp');
    await sharp(src).trim().resize({ width: 480 }).webp({ quality: 90, alphaQuality: 90 }).toFile(dst);
    report.push(['NTBoomin', path.relative(root, src), path.relative(root, dst), await kb(src), await kb(dst)]);
}

// ---------- 3. NTB Labs wordmark (light master → both variants) ----------
await cleanSvg({
    label: 'NTB Labs',
    src: SRC('NTB Labs', 'ntb-labs-outlined.svg'),
    dst: OUT('ntb-labs-wordmark-light.svg'),
});
await cleanSvg({
    label: 'NTB Labs',
    src: SRC('NTB Labs', 'ntb-labs-outlined.svg'),
    dst: OUT('ntb-labs-wordmark-dark.svg'),
    recolor: { '#0b1220': '#eae7f2' }, // variant generated: no dark master existed
});

// ---------- 4. Sift ----------
const siftFinal = ['NTB Labs', 'Sift', 'Final Design'];
await cleanSvg({
    label: 'Sift',
    src: SRC(...siftFinal, 'sift-mark', 'dark-light svg', 'sift-mark-dark.svg'),
    dst: OUT('sift-mark-dark.svg'),
});
await cleanSvg({
    label: 'Sift',
    src: SRC(...siftFinal, 'sift-mark', 'dark-light svg', 'sift-mark-light.svg'),
    dst: OUT('sift-mark-light.svg'),
});
await cleanSvg({
    label: 'Sift',
    src: SRC(...siftFinal, 'sift-lockup-horizontal', 'dark-light svg', 'sift-lockup-horizontal-dark.svg'),
    dst: OUT('sift-lockup-dark.svg'),
});
await cleanSvg({
    label: 'Sift',
    src: SRC(...siftFinal, 'sift-lockup-horizontal', 'dark-light svg', 'sift-lockup-horizontal-light.svg'),
    dst: OUT('sift-lockup-light.svg'),
});

// ---------- Report ----------
console.log('\nbrand      source (private, gitignored)'.padEnd(78) + 'derivative (committed)'.padEnd(44) + 'src → out');
for (const [brand, s, d, sk, dk] of report) {
    console.log(brand.padEnd(11) + s.padEnd(67) + d.padEnd(44) + `${sk} → ${dk}`);
}
