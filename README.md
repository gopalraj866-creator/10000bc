# Earth 10,000 BC — 15-minute Three.js film, rendered on GitHub Actions

`public/index.html` is the live simulation (16 camera shots, 900 s). The workflow renders it
**frame by frame** in headless Chrome, so the result doesn't depend on real-time speed, then
publishes the MP4 to a GitHub Release.

## Run it on GitHub (no local setup)

1. Create a new GitHub repo and push this folder (`git init && git add . && git commit -m init && git push`).
2. Open **Actions → Render Earth 10,000 BC → Run workflow**.
3. **First run with `mode = preview`.** It renders ~11 still frames from different shots (artifact
   `preview-stills`) and prints seconds-per-frame, so you can check the look and estimate time.
4. Then run with `mode = full`. Defaults: 1080p, 30 fps, 45-second chunks (20 parallel jobs).
   Final job concatenates the chunks, adds the generated soundtrack, and creates the Release
   `earth-10000bc-v1` containing `Earth_10000BC_15min.mp4`.

### Time / limits
- GitHub-hosted runners have no GPU, so WebGL runs on software (SwiftShader): expect a few seconds per
  frame at 1080p. A 45 s chunk at 30 fps is 1,350 frames. If a job gets close to the 6 h limit,
  lower `chunk_seconds` (e.g. 20) or `height`/`fps` (720p / 24 fps is a good first full run).
- Free accounts run up to 20 jobs at once; extra chunks queue.
- Release assets max out at 2 GB per file. At 1080p/CRF 18 you should be well under; for 4K use CRF 22+.

## Run locally
```bash
npm install
curl -L -o public/assets/earth.jpg https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg
npm run preview                      # stills in out/stills
node tools/render.mjs --start 0 --end 30 --fps 30 --height 720 --out out/test.mp4
node tools/gen-audio.mjs out/audio.wav
```
Requires Node 18+ and `ffmpeg`. With a real GPU you can remove the SwiftShader flags in
`tools/render.mjs` for much faster renders.

## Live preview / real-time recording
Open `public/index.html` in desktop Chrome/Edge (via a local server or directly): play, scrub, jump
between shots, or use the in-page recorder.

## Files
- `public/index.html` – simulation (`?render=1&h=1080&fps=30` switches it to deterministic frame mode)
- `tools/render.mjs` – Puppeteer + ffmpeg frame renderer (video chunks or stills)
- `tools/gen-audio.mjs` – offline drone/wind soundtrack → WAV
- `tools/make-matrix.mjs` – builds the parallel chunk matrix
- `.github/workflows/render.yml` – the pipeline

The ice sheets and exposed continental shelves are an artistic approximation derived from the
texture's colours, not real elevation/bathymetry data.
