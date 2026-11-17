import './style.css';
import { nimValues, squaresUpTo, winningMove } from './sas.ts';
import run from '../runs/verify.json';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const fmt = (x: number) => x.toLocaleString('en');
const MAX_N = 20_000;
const G = nimValues(squaresUpTo(MAX_N), MAX_N + 1);

// dark-mode series steps (validated reference palette)
const C1 = '#3987e5'; // measured
const C2 = '#d95926'; // fit / base-5 strategy
const C3 = '#199e70'; // best known construction
const GRAY = '#9c9fa6';
const INK = '#ecebe7';
const LINE = '#34373e';

// ------------------------------------------------------------------ play
let heaps: number[] = [34, 1000];
let history: number[][] = [];
let lastCpu: { i: number; s: number } | null = null;
let shown: [number, number] | null = null;

const kSel = $<HTMLSelectElement>('kSel');
const hints = $<HTMLInputElement>('hints');
const cpu = $<HTMLInputElement>('cpu');
const custom = $<HTMLInputElement>('custom');
const pilesEl = $('piles');
const statusEl = $('status');
const rnd = (a: number, b: number) => a + Math.floor(Math.random() * (b - a + 1));
const xor = () => heaps.reduce((x, h) => x ^ G[h], 0);
const over = () => heaps.every((h) => h === 0);

function randomPosition() {
  const k = Number(kSel.value);
  for (let tries = 0; tries < 200; tries++) {
    heaps = Array.from({ length: k }, () => rnd(1, rnd(0, 1) ? 120 : 3000));
    if (xor() !== 0) break;
  }
  history = [];
  lastCpu = null;
  shown = null;
  render();
}

function play(i: number, s: number) {
  history.push([...heaps]);
  heaps = heaps.map((h, j) => (j === i ? h - s : h));
  lastCpu = null;
  shown = null;
  if (cpu.checked && !over()) {
    const mv = winningMove(heaps, G) ?? fallback();
    heaps = heaps.map((h, j) => (j === mv[0] ? h - mv[1] : h));
    lastCpu = { i: mv[0], s: mv[1] };
  }
  render();
}

/** On a cold sum the computer takes 1 from the largest heap (keeps games long). */
function fallback(): [number, number] {
  let i = 0;
  heaps.forEach((h, j) => { if (h > heaps[i]) i = j; });
  return [i, 1];
}

function render() {
  const x = xor();
  pilesEl.innerHTML = '';
  heaps.forEach((h, i) => {
    const div = document.createElement('div');
    div.className = 'pile' + (lastCpu && lastCpu.i === i ? ' cpu' : '');
    const head = document.createElement('div');
    head.className = 'phead';
    head.innerHTML = `<span class="nums">${fmt(h)}</span><span class="g">nim-value ${G[h]}</span>` +
      (lastCpu && lastCpu.i === i ? `<span class="dim small">computer took ${lastCpu.s}</span>` : '') +
      (h > 0 ? `<button class="small rm" data-i="${i}">remove heap</button>` : '');
    div.append(head);
    const mv = document.createElement('div');
    mv.className = 'moves';
    for (const s of squaresUpTo(h)) {
      const b = document.createElement('button');
      b.className = 'mv';
      b.textContent = `−${s}`;
      b.title = `${h} → ${h - s} (nim-value ${G[h - s]})`;
      if (hints.checked && (x ^ G[h] ^ G[h - s]) === 0) b.classList.add('win');
      if (shown && shown[0] === i && shown[1] === s) b.classList.add('shown');
      b.onclick = () => play(i, s);
      mv.append(b);
    }
    div.append(mv);
    pilesEl.append(div);
  });
  pilesEl.querySelectorAll<HTMLButtonElement>('button.rm').forEach((b) => {
    b.onclick = () => {
      if (heaps.length === 1) return;
      heaps.splice(Number(b.dataset.i), 1);
      history = [];
      lastCpu = null;
      render();
    };
  });
  const sum = heaps.map((h) => G[h]).join(' ⊕ ');
  if (over()) {
    statusEl.innerHTML = lastCpu ? '<b class="ng">The computer took the last token.</b>' : '<b class="ok">You took the last token — you win.</b>';
  } else {
    statusEl.innerHTML = `nim-sum ${sum} = <b>${x}</b> — ` + (x
      ? '<span class="ok">you are winning</span>: move so that the nim-sum becomes 0.'
      : '<span class="ng">cold</span>: every move hands your opponent a win.');
  }
}

