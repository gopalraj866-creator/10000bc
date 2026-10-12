// Headless deterministic renderer: drives the sim frame-by-frame in Chrome (SwiftShader WebGL)
// and pipes JPEG frames into ffmpeg.
//
// Video chunk:  node tools/render.mjs --start 0 --end 45 --fps 30 --height 1080 --crf 18 --out out/chunk-000.mp4
// Still frames: node tools/render.mjs --stills 10,70,125,180,300,520,740,880 --height 720 --outdir out/stills
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => {
  if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : 'true']);
  return a;
}, []));
const FPS = +args.fps || 30, HEIGHT = +args.height || 1080, WIDTH = Math.round(HEIGHT * 16 / 9);
const CRF = args.crf || '18', Q = +(args.quality || .95);

const MIME = {'.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json'};
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  let file;
  if (u === '/' || u === '/index.html') {
    let html = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8');
    html = html.replaceAll('https://cdn.jsdelivr.net/npm/three@0.160.0/', '/vendor/three/');
    res.writeHead(200, {'content-type': 'text/html'}); return res.end(html);
  }
  if (u.startsWith('/vendor/three/')) file = path.join(ROOT, 'node_modules/three', u.slice('/vendor/three/'.length));
  else file = path.join(ROOT, 'public', u);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, {'content-type': MIME[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--mute-audio'],
  defaultViewport: {width: 1280, height: 720},
});
const page = await browser.newPage();
page.on('console', m => { if (['error', 'warning'].includes(m.type())) console.log('[page]', m.text()); });
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html?render=1&h=${HEIGHT}&fps=${FPS}`, {waitUntil: 'load'});
await page.waitForFunction('window.__ready===true', {timeout: 180000});
const fail = await page.evaluate('window.__fail||null');
if (fail) { console.error('FATAL:', fail); await browser.close(); server.close(); process.exit(1); }

const grab = (t) => page.evaluate((tt, q) => {
  window.__renderFrame(tt);
  return document.getElementById('comp').toDataURL('image/jpeg', q).slice(23);
}, t, Q);

if (args.stills) {
  const dir = args.outdir || 'out/stills'; fs.mkdirSync(dir, {recursive: true});
  for (const t of args.stills.split(',').map(Number)) {
    const t0 = Date.now();
    // warm up two frames so one-frame state (shadow maps etc.) is settled
    await grab(Math.max(0, t - 1 / FPS)); const b64 = await grab(t);
    const f = path.join(dir, `t${String(Math.round(t)).padStart(4, '0')}.jpg`);
    fs.writeFileSync(f, Buffer.from(b64, 'base64'));
    console.log(`still t=${t}s -> ${f} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  await browser.close(); server.close(); process.exit(0);
}

const start = +args.start || 0, end = +args.end || 900;
const f0 = Math.round(start * FPS), f1 = Math.round(end * FPS);
const out = args.out || 'out/video.mp4';
fs.mkdirSync(path.dirname(out), {recursive: true});
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-vcodec', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', args.preset || 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p', '-r', String(FPS),
  '-g', String(FPS * 2), '-movflags', '+faststart', out], {stdio: ['pipe', 'inherit', 'inherit']});
const ffDone = new Promise((res, rej) => { ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))); ff.on('error', rej); });

const T0 = Date.now();
for (let f = f0; f < f1; f++) {
  const b64 = await grab(f / FPS);
  if (!ff.stdin.write(Buffer.from(b64, 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  const n = f - f0 + 1;
  if (n % 50 === 0 || f === f1 - 1) {
    const el = (Date.now() - T0) / 1000, per = el / n, left = per * (f1 - f0 - n);
    console.log(`frame ${n}/${f1 - f0}  t=${(f / FPS).toFixed(1)}s  ${per.toFixed(2)} s/frame  ETA ${(left / 60).toFixed(1)} min`);
  }
}
ff.stdin.end();
await ffDone;
await browser.close(); server.close();
console.log('done', out);
