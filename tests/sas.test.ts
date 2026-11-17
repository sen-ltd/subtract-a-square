import { describe, it, expect } from 'vitest';
import {
  squaresUpTo, moserDeBruijnUpTo, nimValues, coldSieve, nimValuesByLayers,
  coldConvolution, membership, winningMove, mdbFormula, isSquareDifferenceFree, repeatedMedian,
} from '../src/sas.ts';

const N = 4096;
const S = squaresUpTo(N);
const g = nimValues(S, N);

describe('subtract-a-square', () => {
  it('nim-values start like A014586', () => {
    expect(Array.from(g.slice(0, 35))).toEqual([0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 3, 2, 3, 4, 0]);
  });

  it('cold positions start like A030193', () => {
    const c = coldSieve(S, 100);
    const list = [...c.keys()].filter((n) => c[n]);
    expect(list).toEqual([0, 2, 5, 7, 10, 12, 15, 17, 20, 22, 34, 39, 44, 52, 57, 62, 65, 67, 72, 85, 95]);
  });

  it('sieve agrees with nim-value 0', () => {
    const c = coldSieve(S, N);
    for (let n = 0; n < N; n++) expect(c[n] === 1).toBe(g[n] === 0);
  });

  it('cold positions are square-difference-free', () => {
    const c = coldSieve(S, N);
    expect(isSquareDifferenceFree([...c.keys()].filter((n) => c[n]))).toBe(true);
  });

  it('layered sieve (Lemma 2) equals the mex DP', () => {
    expect(Array.from(nimValuesByLayers(S, N))).toEqual(Array.from(g));
  });

  it('divide-and-conquer convolution equals the sieve', () => {
    const M = 1 << 14;
    const SS = squaresUpTo(M);
    expect(Array.from(coldConvolution(membership(SS, M), M))).toEqual(Array.from(coldSieve(SS, M)));
  });

  it('convolution works for an arbitrary subtraction set', () => {
    const set = [2, 3, 7, 11, 30, 31];
    const M = 3000;
    expect(Array.from(coldConvolution(membership(set, M), M))).toEqual(Array.from(coldSieve(set, M)));
  });

  it('convolution with hotspots gives the next nim-value layer', () => {
    const M = 1024;
    const hs = new Uint8Array(M);
    for (let n = 0; n < M; n++) if (g[n] === 0) hs[n] = 1;
    const c = coldConvolution(membership(squaresUpTo(M), M), M, hs);
    for (let n = 0; n < M; n++) expect(c[n] === 1).toBe(g[n] === 1);
  });

  it('winningMove leads to an XOR-zero sum, or null on cold sums', () => {
    for (const heaps of [[34], [5, 7], [29, 28, 3], [100, 200, 300]]) {
      const mv = winningMove(heaps, g);
      let x = 0;
      for (const h of heaps) x ^= g[h];
      if (x === 0) { expect(mv).toBeNull(); continue; }
      expect(mv).not.toBeNull();
      const [i, s] = mv!;
      const after = heaps.slice();
      after[i] -= s;
      expect(after.reduce((a, h) => a ^ g[h], 0)).toBe(0);
    }
  });

  it('Moser–de Bruijn game follows the base-4 formula', () => {
    const M = 1 << 14;
    const gm = nimValues(moserDeBruijnUpTo(M), M);
    for (let n = 0; n < M; n++) expect(gm[n]).toBe(mdbFormula(n));
  });

  it('Moser–de Bruijn numbers', () => {
    expect(moserDeBruijnUpTo(70)).toEqual([1, 4, 5, 16, 17, 20, 21, 64, 65, 68, 69]);
  });

  it('repeated median ignores outliers', () => {
    const xs = [1, 2, 3, 4, 5, 6, 7];
    const ys = xs.map((x) => 2 * x + 1);
    ys[0] = 100;
    const f = repeatedMedian(xs, ys);
    expect(f.slope).toBeCloseTo(2);
    expect(f.intercept).toBeCloseTo(1);
  });
});
