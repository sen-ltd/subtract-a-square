// Subtract-a-square and friends: exact solvers for single-heap subtraction games.
// No dependencies. Everything here runs both in the browser and in Node.

/** Squares 1, 4, 9, ... that are <= n. */
export function squaresUpTo(n: number): number[] {
  const out: number[] = [];
  for (let k = 1; k * k <= n; k++) out.push(k * k);
  return out;
}

/** Numbers that are sums of distinct powers of 4 (Moser–de Bruijn), positive, <= n. */
export function moserDeBruijnUpTo(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; ; i++) {
    // spread the bits of i to even positions
    let v = 0;
    let b = 0;
    let x = i;
    while (x > 0) {
      if (x & 1) v += 4 ** b;
      x >>>= 1;
      b++;
    }
    if (v > n) break;
    out.push(v);
  }
  return out;
}

/**
 * Naive dynamic programming: nim-value(n) = mex { nim-value(n - s) : s in S, s <= n }.
 * O(n |S|). `S` must be sorted ascending and positive.
 */
export function nimValues(S: readonly number[], N: number): Uint16Array {
  const g = new Uint16Array(N);
  const seen = new Uint32Array(S.length + 2);
  for (let n = 0; n < N; n++) {
    const stamp = n + 1;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (s > n) break;
      const v = g[n - s];
      if (v < seen.length) seen[v] = stamp;
    }
    let m = 0;
    while (seen[m] === stamp) m++;
    g[n] = m;
  }
  return g;
}

/**
 * Sieve for cold positions (nim-value 0), as in Eppstein §3.2: walk n upwards;
 * an unmarked n is cold, and then n + s is marked hot for every s in S.
 * O(|C| |S|). Returns a bitset-free Uint8Array (1 = cold).
 */
export function coldSieve(S: readonly number[], N: number): Uint8Array {
  const hot = new Uint8Array(N);
  const cold = new Uint8Array(N);
  for (let n = 0; n < N; n++) {
    if (hot[n]) continue;
    cold[n] = 1;
    for (let i = 0; i < S.length; i++) {
      const t = n + S[i];
      if (t >= N) break;
      hot[t] = 1;
    }
  }
  return cold;
}

/**
 * Lemma 2 of Eppstein: positions with nim-value t+1 are the cold positions of the
 * game with hotspots H = { n : nim-value(n) <= t }. Layer the sieve value by value.
 * O(sum_t |C_t| |S|) = O(n |S|) in total, but it never computes a mex.
 */
