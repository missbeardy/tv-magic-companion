// Renders fieldbourne-30s.html to MP4 (1080x1920, 30fps) with voiceover + music (see mix.cjs).
//
//   npm i --no-save playwright-core ffmpeg-static     (or point NODE_PATH at them)
//   node marketing/video/render.cjs                    -> marketing/video/fieldbourne-30s.mp4
//   node marketing/video/render.cjs --stills 0.8,2.5   -> PNG stills only (for review)
//
// Chromium: uses CHROMIUM_PATH, else Playwright's bundled browser.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright-core');
const ffmpeg = require('ffmpeg-static');
const { buildMix } = require('./mix.cjs');

const FPS = 30;
const dir = __dirname;
const html = 'file://' + path.join(dir, 'fieldbourne-30s.html') + '?capture=1';
const out = path.join(dir, 'fieldbourne-30s.mp4');

(async () => {
  // Honour an outbound proxy (Google Fonts must load or the fallback font is captured).
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, proxy });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, ignoreHTTPSErrors: !!proxy });
  await page.goto(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (!(await page.evaluate(() => document.fonts.check('700 40px Lexend')))) throw new Error('Lexend font failed to load');
  const duration = await page.evaluate(() => window.DURATION);

  const stillsArg = process.argv.indexOf('--stills');
  if (stillsArg > -1) {
    for (const t of process.argv[stillsArg + 1].split(',').map(Number)) {
      await page.evaluate((t) => window.seek(t), t);
      await page.screenshot({ path: path.join(dir, `still-${t}.png`) });
    }
    await browser.close();
    return;
  }

  const wav = path.join(dir, 'mix.tmp.wav');
  buildMix(ffmpeg, duration, wav);

  const ff = spawn(ffmpeg, [
    '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-i', wav,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '20', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '160k', '-shortest', out,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const frames = Math.round(duration * FPS);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.seek(t), i / FPS);
    const buf = await page.screenshot({ type: 'png' });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${frames}\n`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  fs.unlinkSync(wav);
  await browser.close();
  console.log('wrote', out);
})();
