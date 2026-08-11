// Manual media pipeline: not a build step. Run from tools/:
//   npm i --no-save sharp
//   node optimize-images.mjs
// Outputs are committed to assets/img/. Sources: tools/src/posters/*.jpg
// (YouTube thumbnails fetched once) and the repo's existing image pools.

import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const out = (...p) => path.join(root, 'assets', 'img', ...p);

const kb = async (file) => `${((await stat(file)).size / 1024).toFixed(0)} KB`;
const report = [];

await mkdir(out('posters'), { recursive: true });
await mkdir(out('logos'), { recursive: true });

// ---------- Video posters: 800x450 WebP q75 ----------
// hqdefault sources are 480x360 with letterbox bars: crop center 480x270 first.
const posters = [
    { name: 'beatboxvr', letterboxed: true },
    { name: 'rocketsim', letterboxed: true },
    { name: 'duelists', letterboxed: true },
    { name: 'origin', letterboxed: false },
];

for (const { name, letterboxed } of posters) {
    const src = path.join(root, 'tools', 'src', 'posters', `${name}.jpg`);
    const dst = out('posters', `${name}.webp`);
    let img = sharp(src);
    if (letterboxed) img = img.extract({ left: 0, top: 45, width: 480, height: 270 });
    await img.resize(800, 450, { fit: 'fill' }).webp({ quality: 75 }).toFile(dst);
    report.push([`posters/${name}.webp`, await kb(src), await kb(dst)]);
}

// ---------- ARCS poster: designed title card, NOT a scraped YT thumbnail ----------
// ARCS is the one video-only card, so its poster carries the card.
//
// TWO variants, because one aspect cannot serve both layouts. Below 42rem the
// facade is 16:9; at and above it the featured card turns the facade into a TALL
// left column (measured 430x1020 at a 900px viewport, 607x744 at 1440). Feeding
// the 16:9 card to that column meant object-fit: cover magnified it up to 2.3x
// and cropped away three quarters of the width - every edge went soft and the
// title ran off the frame. Both variants are now authored ABOVE their largest
// display box, so every render is a downscale.
async function arcsTitleCard({ W, H, markSize, markTop, ruleY, ruleW, titleY, titleSize, subY, subSize, subTrack, stars, file }) {
    const dots = stars
        .map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}" fill="#ffffff"/>`)
        .join('');
    const cardSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
        <linearGradient id="tcBase" x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0%" stop-color="#120c24"/>
            <stop offset="52%" stop-color="#0b0718"/>
            <stop offset="100%" stop-color="#06040e"/>
        </linearGradient>
        <radialGradient id="tcBloom" cx="50%" cy="30%" r="62%">
            <stop offset="0%" stop-color="#67e8f9" stop-opacity="0.20"/>
            <stop offset="42%" stop-color="#a78bfa" stop-opacity="0.14"/>
            <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="tcRule" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#67e8f9" stop-opacity="0"/>
            <stop offset="50%" stop-color="#a78bfa" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="#f0abfc" stop-opacity="0"/>
        </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#tcBase)"/>
    <rect width="${W}" height="${H}" fill="url(#tcBloom)"/>
    ${dots}
    <rect x="${W / 2 - ruleW / 2}" y="${ruleY}" width="${ruleW}" height="${Math.max(2, W / 500)}" fill="url(#tcRule)"/>
    <text x="${W / 2}" y="${titleY}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
          font-size="${titleSize}" font-weight="700" letter-spacing="-1" fill="#eae7f2">ARCS Trainer</text>
    <text x="${W / 2}" y="${subY}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif"
          font-size="${subSize}" letter-spacing="${subTrack}" fill="#a49fc0">SHOWCASE VIDEO</text>