export function nimValuesByLayers(S: readonly number[], N: number): Uint16Array {
  const g = new Uint16Array(N).fill(0xffff);
  let remaining = N;
  const hot = new Uint8Array(N);
  for (let t = 0; remaining > 0; t++) {
    // hotspots: already assigned (value < t)
    for (let n = 0; n < N; n++) hot[n] = g[n] !== 0xffff ? 1 : 0;
    for (let n = 0; n < N; n++) {
      if (hot[n]) continue;
      g[n] = t;
      remaining--;
      for (let i = 0; i < S.length; i++) {
        const u = n + S[i];
        if (u >= N) break;
        hot[u] = 1;
      }
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Eppstein's divide-and-conquer with Boolean convolution (FFT), §2.

function fft(re: Float64Array, im: Float64Array, invert: boolean): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((invert ? 2 : -2) * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const ar = re[i + k + half], ai = im[i + k + half];
        const vr = ar * cr - ai * ci;
        const vi = ar * ci + ai * cr;
        re[i + k + half] = re[i + k] - vr;
        im[i + k + half] = im[i + k] - vi;
        re[i + k] += vr;
        im[i + k] += vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
  if (invert) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Boolean convolution restricted to an output window:
 * out[i - lo] = OR_{j in [a,b), s in S} (A[j] && j + s == i) for i in [lo, hi).
 */
function boolConvWindow(
  cold: Uint8Array, a: number, b: number,
  inS: Uint8Array, lo: number, hi: number, out: Uint8Array,
): void {
  // shifts that matter: s in [lo - (b-1), hi - 1 - a]
  const sMin = Math.max(1, lo - (b - 1));
  const sMax = hi - 1 - a;
  const lenA = b - a;
  const lenS = sMax - sMin + 1;
  if (lenS <= 0) return;
  if (lenA * lenS <= 4096) {
    for (let j = a; j < b; j++) {
      if (!cold[j]) continue;
      for (let s = sMin; s <= sMax; s++) {
        if (s < inS.length && inS[s]) {
          const i = j + s;
          if (i >= lo && i < hi) out[i - lo] = 1;
        }
      }
    }
    return;
  }
  let size = 1;
  while (size < lenA + lenS) size <<= 1;
  const ar = new Float64Array(size), ai = new Float64Array(size);
  const br = new Float64Array(size), bi = new Float64Array(size);
  for (let j = 0; j < lenA; j++) ar[j] = cold[a + j];
  for (let s = 0; s < lenS; s++) br[s] = sMin + s < inS.length ? inS[sMin + s] : 0;
  fft(ar, ai, false);
  fft(br, bi, false);
  for (let k = 0; k < size; k++) {
    const r = ar[k] * br[k] - ai[k] * bi[k];
    ai[k] = ar[k] * bi[k] + ai[k] * br[k];
    ar[k] = r;
  }
  fft(ar, ai, true);
  // index k corresponds to position a + sMin + k
  for (let i = lo; i < hi; i++) {
    const k = i - a - sMin;
    if (k >= 0 && k < size && ar[k] > 0.5) out[i - lo] = 1;
  }
}

/**
 * Cold positions of the subtraction game with subtraction set S (given as a membership
 * array inS[s] = 1) and initial hotspots, in [0, N), by divide and conquer in
 * O(N log^2 N). Returns cold flags.
 */
export function coldConvolution(inS: Uint8Array, N: number, hotspots?: Uint8Array): Uint8Array {
  const hot = new Uint8Array(N);
  if (hotspots) hot.set(hotspots.subarray(0, N));
  const cold = new Uint8Array(N);
  const LEAF = 64;
  const solve = (x: number, y: number): void => {
    if (y - x <= LEAF) {
      // direct: positions in [x,y) are hot if marked or reachable from a cold one inside
      for (let n = x; n < y; n++) {
        if (hot[n]) continue;
        cold[n] = 1;
        for (let m = n + 1; m < y; m++) if (m - n < inS.length && inS[m - n]) hot[m] = 1;
      }
      return;
    }
    const m = (x + y) >> 1;
    solve(x, m);
    const tmp = new Uint8Array(y - m);
    boolConvWindow(cold, x, m, inS, m, y, tmp);
    for (let i = 0; i < tmp.length; i++) if (tmp[i]) hot[m + i] = 1;
    solve(m, y);
  };
  solve(0, N);
  return cold;
}

/** Membership array for a sorted subtraction set, length N. */
export function membership(S: readonly number[], N: number): Uint8Array {
  const a = new Uint8Array(N);
  for (const s of S) if (s < N) a[s] = 1;
  return a;
}

// ---------------------------------------------------------------------------
// Play helpers (multi-heap sums).

export function legalMoves(n: number): number[] {
  return squaresUpTo(n);
}

/** A winning move (heap index, amount) for a sum of heaps, or null if the position is cold. */
export function winningMove(heaps: readonly number[], g: ArrayLike<number>): [number, number] | null {
  let x = 0;
  for (const h of heaps) x ^= g[h];
  if (x === 0) return null;
  for (let i = 0; i < heaps.length; i++) {
    const target = x ^ g[heaps[i]];
    for (const s of squaresUpTo(heaps[i])) {
      if (g[heaps[i] - s] === target) return [i, s];
    }
  }
  return null; // unreachable for a correct table
}

/** Moser–de Bruijn closed form claimed in Eppstein §3.3: base-4 digits mod 2, read in binary. */
export function mdbFormula(n: number): number {
  let v = 0;
  let bit = 1;
  while (n > 0) {
    if ((n % 4) % 2 === 1) v += bit;
    n = Math.floor(n / 4);
    bit *= 2;
  }
  return v;
}

/** True iff no two elements of the sorted list differ by a positive square. */
export function isSquareDifferenceFree(xs: readonly number[]): boolean {
  for (let i = 0; i < xs.length; i++)
    for (let j = i + 1; j < xs.length; j++) {
      const d = xs[j] - xs[i];
      const r = Math.round(Math.sqrt(d));
      if (r * r === d) return false;
    }
  return true;
}

/** Siegel's repeated median line fit y = a + b x. */
export function repeatedMedian(xs: readonly number[], ys: readonly number[]): { slope: number; intercept: number } {
  const med = (v: number[]): number => {
    const s = [...v].sort((p, q) => p - q);
    const h = s.length >> 1;
    return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
  };
  const inner: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    const sl: number[] = [];
    for (let j = 0; j < xs.length; j++) if (j !== i && xs[j] !== xs[i]) sl.push((ys[j] - ys[i]) / (xs[j] - xs[i]));
    inner.push(med(sl));
  }
  const slope = med(inner);
  const intercept = med(xs.map((x, i) => ys[i] - slope * x));
  return { slope, intercept };
}
