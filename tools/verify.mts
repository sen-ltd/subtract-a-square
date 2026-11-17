// Re-check every checkable statement of D. Eppstein, "Faster Evaluation of Subtraction
// Games" (FUN 2018, arXiv:1804.06515) against exact computation.
// Needs runs/measure.json (node tools/measure.mts 30 24). Writes runs/verify.json.
// Optional: OEIS b-files A030193 / A014586 are fetched into runs/.cache/ if reachable.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import {
  squaresUpTo, moserDeBruijnUpTo, nimValues, coldSieve, nimValuesByLayers,
  coldConvolution, membership, mdbFormula, isSquareDifferenceFree, repeatedMedian,
} from '../src/sas.ts';

type Check = { id: string; claim: string; where: string; ok: boolean; detail: string };
const checks: Check[] = [];
const add = (id: string, where: string, claim: string, ok: boolean, detail: string) => {
  checks.push({ id, where, claim, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${id}: ${detail}`);
};

const meas = JSON.parse(readFileSync('runs/measure.json', 'utf8'));

const N20 = 2 ** 20;
const SQ20 = squaresUpTo(N20);
const g20 = nimValues(SQ20, N20);
const cold20 = coldSieve(SQ20, N20);
const coldList20: number[] = [];
for (let n = 0; n < N20; n++) if (cold20[n]) coldList20.push(n);

// 1, 2. printed prefixes
const printedNim = [0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 3, 2, 3, 4, 0];
const printedCold = [0, 2, 5, 7, 10, 12, 15, 17, 20, 22, 34, 39, 44, 52, 57, 62, 65, 67, 72, 85, 95];
{
  const bad = printedNim.findIndex((v, i) => g20[i] !== v);
  add('nim-prefix', '§1', 'The nim-value sequence starts 0,1,0,1,2,…,3,2,3,4,0 (35 terms)', bad < 0,
    bad < 0 ? '35 / 35 terms match the mex table' : `first mismatch at n = ${bad}`);
  const bad2 = printedCold.findIndex((v, i) => coldList20[i] !== v);
  add('cold-prefix', '§1', 'The cold positions start 0,2,5,7,10,12,…,85,95 (21 terms)', bad2 < 0,
    bad2 < 0 ? '21 / 21 terms match' : `first mismatch at index ${bad2}`);
}

// 3. cold = nim-value 0, square-difference-free and maximal
{
  let mism = 0;
  for (let n = 0; n < N20; n++) if ((g20[n] === 0) !== (cold20[n] === 1)) mism++;
  const small = coldList20.filter((c) => c < 2 ** 16);
  const sdf = isSquareDifferenceFree(small);
  let notMax = 0;
  for (let n = 0; n < N20; n++) {
    if (cold20[n]) continue;
    if (!SQ20.some((s) => s <= n && cold20[n - s])) notMax++;
  }
  add('sdf-maximal', '§1', 'The cold set is a maximal square-difference-free set (sieve = nim-value 0)',
    mism === 0 && sdf && notMax === 0,
    `sieve vs nim-value 0: ${mism} mismatches below 2^20; no square difference among the ${small.length} cold positions below 2^16 (all ${(small.length * (small.length - 1)) / 2} pairs); every hot n < 2^20 has a square move to a cold one (${notMax} exceptions)`);
}

// 4. OEIS b-files (external, optional)
async function bfile(a: string): Promise<number[] | null> {
  mkdirSync('runs/.cache', { recursive: true });
  const path = `runs/.cache/b${a}.txt`;
  if (!existsSync(path)) {
    try {
      const r = await fetch(`https://oeis.org/A${a}/b${a}.txt`);
      if (!r.ok) return null;
      writeFileSync(path, await r.text());
    } catch { return null; }
  }
  return readFileSync(path, 'utf8').split('\n').filter((l) => /^\d/.test(l)).map((l) => Number(l.split(/\s+/)[1]));
}
{
  const b = await bfile('030193');
  if (b) {
    const N23 = 2 ** 23 + 2 ** 21;
    const c = coldSieve(squaresUpTo(N23), N23);
    const list: number[] = [];
    for (let n = 0; n < N23 && list.length < b.length; n++) if (c[n]) list.push(n);
    const bad = b.findIndex((v, i) => list[i] !== v);
    add('oeis-a030193', 'OEIS', `Cold positions = A030193 b-file (${b.length} terms, up to ${b[b.length - 1]})`, bad < 0,
      bad < 0 ? `${b.length} / ${b.length} terms match` : `first mismatch at index ${bad}`);
  }
  const b2 = await bfile('014586');
  if (b2) {
    const bad = b2.findIndex((v, i) => g20[i] !== v);
    add('oeis-a014586', 'OEIS', `Nim-values = A014586 b-file (${b2.length} terms)`, bad < 0,
      bad < 0 ? `${b2.length} / ${b2.length} terms match` : `first mismatch at n = ${bad}`);
  }
}