</svg>`;

    const mark = await sharp(path.join(root, 'assets', 'img', 'logos', 'arcs-white.webp'))
        .resize(markSize, markSize, { fit: 'inside' })
        .png()
        .toBuffer();
    const dst = out('posters', file);
    await sharp(Buffer.from(cardSvg))
        .composite([{ input: mark, left: Math.round(W / 2 - markSize / 2), top: markTop }])
        .webp({ quality: 82 })
        .toFile(dst);
    report.push([`posters/${file}`, `(title card ${W}x${H})`, await kb(dst)]);
}

// Wide variant: the 16:9 facade below 42rem, and the <img> fallback. 2x the
// largest 16:9 box the card is ever drawn into.
await arcsTitleCard({
    file: 'arcs.webp', W: 1600, H: 900,
    markSize: 240, markTop: 88,
    ruleY: 652, ruleW: 600, titleY: 760, titleSize: 84, subY: 828, subSize: 32, subTrack: 7,
    stars: [
        [140, 120, 2.0, 0.7], [380, 240, 1.4, 0.45], [600, 96, 1.8, 0.6], [840, 192, 1.2, 0.4],
        [1120, 124, 2.2, 0.75], [1380, 260, 1.6, 0.5], [240, 500, 1.6, 0.5], [500, 660, 2.0, 0.65],
        [800, 570, 1.2, 0.4], [1080, 700, 1.8, 0.6], [1320, 540, 1.4, 0.45], [1480, 780, 2.0, 0.7],
        [110, 800, 1.4, 0.45], [700, 810, 1.6, 0.5],
    ],
});

// Tall variant: the featured card's left column. Aspect 0.62 sits between the
// column's measured extremes (0.42 at 900px, 0.82 at 1440), so cover crops at
// most ~16% off the sides or ~12% off the top and bottom. Everything meaningful
// therefore lives inside x 150-750 and y 180-1270, and the vertical middle is
// left empty for the play button.
await arcsTitleCard({
    file: 'arcs-tall.webp', W: 900, H: 1450,
    markSize: 210, markTop: 250,
    ruleY: 962, ruleW: 420, titleY: 1052, titleSize: 66, subY: 1104, subSize: 24, subTrack: 5.5,
    stars: [
        [180, 240, 1.4, 0.6], [700, 320, 1.1, 0.45], [320, 150, 1.6, 0.7], [640, 560, 1.0, 0.4],
        [240, 700, 1.2, 0.5], [720, 820, 1.5, 0.6], [160, 980, 1.0, 0.4], [760, 1120, 1.3, 0.55],
        [300, 1240, 1.1, 0.45], [620, 1330, 1.5, 0.6], [450, 1390, 1.0, 0.4], [820, 640, 1.2, 0.5],
    ],
});

// ---------- Projects page media: 840x560 WebP ----------
// The catalog page shows these at a 320px box on desktop, but the stacked
// layout lets the well grow to the full column (~824px at its widest), so they
// are authored at 840, which just covers the widest well (~824px) at 1x. Sets of 2+ become slideshows and reuse the Selected Work component,
// which means only the first frame is fetched up front: the rest carry data-src
// and hydrate on first interaction. Sources are local copies in tools/src/more/
// (old portfolio screenshots, itch.io screenshots, and YouTube frames for the
// video-only rows) so the projects page adds no dependency on NTB_Site2/.
await mkdir(out('more'), { recursive: true });
const { readdir } = await import('node:fs/promises');
const mediaCounts = {};

// multi-image sets -> assets/img/more/<project>/sN.webp
for (const project of ['lsystem', 'terrain', 'arcane', 'valley']) {
    const dir = path.join(root, 'tools', 'src', 'more', project);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.webp')).sort();
    await mkdir(out('more', project), { recursive: true });
    for (const f of files) {
        const dst = out('more', project, f);
        const src = path.join(dir, f);
        // Several sources are app screenshots that render on their own black
        // canvas, so a plain centre crop keeps those bars and the frame reads
        // letterboxed even though the image already fills it. Trim uniform
        // borders first, then let sharp pick the salient region rather than the
        // geometric centre. Guarded: if trim would eat more than a third of
        // either axis (the night scenes in valley/ are mostly near-black and
        // would over-trim), fall back to the untrimmed source.
        let input = src;
        try {
            const meta = await sharp(src).metadata();
            const t = await sharp(src).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
            if (t.info.width >= meta.width * 0.66 && t.info.height >= meta.height * 0.66) input = t.data;
        } catch (e) { /* trim can fail on a uniform image; keep the original */ }
        await sharp(input)
            .resize(840, 560, { fit: 'cover', position: sharp.strategy.attention })
            .webp({ quality: 62 })
            .toFile(dst);
        report.push([`more/${project}/${f}`, await kb(src), await kb(dst)]);
    }
    mediaCounts[project] = files.length;
}

// single frames (video-only rows) -> assets/img/more/<name>.webp
for (const [srcName, dstName] of [
    ['tombrush-yt.jpg', 'tombrush.webp'],
    ['gofish-yt.jpg', 'gofish.webp'],
    ['crowd-yt.jpg', 'crowd.webp'],
    ['water-yt.jpg', 'water.webp'],
]) {
    const src = path.join(root, 'tools', 'src', 'more', 'single', srcName);
    const dst = out('more', dstName);
    await sharp(src).resize(840, 560, { fit: 'cover' }).webp({ quality: 62 }).toFile(dst);
    report.push([`more/${dstName}`, await kb(src), await kb(dst)]);
    mediaCounts[dstName.replace('.webp', '')] = 1;
}
console.log('  projects media per entry:', JSON.stringify(mediaCounts));

// ---------- Timeline logos: fit 128x128 WebP (alpha preserved) ----------
const logos = [
    ['ARCS_Logo_Colored_outline.png', 'arcs.webp'],
    ['AWE.png', 'awe.webp'],
    ['goldsmithsG.png', 'goldsmiths.webp'],
    ['Innovate-UK-2019-square.jpg', 'innovate-uk.webp'],
    ['sandiaV1.png', 'sandia.webp'],
    ['university-of-wisconsin-w-seeklogo.png', 'uw-madison.webp'],
    ['3D_Systems_Logo_square.png', '3d-systems.webp'],
    ['QUAD-Graphics.png', 'quad.webp'],
];

for (const [srcName, dstName] of logos) {
    const src = path.join(root, 'assets', 'images', 'timeline', srcName);
    const dst = out('logos', dstName);
    await sharp(src)
        .resize(128, 128, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(dst);
    report.push([`logos/${dstName}`, await kb(src), await kb(dst)]);
}

// ---------- NTB mark ----------
// Committed brand derivative (see tools/brand-export.mjs): filled monogram,
// far more legible at favicon sizes than the old outline version, and keeps
// this pipeline independent of NTB_Site2/ (deleted at cutover).
const markSrc = path.join(root, 'assets', 'img', 'brand', 'ntb-mark.png');

// ---------- og-image: designed 1200x630 dark card ----------
// Site tokens: bg #0a0a0f, text #e8e8ee, muted #9a9aad, spectral 67e8f9/a78bfa/f0abfc.
const stars = [
    [60, 80, 1.2, 0.8], [180, 40, 0.8, 0.5], [320, 110, 1.0, 0.7], [470, 60, 0.7, 0.4],
    [640, 90, 1.3, 0.9], [820, 50, 0.8, 0.5], [980, 120, 1.0, 0.6], [1120, 70, 0.7, 0.5],
    [100, 220, 0.9, 0.6], [260, 300, 1.1, 0.8], [420, 250, 0.6, 0.4], [590, 320, 0.9, 0.6],
    [760, 260, 1.2, 0.85], [930, 330, 0.7, 0.45], [1090, 280, 1.0, 0.7], [1160, 420, 0.8, 0.5],
    [70, 420, 1.0, 0.7], [220, 500, 0.7, 0.45], [380, 460, 1.1, 0.8], [540, 540, 0.8, 0.5],
    [700, 480, 0.6, 0.4], [860, 560, 1.0, 0.7], [1020, 500, 0.8, 0.55], [150, 590, 0.9, 0.6],
].map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" opacity="${o}" fill="#ffffff"/>`).join('');

