// Test-only MP3 encoder: npm.cmd pack lamejs@1.2.1 into TestResults/MusicFixture
// and extract the archive there. Nothing is added to the game's dependencies.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtures = path.join(root, 'TestResults', 'MusicFixture');
const encoderPath = path.join(fixtures, 'package', 'lame.all.js');
if (!fs.existsSync(encoderPath)) {
  throw new Error('Extract lamejs-1.2.1.tgz into unity/TestResults/MusicFixture first.');
}
const context = vm.createContext({ console, Int8Array, Uint8Array, Int16Array, Int32Array, Float32Array, Float64Array, ArrayBuffer, Math });
vm.runInContext(fs.readFileSync(encoderPath, 'utf8'), context);
const rate = 44100;
const seconds = Number(process.argv[2] || 4);
if (!Number.isFinite(seconds) || seconds < 2 || seconds > 60) throw new Error('Fixture duration must be 2–60 seconds.');
const encoder = new context.lamejs.Mp3Encoder(1, rate, 128);
const chunks = [];
for (let base = 0; base < rate * seconds; base += 1152) {
  const samples = new Int16Array(Math.min(1152, rate * seconds - base));
  for (let i = 0; i < samples.length; i++) {
    const t = (base + i) / rate;
    const phase = t % 0.3;
    samples[i] = Math.round(10000 * Math.sin(2 * Math.PI * 440 * t) * Math.exp(-phase * 28));
  }
  const encoded = encoder.encodeBuffer(samples);
  if (encoded.length) chunks.push(Buffer.from(encoded));
}
chunks.push(Buffer.from(encoder.flush()));
const output = path.join(fixtures, seconds === 4 ? 'original-beat.mp3' : `original-beat-${seconds}s.mp3`);
fs.writeFileSync(output, Buffer.concat(chunks));
console.log(JSON.stringify({ file: output, bytes: fs.statSync(output).size, seconds }));
