// Scroll-jank probe: real compositor scroll gesture down then up,
// rAF frame deltas collected in-page. Usage: node perf-scroll.mjs <label>
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--window-size=1280,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.goto('http://localhost:8080/?theme=dark', { waitUntil: 'networkidle0' });

await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    function loop(t) { window.__frames.push(t - last); last = t; requestAnimationFrame(loop); }
    requestAnimationFrame(loop);
});

const cdp = await page.createCDPSession();
// down
await cdp.send('Input.synthesizeScrollGesture', {
    x: 640, y: 450, xDistance: 0, yDistance: -6000, speed: 2500,
});
await new Promise(r => setTimeout(r, 300));
// up
await cdp.send('Input.synthesizeScrollGesture', {
    x: 640, y: 450, xDistance: 0, yDistance: 6000, speed: 2500,
});
await new Promise(r => setTimeout(r, 300));

const frames = await page.evaluate(() => window.__frames.slice(5));
const total = frames.length;
const avg = frames.reduce((a, b) => a + b, 0) / total;
const long = frames.filter(f => f > 25).length;
const worst = Math.max(...frames);
console.log(`[${process.argv[2] || 'run'}] frames=${total} avgFrame=${avg.toFixed(1)}ms (~${(1000 / avg).toFixed(0)}fps) long(>25ms)=${long} (${(100 * long / total).toFixed(1)}%) worst=${worst.toFixed(0)}ms`);
await browser.close();