// Palette tracks the shipped nebula atmosphere in assets/css/style.css.
const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs>
        <linearGradient id="base" x1="0" y1="0" x2="0.55" y2="1">
            <stop offset="0%" stop-color="#1d1036"/>
            <stop offset="45%" stop-color="#150b28"/>
            <stop offset="100%" stop-color="#0f0a1e"/>
        </linearGradient>
        <radialGradient id="washA" cx="12%" cy="8%" r="62%">
            <stop offset="0%" stop-color="#7c3aed" stop-opacity="0.38"/>
            <stop offset="100%" stop-color="#7c3aed" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="washB" cx="88%" cy="20%" r="52%">
            <stop offset="0%" stop-color="#2563eb" stop-opacity="0.30"/>
            <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="washC" cx="78%" cy="96%" r="60%">
            <stop offset="0%" stop-color="#d63384" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="#d63384" stop-opacity="0"/>
        </radialGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#base)"/>
    <rect width="1200" height="630" fill="url(#washA)"/>
    <rect width="1200" height="630" fill="url(#washB)"/>
    <rect width="1200" height="630" fill="url(#washC)"/>
    ${stars}
    <text x="80" y="330" font-family="Segoe UI, Arial, sans-serif" font-size="76" font-weight="700" fill="#e8e8ee" letter-spacing="-1">Nathan Thomas-Benke</text>
    <text x="80" y="400" font-family="Segoe UI, Arial, sans-serif" font-size="32" fill="#9a9aad">XR engineer building real-time 3D training systems</text>
    <text x="80" y="446" font-family="Segoe UI, Arial, sans-serif" font-size="32" fill="#9a9aad">Unity &#183; government &amp; aerospace R&amp;D</text>
