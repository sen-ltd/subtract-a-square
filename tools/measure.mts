// Heavy measurements behind the paper's experiments (§3):
//   - sieve of cold positions up to 2^LOG_COLD (paper: 2^30), counts at every cube,
//     low-order digit histograms in bases 5, 7, 13
//   - DP nim-values up to 2^LOG_NIM (paper: 2^24), record maxima
// Writes runs/measure.json. Usage: node tools/measure.mts [logCold=30] [logNim=24]
import { writeFileSync, mkdirSync } from 'node:fs';

const LOG_COLD = Number(process.argv[2] ?? 30);
const LOG_NIM = Number(process.argv[3] ?? 24);
const t0 = Date.now();
const log = (s: string) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${s}`);

// ---------------- cold sieve with a bitset ----------------
const N = 2 ** LOG_COLD;
const hot = new Uint32Array(N / 32);
const coldList: number[] = [];
const cubes: [number, number][] = []; // (n, |C ∩ [0, n)|)
const pow2: [number, number][] = [];
let nextCube = 1;
let cubeK = 1;
let nextPow = 1;
const DIG = { 5: 3, 7: 2, 13: 2 } as const;
type Hist = number[][];
const hist: Record<number, Hist> = {};
for (const b of [5, 7, 13]) hist[b] = Array.from({ length: DIG[b as 5] }, () => new Array(b).fill(0));
// snapshots of base-5 digit histograms at powers of 2 >= 2^14
const snap5: { n: number; hist: Hist }[] = [];
const snap13: { n: number; hist: Hist }[] = [];

const sq: number[] = [];
for (let k = 1; k * k < N; k++) sq.push(k * k);
const sqN = sq.length;

for (let n = 0; n < N; n++) {
  if (n === nextCube) {
    cubes.push([n, coldList.length]);
    cubeK++;
    nextCube = cubeK ** 3;
  }
  if (n === nextPow) {
    pow2.push([n, coldList.length]);
    if (n >= 2 ** 14) {
      snap5.push({ n, hist: hist[5].map((r) => r.slice()) });
      snap13.push({ n, hist: hist[13].map((r) => r.slice()) });
    }
    nextPow *= 2;
    if (n >= 2 ** 20) log(`n = 2^${Math.log2(n)}, cold so far ${coldList.length}`);
  }
  if ((hot[n >>> 5] >>> (n & 31)) & 1) continue;
  coldList.push(n);
  for (const b of [5, 7, 13]) {
    let x = n;
    const h = hist[b];
    for (let d = 0; d < h.length; d++) {
      h[d][x % b]++;
      x = Math.floor(x / b);
    }
  }
  for (let i = 0; i < sqN; i++) {
    const t = n + sq[i];
    if (t >= N) break;
    hot[t >>> 5] |= 1 << (t & 31);
  }
}
cubes.push([N, coldList.length]);
pow2.push([N, coldList.length]);
snap5.push({ n: N, hist: hist[5].map((r) => r.slice()) });
snap13.push({ n: N, hist: hist[13].map((r) => r.slice()) });
log(`sieve done: ${coldList.length} cold positions below 2^${LOG_COLD}`);
const sieveSeconds = (Date.now() - t0) / 1000;

// ---------------- nim-values by DP ----------------
const t1 = Date.now();
const M = 2 ** LOG_NIM;
const g = new Uint16Array(M);
const seen = new Uint32Array(8192);
const records: [number, number][] = [];
let maxG = -1;
const valueCount = new Map<number, number>();
const pow2nim: [number, number][] = [];
let np = 1;
for (let n = 0; n < M; n++) {
  if (n === np) {
    pow2nim.push([n, maxG]);
    np *= 2;
    if (n >= 2 ** 18) log(`nim n = 2^${Math.log2(n)}, max so far ${maxG}`);
  }
  const stamp = n + 1;
  for (let i = 0; i < sqN; i++) {
    const s = sq[i];
    if (s > n) break;
    seen[g[n - s]] = stamp;
  }
  let m = 0;
  while (seen[m] === stamp) m++;
  g[n] = m;
  valueCount.set(m, (valueCount.get(m) ?? 0) + 1);
  if (m > maxG) {
    maxG = m;
    records.push([n, m]);
  }
}
pow2nim.push([M, maxG]);
const nimSeconds = (Date.now() - t1) / 1000;
log(`nim done: max ${maxG} below 2^${LOG_NIM}`);

// first positions of each nim-value and their counts
const counts = [...valueCount.entries()].sort((a, b) => a[0] - b[0]);

mkdirSync('runs', { recursive: true });
writeFileSync(
  'runs/measure.json',
  JSON.stringify({
    logCold: LOG_COLD,
    logNim: LOG_NIM,
    coldTotal: coldList.length,
    cubes,
    pow2,
    hist,
    snap5,
    snap13,
    records,
    pow2nim,
    nimValueCounts: counts,
    sieveSeconds,
    nimSeconds,
    lastCold: coldList.slice(-5),
  }),
);
log('wrote runs/measure.json');
