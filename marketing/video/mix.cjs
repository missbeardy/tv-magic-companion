// Builds the ad's audio: ElevenLabs voiceover cut into lines and placed on the video
// timeline, over "Sunshine Stomp" (Suno) with its drop on 5.6s, ducked under the voice,
// mastered to -14 LUFS for social. Line times match WARP in fieldbourne-30s.html.
const path = require('path');
const { execFileSync } = require('child_process');

const VO = path.join(__dirname, 'audio', 'voiceover-blake.mp3');
const MUSIC = path.join(__dirname, 'audio', 'music-sunshine-stomp.mp3');
const TEMPO = 1.0;         // VO at natural speed
const MUSIC_START = 9.5;   // track time whose downbeat (15.1s) lands on the video's 5.6s drop

// [line, source start, source end, video start] — source times from silencedetect on the VO
const LINES = [
  ['On the tools.', 0.0, 0.96, 0.2],
  ['Phone rings.', 1.28, 2.31, 1.4],
  ['Missed.', 2.78, 3.26, 2.75],
  ['And the next tradie gets the job.', 3.73, 5.57, 3.5],
  ['FieldBourne texts them back in seconds,', 6.28, 8.48, 5.8],
  ['so they wait for you.', 8.76, 10.04, 8.25],
  ['Their text becomes a lead.', 10.55, 12.28, 10.1],
  ['Name, address, the job.', 12.67, 14.32, 12.1],
  ['Callback timer already running.', 14.71, 16.47, 14.0],
  ['One tap from your price list.', 16.87, 18.56, 16.3],
  ['They sign it on their phone.', 18.89, 20.36, 18.3],
  ['Booked.', 20.75, 21.1, 20.65],
  ['Confirmation and reminder sent for you.', 21.42, 23.7, 21.35],
  ['Invoiced and paid on site.', 24.09, 25.85, 24.45],
  ['No admin at nine at night.', 26.27, 28.16, 26.5],
  ['FieldBourne.', 29.64, 30.32, 29.3],
  ['Never miss a lead.', 30.54, 31.46, 30.3],
  ['Get your nights back.', 31.76, 32.79, 31.5],
  ['Book a free demo.', 33.2, 34.69, 32.8],
];
const PAD = 0.05;

function buildMix(ffmpeg, duration, outWav) {
  const f = [];
  LINES.forEach(([, a, b, at], i) => {
    const s = Math.max(0, a - PAD), e = b + PAD;
    const delay = Math.max(0, Math.round((at - PAD / TEMPO) * 1000));
    f.push(`[0:a]atrim=${s}:${e},asetpts=PTS-STARTPTS,atempo=${TEMPO},afade=t=in:d=0.02,afade=t=out:st=${((e - s) / TEMPO - 0.03).toFixed(3)}:d=0.03,adelay=${delay}|${delay}[v${i}]`);
  });
  f.push(`${LINES.map((_, i) => `[v${i}]`).join('')}amix=inputs=${LINES.length}:normalize=0,highpass=f=80,acompressor=threshold=-18dB:ratio=3:attack=5:release=80,volume=1.6,apad,atrim=0:${duration},asplit=2[vo][key]`);
  // music: quiet intro under the hook, drop at 5.6s, ducked under the voice, out by the end
  f.push(`[1:a]atrim=${MUSIC_START}:${MUSIC_START + duration},asetpts=PTS-STARTPTS,aformat=channel_layouts=stereo,volume=0.495,afade=t=in:d=0.4,afade=t=out:st=${duration - 1.0}:d=1.0[mus]`);
  f.push(`[mus][key]sidechaincompress=threshold=0.04:ratio=6:attack=15:release=300:makeup=1[duck]`);
  f.push(`[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=9,aresample=44100[out]`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', VO, '-i', MUSIC,
    '-filter_complex', f.join(';'), '-map', '[out]', '-ac', '2', '-t', String(duration), outWav]);
}

module.exports = { buildMix };
