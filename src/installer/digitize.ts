/** Lecture d'une courbe de pompe sur une image (fiche constructeur) : étalonnage des axes et suivi automatique d'une courbe par sa couleur. */

export interface Px { x: number; y: number }
/** Étalonnage d'un axe : deux repères (position en pixels, valeur lue). */
export interface AxisCal { p1: number; v1: number; p2: number; v2: number }

export const toVal = (a: AxisCal, p: number) => a.v1 + ((p - a.p1) * (a.v2 - a.v1)) / (a.p2 - a.p1 || 1);
export const toPx = (a: AxisCal, v: number) => a.p1 + ((v - a.v1) * (a.p2 - a.p1)) / (a.v2 - a.v1 || 1);
export const calOk = (a?: Partial<AxisCal> | null): a is AxisCal =>
  !!a && [a.p1, a.v1, a.p2, a.v2].every((v) => Number.isFinite(v)) && Math.abs((a.p2 ?? 0) - (a.p1 ?? 0)) > 8 && a.v1 !== a.v2;

interface Rgb { r: number; g: number; b: number }
const at = (d: ImageData, x: number, y: number): Rgb => { const k = (y * d.width + x) * 4; return { r: d.data[k], g: d.data[k + 1], b: d.data[k + 2] }; };
function hsl({ r, g, b }: Rgb) {
  const R = r / 255, G = g / 255, B = b / 255;
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = mx === R ? 60 * (((G - B) / d) % 6) : mx === G ? 60 * ((B - R) / d + 2) : 60 * ((R - G) / d + 4);
  return { h: (h + 360) % 360, s, l };
}

/** Pixel de courbe le plus « marqué » (sombre ou coloré) près du point touché : on se cale sur le trait. */
export function snap(d: ImageData, p: Px, r = 6): Px {
  let best = { x: Math.round(p.x), y: Math.round(p.y) }, score = -1;
  for (let y = Math.max(0, Math.round(p.y) - r); y <= Math.min(d.height - 1, Math.round(p.y) + r); y++)
    for (let x = Math.max(0, Math.round(p.x) - r); x <= Math.min(d.width - 1, Math.round(p.x) + r); x++) {
      const c = hsl(at(d, x, y));
      const v = (1 - c.l) + c.s * 0.6 - Math.hypot(x - p.x, y - p.y) * 0.02;
      if (c.l < 0.9 && v > score) { score = v; best = { x, y }; }
    }
  return best;
}

/** Fonction « ce pixel est-il de la couleur de la courbe ? » : même teinte pour un trait coloré (clair ou foncé :
 *  les fabricants dessinent en clair la partie hors plage conseillée), même noirceur pour un trait noir / gris. */
export function matcher(d: ImageData, seed: Px, tol = 0.5) {
  const c0 = hsl(at(d, seed.x, seed.y));
  if (c0.s > 0.22) {
    const dh = 12 + tol * 30; // degrés
    return (x: number, y: number) => { const c = hsl(at(d, x, y)); const dd = Math.min(Math.abs(c.h - c0.h), 360 - Math.abs(c.h - c0.h)); return c.s > 0.12 && c.l < 0.93 && dd < dh; };
  }
  const lmax = Math.min(0.88, c0.l + 0.12 + tol * 0.4);
  return (x: number, y: number) => { const c = hsl(at(d, x, y)); return c.l < lmax && c.s < 0.3; };
}

/** Suit la courbe colonne par colonne depuis le point touché, à gauche puis à droite (continuité verticale).
 *  S'arrête quand le trait disparaît (fin de courbe) ou sort de [xMin, xMax]. Renvoie des points triés par x. */
export function trace(d: ImageData, seed0: Px, opt: { tol?: number; xMin?: number; xMax?: number } = {}): Px[] {
  const seed = snap(d, seed0);
  const ok = matcher(d, seed, opt.tol ?? 0.5);
  const xMin = Math.max(0, Math.floor(opt.xMin ?? 0)), xMax = Math.min(d.width - 1, Math.ceil(opt.xMax ?? d.width - 1));
  const out: Px[] = [];
  const col = (x: number, yPrev: number, slope: number) => {
    const win = 5 + Math.min(10, Math.abs(slope) * 2);
    const yGuess = yPrev + slope;
    let best: number | null = null, bd = Infinity;
    // Centre de chaque trait (suite de pixels) trouvé dans la fenêtre : on garde le plus proche de la direction prise
    let y = Math.max(0, Math.floor(yGuess - win));
    const yEnd = Math.min(d.height - 1, Math.ceil(yGuess + win));
    while (y <= yEnd) {
      if (!ok(x, y)) { y++; continue; }
      const y0 = y; while (y <= yEnd && ok(x, y)) y++;
      if (y - y0 > 14) continue; // trait vertical (axe, quadrillage) : ignoré
      const yc = (y0 + y - 1) / 2, dist = Math.abs(yc - yGuess);
      if (dist < bd) { bd = dist; best = yc; }
    }
    return best;
  };
  for (const dir of [1, -1]) {
    let yPrev = seed.y, slope = 0, miss = 0, last = seed.x;
    for (let x = seed.x + (dir > 0 ? 0 : -1); x >= xMin && x <= xMax; x += dir) {
      const y = col(x, yPrev, slope);
      if (y == null) { if (++miss > 6) break; continue; }
      const step = Math.abs(x - last) || 1;
      slope = slope * 0.7 + ((y - yPrev) / step) * 0.3;
      miss = 0; yPrev = y; last = x;
      out.push({ x, y });
    }
  }
  return out.sort((a, b) => a.x - b.x);
}

/** Ordonnée de la courbe tracée à l'abscisse x (pixels), par interpolation ; null hors de la partie tracée. */
export function yAt(pts: Px[], x: number): number | null {
  if (!pts.length) return null;
  // Petite marge aux extrémités (le trait s'arrête parfois un ou deux pixels avant l'autre courbe)
  if (x < pts[0].x) return pts[0].x - x <= 3 ? pts[0].y : null;
  if (x > pts[pts.length - 1].x) return x - pts[pts.length - 1].x <= 3 ? pts[pts.length - 1].y : null;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].x <= x) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi];
  return b.x === a.x ? a.y : a.y + ((x - a.x) * (b.y - a.y)) / (b.x - a.x);
}

/** n points répartis régulièrement sur la partie tracée (en pixels). */
export function sample(pts: Px[], n: number): Px[] {
  if (pts.length < 2) return pts;
  const x0 = pts[0].x, x1 = pts[pts.length - 1].x;
  return Array.from({ length: n }, (_, k) => { const x = x0 + ((x1 - x0) * k) / (n - 1); return { x, y: yAt(pts, x)! }; });
}