$('random').onclick = randomPosition;
kSel.onchange = randomPosition;
hints.onchange = render;
$('undo').onclick = () => {
  const h = history.pop();
  if (h) { heaps = h; lastCpu = null; shown = null; render(); }
};
$('best').onclick = () => {
  shown = winningMove(heaps, G);
  if (!shown) statusEl.innerHTML += ' <span class="dim">(no winning move exists)</span>';
  render();
};
custom.onkeydown = (e) => {
  if (e.key !== 'Enter') return;
  const v = Number(custom.value.replace(/[,_\s]/g, ''));
  if (!Number.isInteger(v) || v < 0 || v > MAX_N) { custom.classList.add('bad'); return; }
  custom.classList.remove('bad');
  if (heaps.length >= 3) heaps.shift();
  heaps.push(v);
  history = [];
  lastCpu = null;
  render();
};

// ------------------------------------------------------------------ grid
const grid = $<HTMLCanvasElement>('grid');
const COLS = 64;
const ROWS = 64;
const maxG = Math.max(...G.slice(0, COLS * ROWS));
function seq(v: number): string {
  // sequential blue, dark (small) → light (large), for the dark surface
  const a = [0x18, 0x4f, 0x95];
  const b = [0xcd, 0xe2, 0xfb];
  const t = maxG <= 1 ? 1 : (v - 1) / (maxG - 1);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(',')})`;
}
function drawGrid() {
  const ctx = grid.getContext('2d')!;
  const W = grid.width;
  const cw = W / COLS;
  const ch = (grid.height - 10) / ROWS;
  ctx.fillStyle = '#1d1f23';
  ctx.fillRect(0, 0, W, grid.height);
  for (let n = 0; n < COLS * ROWS; n++) {
    const r = Math.floor(n / COLS);
    const c = n % COLS;
    ctx.fillStyle = G[n] === 0 ? '#000' : seq(G[n]);
    ctx.fillRect(c * cw + 0.5, r * ch + 0.5, cw - 1, ch - 1);
  }
  $('gridLegend').innerHTML = `<span><i class="sq" style="background:#000;border:1px solid ${LINE}"></i>0 (cold)</span>` +
    `<span><i class="sq" style="background:${seq(1)}"></i>1</span>…<span><i class="sq" style="background:${seq(maxG)}"></i>${maxG}</span>`;
}
const cell = (e: MouseEvent) => {
  const r = grid.getBoundingClientRect();
  const c = Math.floor(((e.clientX - r.left) / r.width) * COLS);
  const row = Math.floor(((e.clientY - r.top) / r.height) * (grid.height / ((grid.height - 10) / ROWS)));
  const n = row * COLS + c;
  return n >= 0 && n < COLS * ROWS && c >= 0 && c < COLS ? n : -1;
};
grid.onmousemove = (e) => {
  const n = cell(e);
  $('hover').textContent = n < 0 ? '' : `n = ${n}: nim-value ${G[n]}${G[n] === 0 ? ' (cold)' : ''}; moves to ${squaresUpTo(n).slice(0, 8).map((s) => `${n - s}:${G[n - s]}`).join(' ')}${squaresUpTo(n).length > 8 ? ' …' : ''}`;
};
grid.onclick = (e) => {
  const n = cell(e);
  if (n <= 0) return;
  heaps = [n];
  kSel.value = '1';
  history = [];
  lastCpu = null;
  render();
  pilesEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ------------------------------------------------------------------ log-log charts
type Series = { pts: [number, number][]; color: string; dash?: number[]; dots?: boolean; width?: number };
function loglog(cv: HTMLCanvasElement, series: Series[], xLabel: string, yLabel: string, hoverEl: HTMLElement | null, describe: (p: [number, number]) => string) {
  const ctx = cv.getContext('2d')!;
  const W = cv.width, H = cv.height;
  const L = 56, R = 16, T = 12, B = 34;
  const all = series.flatMap((s) => s.pts);
  const lx0 = 0, lx1 = Math.ceil(Math.log2(Math.max(...all.map((p) => p[0]))));
  const ly1 = Math.ceil(Math.log10(Math.max(...all.map((p) => p[1]))));
  const ly0 = 0;
  const X = (x: number) => L + ((Math.log2(x) - lx0) / (lx1 - lx0)) * (W - L - R);
  const Y = (y: number) => H - B - ((Math.log10(y) - ly0) / (ly1 - ly0)) * (H - T - B);
  const draw = (hl?: [number, number]) => {
    ctx.clearRect(0, 0, W, H);
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.strokeStyle = LINE;
    ctx.fillStyle = GRAY;
    ctx.lineWidth = 1;
    for (let e = lx0; e <= lx1; e += 2) {
      const x = X(2 ** e);
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(`2^${e}`, x, H - B + 14);
    }
    for (let e = ly0; e <= ly1; e++) {
      const y = Y(10 ** e);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(e === 0 ? '1' : `10^${e}`, L - 6, y + 4);
    }
    ctx.textAlign = 'center';
    ctx.fillText(xLabel, (L + W - R) / 2, H - 4);
    ctx.save(); ctx.translate(12, (T + H - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(yLabel, 0, 0); ctx.restore();
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineWidth = s.width ?? 2;
      ctx.setLineDash(s.dash ?? []);
      if (s.dots) {
        for (const [x, y] of s.pts) { ctx.beginPath(); ctx.arc(X(x), Y(y), 2.2, 0, 7); ctx.fill(); }
      } else {
        ctx.beginPath();
        s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
        ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    if (hl) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(hl[0]), T); ctx.lineTo(X(hl[0]), H - B); ctx.stroke();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(X(hl[0]), Y(hl[1]), 4, 0, 7); ctx.fill();
    }
  };
  draw();
  if (!hoverEl) return;
  const main = series[0].pts;
  cv.onmousemove = (e) => {
    const r = cv.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = main[0], bd = Infinity;
    for (const p of main) { const d = Math.abs(X(p[0]) - px); if (d < bd) { bd = d; best = p; } }
    draw(best);
    hoverEl.textContent = describe(best);
  };
  cv.onmouseleave = () => { draw(); hoverEl.textContent = ''; };
}

const fitLine = (c: number, e: number, x0: number, x1: number): [number, number][] =>
  Array.from({ length: 40 }, (_, i) => { const x = x0 * (x1 / x0) ** (i / 39); return [x, c * x ** e] as [number, number]; });

{
  const cubes = (run.cubes as [number, number][]).filter(([n, c]) => n > 0 && c > 0);
  const last = cubes[cubes.length - 1];
  const anchored = (e: number): [number, number][] => fitLine(last[1] / last[0] ** e, e, 1, last[0]);
  const note = $('densityNote');
  loglog($<HTMLCanvasElement>('density'), [
    { pts: cubes, color: C1, width: 2.5 },
    { pts: fitLine(run.coldFit.c, run.coldFit.e, 1, last[0]), color: C2, dash: [6, 4] },
    { pts: anchored(0.733412), color: C3, dash: [2, 3] },
    { pts: fitLine(1, 0.5, 1, last[0]), color: GRAY, dash: [2, 3], width: 1.5 },
  ], 'n', '|C ∩ [0,n)|', note, ([n, c]) => `n = ${fmt(n)} (= ${Math.round(Math.cbrt(n))}³): ${fmt(c)} cold positions, ${(100 * c / n).toPrecision(3)} % of all, ${(c / Math.sqrt(n)).toFixed(1)} × √n`);
  $('densityLegend').innerHTML =
    `<span><i style="background:${C1}"></i>measured (every cube n ≤ 2^${run.logCold})</span>` +
    `<span><i style="background:${C2}"></i>repeated-median fit ${run.coldFit.c.toFixed(2)}·n^${run.coldFit.e.toFixed(4)}</span>` +
    `<span><i style="background:${C3}"></i>slope 0.7334 (densest known construction, anchored at the last point)</span>` +
    `<span><i style="background:${GRAY}"></i>√n (Golomb's lower bound)</span>`;
  note.textContent = `${fmt(run.coldTotal)} cold positions below 2^${run.logCold}. Hover for values.`;
}

