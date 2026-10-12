// Offline soundtrack (matches the in-browser WebAudio mix): evolving drone pad + wind.
// node tools/gen-audio.mjs out/audio.wav
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'out/audio.wav';
fs.mkdirSync(path.dirname(out), {recursive: true});
const SR = 44100, TOTAL = 900, N = SR * TOTAL;
const BOUNDS = [0, 45, 100, 150, 205, 260, 310, 360, 420, 480, 540, 600, 660, 720, 790, 850, 900];
const KIND = ['space','space','space','space','space','space','space','space','space','dawn','dawn','dawn','dawn','twilight','night','space'];
const CHORDS = [[55,82.41,110,164.8],[49,73.4,98,146.8],[58.3,87.3,116.5,174.6],[52,77.8,103.8,155.6]];
const padTarget = k => k === 'space' ? .5 : k === 'dawn' ? .2 : .3;
const windTarget = k => k === 'space' ? 0 : k === 'dawn' ? .55 : .4;

let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const voices = [];
for (let i = 0; i < 4; i++) for (const dt of [-6, 6]) voices.push({i, det: Math.pow(2, dt / 1200), ph: Math.random(), tri: i > 1});
const freq = [55, 82.41, 110, 164.8];
const sm = (cur, target, tc, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tc));
let padG = 0, windG = 0;
let lpL = [0, 0], lpR = [0, 0], brownL = 0, brownR = 0, bpL = [0, 0], bpR = [0, 0];
const dt = 1 / SR;
const buf = Buffer.alloc(44 + N * 4);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40);

let shot = 0;
for (let n = 0; n < N; n++) {
  const t = n * dt;
  while (shot < KIND.length - 1 && t >= BOUNDS[shot + 1]) shot++;
  if ((n & 255) === 0) {
    const ch = CHORDS[shot % 4];
    for (let i = 0; i < 4; i++) freq[i] = sm(freq[i], ch[i], 3, 256 * dt);
    padG = sm(padG, padTarget(KIND[shot]), 1.5, 256 * dt);
    windG = sm(windG, windTarget(KIND[shot]), 1.5, 256 * dt);
  }
  // pad
  let pl = 0, pr = 0;
  for (let v = 0; v < voices.length; v++) {
    const vo = voices[v];
    vo.ph += freq[vo.i] * vo.det * dt; vo.ph -= Math.floor(vo.ph);
    const x = vo.tri ? (Math.abs(vo.ph * 4 - 2) - 1) : (vo.ph * 2 - 1);
    if (v & 1) pr += x * .05; else pl += x * .05;
  }
  const cut = 700 + 300 * Math.sin(2 * Math.PI * .06 * t);
  const a = 1 - Math.exp(-2 * Math.PI * cut * dt);
  lpL[0] += a * (pl - lpL[0]); lpL[1] += a * (lpL[0] - lpL[1]);
  lpR[0] += a * (pr - lpR[0]); lpR[1] += a * (lpR[0] - lpR[1]);
  // wind: brown noise through resonant band-pass with slow centre sweep
  brownL = .98 * brownL + .02 * rnd(); brownR = .98 * brownR + .02 * rnd();
  const fc = 500 + 260 * Math.sin(2 * Math.PI * .11 * t), f = 2 * Math.sin(Math.PI * Math.min(fc, 4000) * dt), q = 1 / .7;
  const wnd = (st, x) => { st[1] += f * st[0]; const hp = x * 8 - st[1] - q * st[0]; st[0] += f * hp; return st[0]; };
  const wl = wnd(bpL, brownL), wr = wnd(bpR, brownR);
  let L = lpL[1] * padG * 3.2 + wl * windG * .5, R = lpR[1] * padG * 3.2 + wr * windG * .5;
  const fade = Math.min(1, t / 2.5) * Math.min(1, (TOTAL - t) / 4.5);
  L = Math.tanh(L * .6 * fade * 1.4); R = Math.tanh(R * .6 * fade * 1.4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L * 30000))), 44 + n * 4);
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R * 30000))), 46 + n * 4);
}
fs.writeFileSync(out, buf);
console.log('wrote', out, (buf.length / 1e6).toFixed(1), 'MB');