</svg>`;

const mark = await sharp(markSrc).resize(240, 240).png().toBuffer();
await sharp(Buffer.from(ogSvg))
    .composite([{ input: mark, left: 890, top: 350 }])
    .jpeg({ quality: 80 })
    .toFile(out('og-image.jpg'));
report.push(['og-image.jpg', '(generated)', await kb(out('og-image.jpg'))]);

// ---------- Favicons: dark rounded tile + white NTB mark ----------
async function favicon(size, name) {
    const r = Math.round(size * 0.2);
    const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
        <rect width="${size}" height="${size}" rx="${r}" fill="#0a0a0f"/>
    </svg>`;
    const m = await sharp(markSrc).resize(Math.round(size * 0.82), Math.round(size * 0.82)).png().toBuffer();
    const offset = Math.round(size * 0.09);
    await sharp(Buffer.from(tile))
        .composite([{ input: m, left: offset, top: offset }])
        .png()
        .toFile(out(name));
    report.push([name, '(generated)', await kb(out(name))]);
}
await favicon(48, 'favicon-48.png');
await favicon(180, 'apple-touch-icon.png');

// (Two earlier hero-portrait experiments lived here: a head-and-shoulders crop
// of NTB-portrait-3.jpeg and an Innovate UK award cutout taken from NTB_Site2/.
// Both were superseded, neither output was referenced by index.html, and the
// second was the last portrait dependency on NTB_Site2/. Removed.)

// ---------- Iterate round: toolchain icons ----------
await mkdir(out('icons'), { recursive: true });
const { copyFile, readFile, writeFile } = await import('node:fs/promises');

// SVGs used as-is (tiny, brand-colored, sit on light chips in both themes)
const svgIcons = [
    [['assets', 'images', 'tools', 'Unity.svg'], 'unity.svg'],
    [['assets', 'images', 'skills', 'CSharp.svg'], 'csharp.svg'],
    [['assets', 'images', 'tools', 'git.svg'], 'git.svg'],
    [['assets', 'images', 'tools', 'plastic-scm-logo.svg'], 'plastic-scm.svg'],
    [['assets', 'images', 'tools', 'azure-devops.svg'], 'azure-devops.svg'],
    [['assets', 'images', 'tools', 'Maya.svg'], 'maya.svg'],
    [['assets', 'images', 'tools', 'AdobePremiere.svg'], 'premiere.svg'],
    [['assets', 'images', 'tools', 'AdobeAfterEffects.svg'], 'after-effects.svg'],
    [['tools', 'src', 'icons', 'meta.svg'], 'meta-quest.svg'],
    [['tools', 'src', 'icons', 'htcvive.svg'], 'htc-vive.svg'],
    [['tools', 'src', 'icons', 'intel.svg'], 'intel.svg'],
];
for (const [srcParts, dstName] of svgIcons) {
    const src = path.join(root, ...srcParts);
    await copyFile(src, out('icons', dstName));
    report.push([`icons/${dstName}`, await kb(src), await kb(out('icons', dstName))]);
}

// PNG icons re-encoded to 144px (72px CSS @2x) WebP
for (const [srcName, dstName] of [['Lens-Studio.png', 'lens-studio.webp'], ['ableton.png', 'ableton.webp']]) {
    const src = path.join(root, 'assets', 'images', 'tools', srcName);
    const dst = out('icons', dstName);
    await sharp(src).resize(144, 144, { fit: 'inside' }).webp({ quality: 82 }).toFile(dst);
    report.push([`icons/${dstName}`, await kb(src), await kb(dst)]);
}

