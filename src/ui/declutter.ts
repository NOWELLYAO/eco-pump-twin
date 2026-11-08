/** Anti-chevauchement des étiquettes d'un schéma SVG : après chaque rendu, les étiquettes
 *  qui se recouvrent (entre elles ou avec un bloc fixe : légende, console) sont décalées
 *  vers la place libre la plus proche. Les dessins eux-mêmes ne bougent pas. */
import { useLayoutEffect, type RefObject } from 'react';

interface Box { x: number; y: number; w: number; h: number }
const hit = (a: Box, b: Box, pad = 2) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

export function declutter(svg: SVGSVGElement, movableSel: string[], fixedSel: string) {
  const vb = svg.viewBox.baseVal;
  const sr = svg.getBoundingClientRect();
  if (!vb || !vb.width || !sr.width) return;
  const k = vb.width / sr.width; // pixels écran → unités du schéma
  const box = (el: Element): Box => {
    const r = el.getBoundingClientRect();
    return { x: (r.left - sr.left) * k, y: (r.top - sr.top) * k, w: r.width * k, h: r.height * k };
  };
  // Par ordre de priorité : les premiers groupes gardent leur place
  const movable = [...new Set(movableSel.flatMap((m) => [...svg.querySelectorAll<SVGGraphicsElement>(m)]))];
  // On repart des positions d'origine
  for (const el of movable) if (el.dataset.dc) { el.removeAttribute('transform'); delete el.dataset.dc; }
  const placed: Box[] = [...svg.querySelectorAll(fixedSel)].map(box).filter((b) => b.w > 0 && b.h > 0);
  const W = vb.width, H = vb.height;
  for (const el of movable) {
    if (el.getAttribute('transform')) { placed.push(box(el)); continue; } // élément déjà transformé par le dessin : on n'y touche pas
    const b = box(el);
    if (b.w === 0 || b.h === 0) continue;
    if (!placed.some((p) => hit(b, p))) { placed.push(b); continue; }
    const sy = b.h + 3, sx = Math.max(16, b.w * 0.5);
    const tries: [number, number][] = [[0, -1], [0, 1], [0, -2], [0, 2], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1], [0, -3], [0, 3], [2, 0], [-2, 0], [2, -1], [-2, -1], [2, 1], [-2, 1]];
    let done = false;
    for (const [ix, iy] of tries) {
      const dx = ix * sx, dy = iy * sy;
      const nb = { ...b, x: b.x + dx, y: b.y + dy };
      if (nb.x < 0 || nb.y < 0 || nb.x + nb.w > W || nb.y + nb.h > H) continue;
      if (placed.some((p) => hit(nb, p))) continue;
      el.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
      el.dataset.dc = '1';
      placed.push(nb); done = true; break;
    }
    if (!done) placed.push(b);
  }
}

/** À appeler dans un composant qui dessine un SVG : relance le tri à chaque rendu. */
export function useDeclutter(ref: RefObject<SVGSVGElement | null>, movableSel: string[], fixedSel: string) {
  useLayoutEffect(() => {
    if (ref.current) declutter(ref.current, movableSel, fixedSel);
  });
}