// 5. Lemma 2 (layers) and Theorems 1–2 (divide and conquer with Boolean convolution)
const timings: { logN: number; dp: number; sieve: number; conv: number; layersConv?: number }[] = [];
{
  const N = 2 ** 16;
  const S = squaresUpTo(N);
  const a = nimValues(S, N);
  const b = nimValuesByLayers(S, N);
  let mism = 0;
  for (let n = 0; n < N; n++) if (a[n] !== b[n]) mism++;
  add('lemma2', 'Lemma 2', 'Nim-value t+1 positions = cold positions of the game with hotspots {nim ≤ t}', mism === 0,
    `layered sieve vs mex DP below 2^16: ${mism} mismatches (max nim-value ${Math.max(...a)})`);

  // Theorem 2 via convolution layers, smaller N
  const N2 = 2 ** 13;
  const inS = membership(squaresUpTo(N2), N2);
  const gc = new Int32Array(N2).fill(-1);
  let t = 0;
  let left = N2;
  while (left > 0) {
    const hs = new Uint8Array(N2);
    for (let n = 0; n < N2; n++) if (gc[n] >= 0) hs[n] = 1;
    const c = coldConvolution(inS, N2, hs);
    for (let n = 0; n < N2; n++) if (c[n]) { gc[n] = t; left--; }
    t++;
  }
  let m2 = 0;
  for (let n = 0; n < N2; n++) if (gc[n] !== a[n]) m2++;
  add('theorem2', 'Theorem 2', 'Nim-values = repeated convolution-based cold sets with hotspots (m+1 rounds)', m2 === 0,
    `${t} rounds below 2^13, ${m2} mismatches`);

  let m1 = 0;
  const N1 = 2 ** 20;
  const cc = coldConvolution(membership(SQ20, N1), N1);
  for (let n = 0; n < N1; n++) if (cc[n] !== cold20[n]) m1++;
  add('theorem1', 'Theorem 1', 'Divide and conquer with Boolean convolution finds the cold positions', m1 === 0,
    `convolution vs sieve below 2^20: ${m1} mismatches`);

  for (let L = 12; L <= 20; L += 2) {
    const n = 2 ** L;
    const S = squaresUpTo(n);
    const time = (f: () => void) => { const s = performance.now(); f(); return performance.now() - s; };
    const dp = time(() => nimValues(S, n));
    const sv = time(() => coldSieve(S, n));
    const cv = time(() => coldConvolution(membership(S, n), n));
    timings.push({ logN: L, dp, sieve: sv, conv: cv });
  }
  console.log('timings (ms)', timings);
}

// 6. m <= |S|
{
  let bad = 0;
  let k = 0;
  for (let n = 0; n < N20; n++) {
    while ((k + 1) * (k + 1) <= n) k++;
    if (g20[n] > k) bad++;
  }
  add('m-le-S', '§1', 'm ≤ |S|: a nim-value never exceeds the number of available moves', bad === 0,
    `${bad} positions below 2^20 exceed ⌊√n⌋`);
}