// ---------- Round 4: dark-chip icon set (fuller toolchain) ----------
const r4svg = [
    [['tools', 'src', 'icons', 'unity-white.svg'], 'unity.svg'],
    [['assets', 'images', 'skills', 'CPlus.svg'], 'cpp.svg'],
    [['assets', 'images', 'skills', 'Java.svg'], 'java.svg'],
    [['assets', 'images', 'skills', 'JS.svg'], 'js.svg'],
    [['assets', 'images', 'skills', 'SQL.svg'], 'sql.svg'],
    [['assets', 'images', 'skills', 'Swift.svg'], 'swift.svg'],
    [['assets', 'images', 'skills', 'Objective-C.svg'], 'objective-c.svg'],
    [['assets', 'images', 'skills', 'Python.svg'], 'python.svg'],
    [['tools', 'src', 'icons', 'github-white.svg'], 'github.svg'],
    [['assets', 'images', 'tools', 'vscode.svg'], 'vscode.svg'],
    [['tools', 'src', 'icons', 'rhino-white.svg'], 'rhino.svg'],
    [['assets', 'images', 'tools', 'Photoshop.svg'], 'photoshop.svg'],
];
for (const [srcParts, dstName] of r4svg) {
    const src = path.join(root, ...srcParts);
    await copyFile(src, out('icons', dstName));
    report.push([`icons/${dstName}`, await kb(src), await kb(out('icons', dstName))]);
}

// ---------- Normalize padded viewBoxes ----------
// Some vendor SVGs ship the mark inside a much larger artboard. object-fit
// letterboxes the WHOLE artboard, so the padding silently shrinks the mark -
// Adobe Premiere's source is a 240x234 badge floating in a 560x400 box, which
// rendered ~40% the size of Photoshop's on the same chip. Crop to the art.
// (Values are the measured content bbox of each source, in viewBox units.)
const viewBoxCrops = [
    ['premiere.svg', '0 0 560 400', '160 83 240 234'],
];
for (const [name, from, to] of viewBoxCrops) {
    const file = out('icons', name);
    const svg = await readFile(file, 'utf8');
    if (!svg.includes(`viewBox="${from}"`)) {
        console.warn(`  ! ${name}: expected viewBox "${from}": source changed, crop skipped`);
        continue;
    }
    await writeFile(file, svg.replace(`viewBox="${from}"`, `viewBox="${to}"`));
    report.push([`icons/${name}`, '(viewBox cropped)', await kb(file)]);
}

