import type { PumpSpec, SystemSpec } from './types';

/** Conversion : P_hyd (kW) = Q (m³/h) × H (m) / 367 (eau à 20 °C). */
export const hydKw = (q: number, h: number) => (q * h) / 367;
/** 1 bar ≈ 10,2 m de colonne d'eau. */
export const M_PER_BAR = 10.2;
/** Pression atmosphérique moins tension de vapeur, en m (≈ 10,33 − 0,24). */
export const ATM_M = 10.1;

export interface Curve {
  h0: number; // hauteur à débit nul, vitesse nominale
  k: number; // coefficient parabolique
}

export function curveOf(spec: PumpSpec): Curve {
  const h0 = spec.hn * spec.shutoffRatio;
  return { h0, k: (h0 - spec.hn) / (spec.qn * spec.qn) };
}

/** Hauteur d'une pompe saine — lois de similitude : H ∝ s². */
export function headAt(spec: PumpSpec, q: number, s: number): number {
  const { h0, k } = curveOf(spec);
  return s * s * h0 - k * q * q;
}

/** Rendement d'une pompe saine — courbe en cloche centrée sur Q_BEP × s. */
export function etaAt(spec: PumpSpec, q: number, s: number): number {
  const x = q / (spec.qn * s);
  return Math.max(0.02, spec.etaBep * (2 * x - x * x));
}

export function npshrAt(spec: PumpSpec, q: number, s: number): number {
  const x = q / (spec.qn * Math.max(s, 0.1));
  return spec.npshrBep * s * s * (0.55 + 0.45 * x * x);
}

/** Résistance du réseau calée pour passer par le BEP, vanne ouverte. */
export function systemR(spec: PumpSpec, sys: SystemSpec): number {
  return Math.max(0.0001, (spec.hn - sys.hStatic) / (spec.qn * spec.qn));
}

/** Résistance supplémentaire d'une vanne partiellement fermée. */
export const valveFactor = (valvePct: number) => {
  const v = Math.max(0.05, valvePct / 100);
  return 1 / (v * v);
};

export function systemHead(spec: PumpSpec, sys: SystemSpec, q: number, valvePct = 100) {
  return sys.hStatic + systemR(spec, sys) * valveFactor(valvePct) * q * q;
}

/** Puissance électrique attendue d'une pompe saine. */
export function powerAt(spec: PumpSpec, q: number, h: number, s: number) {
  return hydKw(q, h) / etaAt(spec, q, s) / spec.etaMotor;
}

/**
 * Vitesse (fraction de nn) qui place le point de fonctionnement exactement
 * au BEP, vanne grande ouverte. null si inatteignable.
 */
export function optimalSpeed(spec: PumpSpec, sys: SystemSpec): number | null {
  const r = systemR(spec, sys);
  const den = spec.hn - r * spec.qn * spec.qn;
  if (den <= 0) return null;
  const s = Math.sqrt(sys.hStatic / den);
  return Number.isFinite(s) ? s : null;
}

/** Point de fonctionnement d'une pompe saine dans un réseau donné. */
export function operatingPoint(spec: PumpSpec, sys: SystemSpec, s: number, valvePct: number) {
  const { h0, k } = curveOf(spec);
  const r = systemR(spec, sys) * valveFactor(valvePct);
  const num = s * s * h0 - sys.hStatic;
  const q = num > 0 ? Math.sqrt(num / (k + r)) : 0;
  return { q, h: q > 0 ? headAt(spec, q, s) : s * s * h0 };
}