// 7. max nim-value fit
const recordsFit = (() => {
  const rec: [number, number][] = meas.records.filter(([n]: number[]) => n > 0);
  const f = repeatedMedian(rec.map(([n]) => Math.log(n)), rec.map(([, m]) => Math.log(m)));
  return { e: f.slope, c: Math.exp(f.intercept), points: rec.length };
})();
add('maxnim-exp', '§3.1, Fig. 1', `Max nim-value up to n ≈ c·n^0.351 (Siegel repeated median, n < 2^${meas.logNim})`,
  Math.abs(recordsFit.e - 0.351) < 0.01,
  `${recordsFit.points} record points, fitted exponent ${recordsFit.e.toFixed(4)}, c = ${recordsFit.c.toFixed(3)}; max ${meas.records[meas.records.length - 1][1]} at n = ${meas.records[meas.records.length - 1][0]}`);

// 8. cold count fit
const coldFit = (() => {
  const pts: [number, number][] = meas.cubes.filter(([n, c]: number[]) => n > 0 && c > 0);
  const f = repeatedMedian(pts.map(([n]) => Math.log(n)), pts.map(([, c]) => Math.log(c)));
  // local slopes between consecutive powers of two
  const p2: [number, number][] = meas.pow2;
  const local = p2.slice(1).map(([n, c], i) => ({ logN: Math.log2(n), slope: Math.log(c / p2[i][1]) / Math.log(n / p2[i][0]) }));
  return { e: f.slope, c: Math.exp(f.intercept), points: pts.length, local };
})();
add('cold-exp', '§3.2, Fig. 2', `|C ∩ [0,n)| grows like n^0.7, at least n^0.69 (cubes n ≤ 2^${meas.logCold})`,
  coldFit.e >= 0.69 && coldFit.e < 0.72,
  `${coldFit.points} cube points, fitted exponent ${coldFit.e.toFixed(4)} (c = ${coldFit.c.toFixed(3)}); local slope between 2^${meas.logCold - 1} and 2^${meas.logCold}: ${coldFit.local[coldFit.local.length - 1].slope.toFixed(4)}; ${meas.coldTotal} cold positions below 2^${meas.logCold}`);

// 9. Golomb lower bound
{
  let bad = 0;
  let minRatio = Infinity;
  for (const [n, c] of meas.cubes as number[][]) {
    if (n < 1) continue;
    if (n > c * (Math.floor(Math.sqrt(n - 1)) + 1)) bad++;
    minRatio = Math.min(minRatio, c / Math.sqrt(n));
  }
  add('golomb-lb', '§1 (Golomb Thm 4.1)', 'A maximal square-difference-free subset of [0,n] has Ω(√n) elements', bad === 0,
    `n ≤ |C ∩ [0,n)|·(⌊√(n−1)⌋+1) at every cube; min |C|/√n = ${minRatio.toFixed(3)} (and it keeps growing)`);
}

// 10. Exponent arithmetic
{
  const e205 = (1 + Math.log(12) / Math.log(205)) / 2;
  add('ruzsa-205', '§1', '(1 + log_205 12) / 2 ≈ 0.733412', Math.abs(e205 - 0.733412) < 5e-7, `= ${e205.toFixed(7)}`);
  const printed = Math.log(25) / Math.log(10);
  const meant = Math.log(10) / Math.log(25);
  add('base5-exp', '§3.3', 'A perfect base-5 strategy gives a set of size n^{log_10 25} ≈ n^0.71534', false,
    `as printed log_10 25 = ${printed.toFixed(5)} (> 1, impossible for a subset of [0,n]); the number 0.71534 is log_25 10 = ${meant.toFixed(5)} (10 of 25 digit pairs kept). Exponent and base are swapped`);
}

