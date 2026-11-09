/** Crépine du forage (zone captante) : position, ouverture des fentes, vitesse d'entrée de l'eau.
 *  Règles de l'art (forages d'eau) :
 *  - la pompe se pose AU-DESSUS de la crépine, dans le tubage plein : l'eau monte le long du moteur et le refroidit,
 *    et la pompe n'aspire pas le sable ni les fines au droit des fentes ;
 *  - le niveau dynamique doit rester au-dessus du haut de la crépine : une crépine dénoyée s'aère, le fer et le
 *    calcaire précipitent, les bactéries ferrugineuses se développent et la colmatent ;
 *  - vitesse d'entrée de l'eau dans les fentes ≤ 3 cm/s (au-delà : pertes de charge, entraînement de fines, colmatage) ;
 *  - ouverture des fentes adaptée au terrain : avec massif filtrant, ≈ d10 du gravier ; sans massif, ≈ d50 de la formation.
 *    Trop grande : le forage produit du sable ; trop fine : elle se colmate et freine l'eau. */
import { isForage } from './hydraulics';
import type { Installation } from './types';

export type FormationId = 'sable_fin' | 'sable_moyen' | 'sable_grossier' | 'socle';
export const FORMATIONS: Record<FormationId, { label: string; d50: number; slot: number; slotPack: number; fines: number }> = {
  sable_fin: { label: 'Sable fin (d50 ≈ 0,2 mm)', d50: 0.2, slot: 0.25, slotPack: 0.5, fines: 1.6 },
  sable_moyen: { label: 'Sable moyen (d50 ≈ 0,5 mm)', d50: 0.5, slot: 0.5, slotPack: 1, fines: 1.2 },
  sable_grossier: { label: 'Sable grossier / gravier (d50 ≈ 1,5 mm)', d50: 1.5, slot: 1, slotPack: 1.5, fines: 0.8 },
  socle: { label: 'Socle fissuré / altérites (granite, schiste)', d50: 0.3, slot: 0.5, slotPack: 1, fines: 1.4 },
};
export const SLOTS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
export interface Screen { top: number; bottom: number; slot: number; type: 'pvc' | 'inox'; formation: FormationId; pack: boolean }

export const screenOf = (i: Installation): Screen | null => (isForage(i) && i.geo.screen && i.geo.screen.bottom > i.geo.screen.top ? i.geo.screen : null);

/** Crépine proposée quand on l'active : sous le niveau dynamique, jusqu'à 3 m du fond (décanteur), massif filtrant. */
export function screenProposal(i: Installation): Screen {
  const g = i.geo;
  const dyn = g.dynTest ?? g.dynamicLevel;
  const top = Math.min(g.boreDepth - 6, Math.round(Math.max(dyn + 4, g.pumpDepth + 3)));
  return { top, bottom: Math.max(top + 3, g.boreDepth - 3), slot: FORMATIONS.socle.slotPack, type: 'pvc', formation: 'socle', pack: true };
}

export interface ScreenCalc {
  len: number; // longueur crépinée (m)
  openRatio: number; // surface ouverte (part de la surface latérale)
  vIn: number; // vitesse d'entrée de l'eau dans les fentes (m/s)
  qVmax: number; // débit qui donne 3 cm/s (m³/h)
  slotRec: number; // ouverture conseillée (mm)
  slotK: number; // ouverture réelle / conseillée
  pos: 'above' | 'inside' | 'below';
  gap: number; // pompe au-dessus du haut de la crépine (m, négatif si dedans)
  dewater: number; // longueur de crépine dénoyée au niveau dynamique (m)
  sump: number; // distance pompe / fond (m)
  clogRate: number; // vitesse de colmatage relative (1 = normale)
}

export function screenCalc(i: Installation, sc: Screen, q: number): ScreenCalc {
  const g = i.geo;
  const len = sc.bottom - sc.top;
  // Surface ouverte : PVC fendu 6 à 15 %, inox à fil enroulé 25 à 45 % ; la moitié est masquée par les grains du massif
  const openRatio = sc.type === 'inox' ? Math.min(0.45, 0.22 + 0.1 * sc.slot) : Math.min(0.15, 0.05 + 0.04 * sc.slot);
  const area = Math.PI * (g.boreDia / 1000) * len * openRatio * 0.5;
  const vIn = q / 3600 / Math.max(1e-4, area);
  const qVmax = 0.03 * area * 3600;
  const f = FORMATIONS[sc.formation];
  const slotRec = sc.pack ? f.slotPack : f.slot;
  const slotK = sc.slot / slotRec;
  const pos = g.pumpDepth < sc.top ? 'above' : g.pumpDepth > sc.bottom ? 'below' : 'inside';
  const dewater = Math.max(0, Math.min(len, g.dynamicLevel - sc.top));
  // Colmatage d'autant plus rapide que l'eau entre vite, que les fentes sont fines, que la crépine est aérée et le terrain fin
  const clogRate = Math.max(0.5, (vIn / 0.03) ** 1.5) * (slotK < 0.7 ? 1.6 : 1) * (dewater > 0.5 ? 1.8 : 1) * (pos === 'inside' ? 1.3 : 1) * f.fines;
  return { len, openRatio, vIn, qVmax, slotRec, slotK, pos, gap: sc.top - g.pumpDepth, dewater, sump: g.boreDepth - g.pumpDepth, clogRate };
}