// Ableton mark (not on Simple Icons): official-style bars, hand-drawn
const abletonSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 20" fill="#ffffff">
<rect x="0" y="0" width="4" height="20"/><rect x="7" y="0" width="4" height="20"/><rect x="14" y="0" width="4" height="20"/>
<rect x="24" y="0" width="20" height="4"/><rect x="24" y="8" width="20" height="4"/><rect x="24" y="16" width="20" height="4"/>
</svg>`;
await writeFile(out('icons', 'ableton.svg'), abletonSvg);
report.push(['icons/ableton.svg', '(drawn)', await kb(out('icons', 'ableton.svg'))]);

// ---------- Hero portrait ----------
// Source is NTB_portrait-2-white.png: chosen for its lighting, which reads far
// more polished than the higher-resolution NTB_Site2 award cutout. Presentation
// wins over pixel count here, so the geometry below is built around what THIS
// asset can support.
//
// It is a 1080x1080 square whose subject occupies only 664px of width, leaving
// ~208px of transparent air per side. Because an element's height follows its
// width, that air pinned the rendered height to the column width and left ~440px
// of dead space beside a ~1030px text block. Trimming the air to a 900px canvas
// buys back most of that height while keeping the render sub-native.
//
// 900 is the deliberate stopping point, not a round number: the portrait box is
// 591px at desktop, so a 900px canvas is a 1.52x downscale - sharp at 1x and
// still sharp at 1.5x DPR. Cutting closer (744px canvas) would be taller but
// would drop below native at 1.25x. Margins are re-added, NOT trimmed flush:
// an earlier round proved a flush subject reads as a visible photo-box, and the
// mask's 6% side fades need transparent pixels to dissolve into (118px = 13%).
{
    const src = path.join(root, 'assets', 'images', 'NTB_portrait-2-white.png');
    const SUBJECT = { left: 211, top: 0, width: 664, height: 1080 }; // measured alpha bbox
    const SIDE = 118;

    const { data, info } = await sharp(src)
        .extract(SUBJECT)
        .extend({
            top: 0, bottom: 0, left: SIDE, right: SIDE,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .ensureAlpha().raw().toBuffer({ resolveWithObject: true });

    // de-fringe: the cutout carries a whitish semi-transparent matte ring that
    // reads as a halo once it sits on the dark field
    for (let i = 0; i < data.length; i += info.channels) {
        const a = data[i + 3];
        if (a > 0 && a < 250 && data[i] > 225 && data[i + 1] > 225 && data[i + 2] > 225) {
            data[i + 3] = 0;
        }
    }
    const clean = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
        .png().toBuffer();

    console.log(`  portrait canvas ${info.width}x${info.height} (aspect ${(info.width / info.height).toFixed(3)})`);
    for (const w of [480, 900]) {
        const dst = out(`portrait-hero-${w}.webp`);
        await sharp(clean).resize(w).webp({ quality: 86, alphaQuality: 82 }).toFile(dst);
        report.push([`portrait-hero-${w}.webp`, `${(await stat(src)).size / 1024 | 0} KB`, await kb(dst)]);
    }
}

// Round 6: white silhouette marks for dark plates (logos with no
// dark-legible form): keep the mark's alpha, fill with near-white.
for (const name of ['ARCS_Logo_Colored_outline']) {
    const src = path.join(root, 'assets', 'images', 'timeline', name + '.png');
    const outName = (name.startsWith('ARCS') ? 'arcs' : '3d-systems') + '-white.webp';
    const alpha = await sharp(src).ensureAlpha().extractChannel(3).resize(128, 128, { fit: 'inside' }).toBuffer();
    const meta = await sharp(alpha).metadata();
    await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background: '#eae7f2' } })
        .joinChannel(alpha)
        .webp({ quality: 90, alphaQuality: 90 })
        .toFile(out('logos', outName));
    report.push([`logos/${outName}`, await kb(src), await kb(out('logos', outName))]);
}

// ---------- Slideshow stills: 800x450 WebP per project ----------
// mode 'cover' = crop-fill; 'contain' = letterbox on the site's dark base
// (portrait phone shots, logos, card renders).
const SLIDES = {
    beatbox: [
        ['assets/images/projects/BeatBoxVR/BeatBoxVR_StaticLogo.png', 'contain'],
        ['assets/images/projects/BeatBoxVR/InnovateShowcaseLiveDemo.jpg', 'cover'],
        ['assets/images/projects/BeatBoxVR/InnovateUKFullGoldsmithsTeam.jpg', 'cover'],
        ['assets/images/projects/BeatBoxVR/TeamGroupCelebration.jpg', 'cover'],
    ],
    rocketsim: [
        ['assets/images/projects/RocketArtillerySim/ArtilleryRocketSetup.png', 'cover'],
        ['assets/images/projects/RocketArtillerySim/ArtilleryRocketSimFPOV.png', 'cover'],
        ['assets/images/projects/RocketArtillerySim/ArtilleryRocketSim3POV.png', 'cover'],
        ['assets/images/projects/RocketArtillerySim/ArtilleryRocketSimLiveTargets.png', 'cover'],
        ['assets/images/projects/RocketArtillerySim/ArtilleryRocketSimMap.png', 'cover'],
    ],
    origin: [
        ['assets/images/projects/OriginOfHumanity/OriginOfHumanityCover.png', 'cover'],
        ['assets/images/projects/OriginOfHumanity/CivBuilderPromo1.png', 'cover'],
        ['assets/images/projects/OriginOfHumanity/CivBuilderPromo3.png', 'cover'],
        ['assets/images/projects/OriginOfHumanity/CivBuilderPromo4.png', 'cover'],
        ['assets/images/projects/OriginOfHumanity/CivBuilderPromo5.png', 'cover'],
    ],
    duelists: [
        ['assets/images/projects/AugmentedDuelistThumbnail.png', 'cover'],
        ['tools/src/duelists/card-bramble.webp', 'contain'],
        ['tools/src/duelists/phone-battle.webp', 'contain'],
        ['tools/src/duelists/phone-summon.webp', 'contain'],
    ],
    catan: [
        ['tools/src/catan-og.png', 'cover'],
        ['tools/src/catan-app.png', 'cover'],
    ],
};
for (const [proj, files] of Object.entries(SLIDES)) {
    await mkdir(out('slides', proj), { recursive: true });
    let i = 0;
    for (const [rel, mode] of files) {
        i++;
        const src = path.join(root, rel);
        const dst = out('slides', proj, `s${i}.webp`);
        let img = sharp(src).resize(800, 450, mode === 'cover'
            ? { fit: 'cover' }
            : { fit: 'contain', background: '#0b0916' });
        await img.webp({ quality: 78 }).toFile(dst);
        report.push([`slides/${proj}/s${i}.webp`, await kb(src), await kb(dst)]);
    }
}

// ---------- Report ----------
console.log('\nasset'.padEnd(32) + 'source'.padEnd(12) + 'output');
for (const [a, s, o] of report) console.log(a.padEnd(31) + s.padEnd(12) + o);