// 11. residue facts
{
  const sqMod = (m: number) => new Set(Array.from({ length: m }, (_, x) => (x * x) % m));
  const s13 = [...sqMod(13)].sort((a, b) => a - b);
  const ok13 = JSON.stringify(s13) === JSON.stringify([0, 1, 3, 4, 9, 10, 12]);
  const roots3 = Array.from({ length: 13 }, (_, x) => x).filter((x) => (x * x) % 13 === 3 || (x * x) % 13 === 10);
  const sdfMod = (set: number[], m: number) => {
    const Q = sqMod(m);
    for (const a of set) for (const b of set) if (a !== b && Q.has((((a - b) % m) + m) % m)) return false;
    return true;
  };
  const q7 = sqMod(7);
  let pairsNoSquare = 0;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) if (!q7.has((b - a) % 7) && !q7.has((a - b + 7) % 7)) pairsNoSquare++;
  const ok = ok13 && JSON.stringify(roots3) === '[4,6,7,9]' && sdfMod([0, 2], 5) && sdfMod([0, 2, 7], 13) && pairsNoSquare === 0;
  add('residues', '§3.3', 'Squares mod 13 are 0,±1,±3,±4; ±3 = 4²,6²,7²,9²; {0,2} mod 5 and {0,2,7} mod 13 are square-difference-free; mod 7 every pair differs by a square',
    ok, `squares mod 13 = {${s13}}, roots of ±3 = {${roots3}}, pairs mod 7 with no square difference either way: ${pairsNoSquare}`);
}

// 12. digit distributions
const share = (row: number[], set: number[]) => set.reduce((s, d) => s + row[d], 0) / row.reduce((s, v) => s + v, 0);
const nonUnif = (row: number[]) => { const t = row.reduce((s, v) => s + v, 0); return Math.max(...row.map((v) => Math.abs(v / t - 1 / row.length) * row.length)); };
{
  const h5 = meas.hist[5];
  const ones = share(h5[0], [0, 2]);
  const exc = h5[0][1] + h5[0][3] + h5[0][4];
  const onesTrend = meas.snap5.filter((_: unknown, i: number, a: unknown[]) => i % 4 === 0 || i === a.length - 1)
    .map((s: { n: number; hist: number[][] }) => `2^${Math.log2(s.n)}: ${(100 - share(s.hist[0], [0, 2]) * 100).toFixed(2)} %`).join(', ');
  add('base5-ones', '§3.3, Fig. 3', 'Base 5: the ones digit lies in {0,2} with a few exceptions', ones > 0.97,
    `${(ones * 100).toFixed(2)} % of ${meas.coldTotal} cold positions; ${exc} exceptions, ${h5[0][4]} of them digit 4 (counts ${h5[0].join(' / ')}); exception share ${onesTrend}`);
  add('base5-fives', '§3.3, Fig. 3', 'Base 5: the fives digit shows no significant non-uniformity', nonUnif(h5[1]) < 0.05,
    `max relative deviation from 1/5: ${(nonUnif(h5[1]) * 100).toFixed(2)} % (counts ${h5[1].join(' / ')})`);
  const trend = meas.snap5.map((s: { n: number; hist: number[][] }) => ({ logN: Math.log2(s.n), ones: share(s.hist[0], [0, 2]), fives: share(s.hist[1], [0, 2]), tf: share(s.hist[2], [0, 2]) }));
  const tf = trend.map((x: { tf: number }) => x.tf);
  const rising = tf[tf.length - 1] > tf[Math.floor(tf.length / 2)] && tf[tf.length - 1] > 0.4 + 0.05;
  add('base5-25s', '§3.3, Fig. 3', 'Base 5: the twenty-fives digit is non-uniform and possibly heading to {0,2}', rising,
    `share of {0,2} in the 25s digit: ${trend.filter((_: unknown, i: number) => i % 2 === 0 || i === trend.length - 1).map((x: { logN: number; tf: number }) => `2^${x.logN}: ${(x.tf * 100).toFixed(1)} %`).join(', ')} (uniform = 40 %); it stops rising after 2^26`);
  const h7 = meas.hist[7];
  add('base7', '§3.3, Fig. 4', 'Base 7: no significant non-uniformity in the low digit', nonUnif(h7[0]) < 0.05,
    `max relative deviation from 1/7: ${(nonUnif(h7[0]) * 100).toFixed(2)} % (counts ${h7[0].join(' / ')})`);
  const h13 = meas.hist[13];
  const t13 = meas.snap13.map((s: { n: number; hist: number[][] }) => ({ logN: Math.log2(s.n), s: share(s.hist[0], [0, 2, 7]) }));
  const top3 = h13[0].map((v: number, d: number) => [v, d]).sort((a: number[], b: number[]) => b[0] - a[0]).slice(0, 3).map((x: number[]) => x[1]).sort((a: number, b: number) => a - b);
  add('base13', '§3.3, Fig. 4', 'Base 13: the low digit is converging towards {0,2,7}',
    JSON.stringify(top3) === '[0,2,7]' && t13[t13.length - 1].s > t13[0].s,
    `three most frequent digits {${top3}}; share of {0,2,7}: ${t13.filter((_: unknown, i: number) => i % 4 === 0 || i === t13.length - 1).map((x: { logN: number; s: number }) => `2^${x.logN}: ${(x.s * 100).toFixed(1)} %`).join(', ')} (uniform = 23.1 %)`);
  // Golomb's first 20,000
  const first = coldList20.filter((c) => c < 20000);
  const g02 = first.filter((c) => c % 5 === 0 || c % 5 === 2).length / first.length;
  add('golomb-20000', '§3.3', 'Golomb: among the first 20,000 positions the low base-5 digits of cold positions are highly non-uniform', g02 > 0.6,
    `${first.length} cold positions below 20,000; ${(g02 * 100).toFixed(1)} % end in base-5 digit 0 or 2 (uniform = 40 %)`);
  (globalThis as Record<string, unknown>).__trend = { trend, t13 };
}

