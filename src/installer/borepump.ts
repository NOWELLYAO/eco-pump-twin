/** Pompes immergées de forage : tailles normalisées (3" à 12"), alimentation et diamètre de refoulement. */
import type { Installation } from './types';

export interface BoreSize {
  inch: number; // taille nominale (pouces) = diamètre mini du forage pour la poser
  mm: number; // diamètre hors-tout de la pompe avec son câble (mm)
  phase: 'mono' | 'tri';
  qMax: number; // débit maxi de la gamme (m³/h)
  kwMax: number; // moteur maxi de la gamme (kW)
  dn: number[]; // sorties de refoulement de la gamme (DN, mm)
}
export const BORE_SIZES: BoreSize[] = [
  { inch: 3, mm: 74, phase: 'mono', qMax: 4, kwMax: 1.1, dn: [25, 32] },
  { inch: 4, mm: 98, phase: 'tri', qMax: 22, kwMax: 7.5, dn: [32, 40, 50] },
  { inch: 6, mm: 145, phase: 'tri', qMax: 75, kwMax: 37, dn: [50, 65, 80] },
  { inch: 8, mm: 192, phase: 'tri', qMax: 170, kwMax: 93, dn: [80, 100, 125] },
  { inch: 10, mm: 240, phase: 'tri', qMax: 330, kwMax: 190, dn: [125, 150] },
  { inch: 12, mm: 290, phase: 'tri', qMax: 600, kwMax: 300, dn: [150, 200] },
];
export const sizeLabel = (s: BoreSize) => `${s.inch}" ${s.phase === 'mono' ? 'monophasée' : 'triphasée'}`;
/** Taille d'après le diamètre de la pompe. */
export const sizeOfMm = (mm: number): BoreSize => BORE_SIZES.find((s) => mm <= s.mm + 5) ?? BORE_SIZES[BORE_SIZES.length - 1];
export const sizeOf = (i: Installation): BoreSize => (i.pump.boreIn ? BORE_SIZES.find((s) => s.inch === i.pump.boreIn) : undefined) ?? sizeOfMm(i.pump.diameterMm || 98);

/** Plus petite gamme qui fournit ce débit et cette puissance (et, si possible, entre dans le forage). */
export function sizeFor(q: number, kw: number, boreDia: number): BoreSize {
  const ok = BORE_SIZES.filter((s) => q <= s.qMax && kw <= s.kwMax);
  return ok.find((s) => s.mm + 10 <= boreDia) ?? ok[0] ?? BORE_SIZES[BORE_SIZES.length - 1];
}
/** Sortie de refoulement : la plus petite de la gamme où l'eau ne dépasse pas 2,5 m/s. */
export function outletFor(s: BoreSize, q: number): number {
  const v = (dn: number) => q / 3600 / (Math.PI * (dn / 1000) ** 2 / 4);
  return s.dn.find((d) => v(d) <= 2.5) ?? s.dn[s.dn.length - 1];
}