{
  const rec = (run.records as [number, number][]).filter(([n]) => n > 0);
  const last = rec[rec.length - 1];
  const note = $('maxnimNote');
  loglog($<HTMLCanvasElement>('maxnim'), [
    { pts: rec, color: C1, dots: true },
    { pts: fitLine(run.recordsFit.c, run.recordsFit.e, 1, 2 ** run.logNim), color: C2, dash: [6, 4] },
    { pts: fitLine(1, 0.5, 1, 2 ** run.logNim), color: GRAY, dash: [2, 3], width: 1.5 },
  ], 'n', 'max nim-value', note, ([n, m]) => `nim-value ${m} first appears at n = ${fmt(n)} (√n = ${Math.floor(Math.sqrt(n))} moves available)`);
  $('maxnimLegend').innerHTML =
    `<span><i class="sq" style="background:${C1};border-radius:50%"></i>record (first n with a new maximum)</span>` +
    `<span><i style="background:${C2}"></i>fit ${run.recordsFit.c.toFixed(2)}·n^${run.recordsFit.e.toFixed(4)} (paper: n^0.351)</span>` +
    `<span><i style="background:${GRAY}"></i>√n = number of moves</span>`;
  note.textContent = `${rec.length} records; the largest nim-value below 2^${run.logNim} is ${last[1]} (first at n = ${fmt(last[0])}). Hover for values.`;
}