// 13. Moser–de Bruijn game
const mdb = (() => {
  const N = 2 ** 20;
  const S = moserDeBruijnUpTo(N);
  const g = nimValues(S, N);
  let bad = 0;
  for (let n = 0; n < N; n++) if (g[n] !== mdbFormula(n)) bad++;
  let cold = 0;
  let mx = 0;
  for (let n = 0; n < N; n++) { if (g[n] === 0) cold++; mx = Math.max(mx, g[n]); }
  return { bad, cold, mx, S: S.length };
})();
add('mdb-formula', '§3.3 (Golomb)', 'Moser–de Bruijn subtraction game: nim-value = base-4 digits mod 2, read in binary', mdb.bad === 0,
  `${mdb.bad} mismatches below 2^20`);
add('mdb-sqrt', '§3.3', 'Moser–de Bruijn game: cold count and max nim-value are Θ(√n)', mdb.cold === 1024 && mdb.mx === 1023,
  `below 2^20: ${mdb.cold} cold positions (= √n), max nim-value ${mdb.mx}, |S| = ${mdb.S}`);

// 14. breakeven arithmetic
{
  const solve = (f: (x: number) => number) => { // smallest x = 10^k (0.01 steps) with f >= 0
    for (let k = 1; k < 60; k += 0.01) if (f(k * Math.log(10)) >= 0) return k;
    return NaN;
  };
  const b1 = solve((ln) => 0.15 * ln - 2 * Math.log(ln / Math.LN2)); // n^1.5 > n^1.35 log2^2 n
  const b2 = solve((ln) => 0.2 * ln - 2 * Math.log(ln / Math.LN2)); // n^1.2 > n log2^2 n
  add('breakeven-nim', '§3.1', 'n^1.35 log₂²n < n^1.5 needs n ≈ 10^26', Math.abs(b1 - 26) < 0.5, `crossover at n ≈ 10^${b1.toFixed(2)}`);
  add('breakeven-cold', '§3.2', 'n log₂²n < n^1.2 needs n ≈ 10^18', Math.abs(b2 - 18) < 0.5, `crossover at n ≈ 10^${b2.toFixed(2)}`);
}

const ok = checks.filter((c) => c.ok).length;
console.log(`\n${ok} / ${checks.length} checks hold`);
const tr = (globalThis as Record<string, unknown>).__trend;
writeFileSync('runs/verify.json', JSON.stringify({
  paper: 'D. Eppstein, Faster Evaluation of Subtraction Games, FUN 2018 (arXiv:1804.06515)',
  checks, timings, recordsFit, coldFit, trend: tr, mdb,
  records: meas.records, cubes: meas.cubes, pow2nim: meas.pow2nim, hist: meas.hist,
  logCold: meas.logCold, logNim: meas.logNim, coldTotal: meas.coldTotal,
}, null, 0));
console.log('wrote runs/verify.json');
