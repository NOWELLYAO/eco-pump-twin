/** Courbe constructeur saisie point par point, ajustée par moindres carrés. */
export interface PPt { q: number; h: number; eta?: number; npshr?: number }

export interface Fit {
  H: (q: number) => number; // hauteur d'une pompe (m) au débit q (m³/h), vitesse nominale
  E: ((q: number) => number) | null; // rendement (0–1)
  N: ((q: number) => number) | null; // NPSH requis (m)
  qZero: number; // débit où la hauteur s'annule
  maxErr: number; // plus grand écart entre la courbe et les points saisis (m)
  bep: { q: number; h: number; eta: number } | null;
  q0: number; q1: number; // plage couverte par les points
  coef: number[];
}

/** Moindres carrés : y ≈ Σ c_k · f_k(x). */
function lsq(xs: number[], ys: number[], basis: ((x: number) => number)[]): number[] | null {
  const m = basis.length;
  const A = Array.from({ length: m }, () => new Array(m + 1).fill(0));
  for (let n = 0; n < xs.length; n++) {
    const f = basis.map((b) => b(xs[n]));
    for (let r = 0; r < m; r++) { for (let c = 0; c < m; c++) A[r][c] += f[r] * f[c]; A[r][m] += f[r] * ys[n]; }
  }
  for (let c = 0; c < m; c++) {
    let p = c; for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < m; r++) if (r !== c) { const k = A[r][c] / A[c][c]; for (let k2 = c; k2 <= m; k2++) A[r][k2] -= k * A[c][k2]; }
  }
  return A.map((row, r) => row[m] / row[r]);
}

const cache = new Map<string, Fit | null>();

export function validPts(pts?: PPt[]): PPt[] {
  return (pts ?? []).filter((p) => Number.isFinite(p.q) && Number.isFinite(p.h) && p.q >= 0 && p.h > 0).sort((a, b) => a.q - b.q);
}

export function fitCurve(pts0?: PPt[]): Fit | null {
  const pts = validPts(pts0);
  if (pts.length < 3 || new Set(pts.map((p) => p.q)).size < 3) return null;
  const key = JSON.stringify(pts);
  if (cache.has(key)) return cache.get(key)!;
  const xs = pts.map((p) => p.q), ys = pts.map((p) => p.h);
  // H = a + b·q + c·q² ; avec 5 points ou plus, terme cubique pour mieux suivre les courbes plates
  const deg = pts.length >= 5 ? 3 : 2;
  const basis = Array.from({ length: deg + 1 }, (_, k) => (x: number) => x ** k);
  const c = lsq(xs, ys, basis);
  if (!c) { cache.set(key, null); return null; }
  const q1 = xs[xs.length - 1], q0 = xs[0];
  const raw = (q: number) => c.reduce((s, ck, k) => s + ck * q ** k, 0);
  // Au-delà du dernier point : prolongement parabolique (le polynôme pourrait remonter)
  const slope = (raw(q1) - raw(q1 - Math.max(1e-3, q1 * 0.02))) / Math.max(1e-3, q1 * 0.02);
  const Hq = (q: number) => {
    if (q <= q1) return raw(Math.max(0, q));
    const d = q - q1; const s = Math.min(slope, -raw(q1) / Math.max(1, q1) * 0.5);
    return raw(q1) + s * d - (raw(q1) / (q1 * q1 || 1)) * d * d;
  };
  const maxErr = Math.max(...pts.map((p) => Math.abs(Hq(p.q) - p.h)));
  let qZero = q1;
  for (let k = 0; k < 400 && Hq(qZero) > 0; k++) qZero += Math.max(0.01, q1 * 0.01);
  // Rendement : η = b·q + c·q² (nul à débit nul)
  const ep = pts.filter((p) => p.eta != null && p.eta > 0);
  let E: Fit['E'] = null;
  if (ep.length >= 2) {
    const ce = lsq(ep.map((p) => p.q), ep.map((p) => p.eta! / 100), [(x) => x, (x) => x * x]);
    if (ce && ce[1] < 0) E = (q: number) => Math.max(0.02, Math.min(0.95, ce[0] * q + ce[1] * q * q));
  }
  const np = pts.filter((p) => p.npshr != null && p.npshr > 0);
  let N: Fit['N'] = null;
  if (np.length >= 2) {
    const cn = lsq(np.map((p) => p.q), np.map((p) => p.npshr!), [() => 1, (x) => x * x]);
    if (cn) N = (q: number) => Math.max(0.3, cn[0] + cn[1] * q * q);
  }
  let bep: Fit['bep'] = null;
  if (E) {
    let qb = q0, eb = 0;
    for (let k = 0; k <= 200; k++) { const q = (q1 * 1.2 * k) / 200; const e = E(q); if (e > eb) { eb = e; qb = q; } }
    bep = { q: qb, h: Hq(qb), eta: eb };
  }
  const f: Fit = { H: Hq, E, N, qZero, maxErr, bep, q0, q1, coef: c };
  cache.set(key, f);
  return f;
}

/** Points calculés à partir du modèle nominal (pour démarrer la saisie). */
export function ptsFromNominal(qn: number, hn: number, shutoff: number, eta: number, npshr: number): PPt[] {
  const h0 = hn * shutoff, k = (h0 - hn) / (qn * qn);
  return [0, 0.5, 0.8, 1, 1.2, 1.4].map((x) => {
    const q = qn * x;
    return { q: Math.round(q * 10) / 10, h: Math.round((h0 - k * q * q) * 10) / 10, eta: x === 0 ? undefined : Math.round(eta * (2 * x - x * x) * 1000) / 10, npshr: x === 0 ? undefined : Math.round(npshr * (0.55 + 0.45 * x * x) * 10) / 10 };
  });
}