// ------------------------------------------------------------------ digit histograms
function histogram(base: number, digit: number, row: number[], good: number[]): HTMLElement {
  const fig = document.createElement('figure');
  const cv = document.createElement('canvas');
  cv.width = 300; cv.height = 150;
  const ctx = cv.getContext('2d')!;
  const tot = row.reduce((a, b) => a + b, 0);
  const shares = row.map((v) => v / tot);
  const top = Math.max(...shares, 1 / base) * 1.08;
  const L = 6, R = 6, T = 8, B = 20;
  const bw = (cv.width - L - R) / base;
  ctx.font = '10px ui-monospace, Menlo, monospace';
  shares.forEach((s, d) => {
    const h = (s / top) * (cv.height - T - B);
    ctx.fillStyle = good.includes(d) ? C1 : '#4a4e57';
    const x = L + d * bw + 1, y = cv.height - B - h;
    ctx.beginPath();
    ctx.roundRect(x, y, bw - 2, h, [Math.min(4, h), Math.min(4, h), 0, 0]);
    ctx.fill();
    ctx.fillStyle = GRAY;
    ctx.textAlign = 'center';
    ctx.fillText(String(d), x + (bw - 2) / 2, cv.height - 6);
  });
  const uy = cv.height - B - (1 / base / top) * (cv.height - T - B);
  ctx.strokeStyle = INK; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(L, uy); ctx.lineTo(cv.width - R, uy); ctx.stroke();
  cv.title = shares.map((s, d) => `${d}: ${(s * 100).toFixed(2)} %`).join('\n');
  const cap = document.createElement('figcaption');
  const place = ['ones', base === 5 ? 'fives' : `${base}s`, base === 5 ? 'twenty-fives' : `${base * base}s`][digit];
  cap.textContent = `base ${base}, ${place} digit` + (good.length ? ` — {${good.join(',')}}: ${(good.reduce((a, d) => a + shares[d], 0) * 100).toFixed(1)} %` : ' — no square-difference-free set mod 7');
  fig.append(cv, cap);
  return fig;
}
{
  const h = run.hist as Record<string, number[][]>;
  const el = $('hists');
  el.append(histogram(5, 0, h['5'][0], [0, 2]), histogram(5, 1, h['5'][1], [0, 2]), histogram(5, 2, h['5'][2], [0, 2]),
    histogram(7, 0, h['7'][0], []), histogram(13, 0, h['13'][0], [0, 2, 7]), histogram(13, 1, h['13'][1], [0, 2, 7]));
}

// ------------------------------------------------------------------ timings
{
  const rows = (run.timings as { logN: number; dp: number; sieve: number; conv: number }[])
    .map((t) => `<tr><td>2^${t.logN}</td><td class="num">${t.dp.toFixed(1)}</td><td class="num">${t.sieve.toFixed(1)}</td><td class="num">${t.conv.toFixed(1)}</td></tr>`).join('');
  $('timings').innerHTML = `<table><tr><th>n</th><th>mex DP, all nim-values (ms)</th><th>sieve, cold only (ms)</th><th>D&amp;C + FFT, cold only (ms)</th></tr>${rows}</table>
  <p class="small dim">The paper's Õ(n) divide-and-conquer is asymptotically best, but it estimates the break-even with the sieve at n ≈ 10^18. In practice the O(|C|·√n) sieve wins by two orders of magnitude here.</p>`;
}

// ------------------------------------------------------------------ checks
{
  const checks = run.checks as { id: string; claim: string; where: string; ok: boolean; detail: string }[];
  const ok = checks.filter((c) => c.ok).length;
  $('checkHead').textContent = `${ok} / ${checks.length} hold — Eppstein, FUN 2018`;
  $('checks').innerHTML = checks.map((c) =>
    `<div class="chk-row"><b class="${c.ok ? 'ok' : 'ng'}">${c.ok ? '✓' : '✗'}</b> ${c.claim} <span class="where">${c.where}</span><div class="detail">${c.detail}</div></div>`).join('');
}

drawGrid();
render();
