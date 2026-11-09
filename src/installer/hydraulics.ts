import { etaAt, npshrAt } from '../engine/physics';
import { fitCurve, type Fit } from './pumpcurve';
import type { PumpSpec } from '../engine/types';
import { ACC, ACCESSORIES, FLUIDS, PIPE_MATS, refLen, refStatic } from './catalog';
import type { FluidId, Installation, PipeRun } from './types';
import { backupCalc, backupMode, backupOf } from './backup';

const G = 9.81;
export const area = (dnMm: number) => (Math.PI / 4) * (dnMm / 1000) ** 2;
export const vel = (qM3h: number, dnMm: number) => (dnMm > 0 ? qM3h / 3600 / area(dnMm) : 0);
const dyn = (v: number) => (v * v) / (2 * G);

/** Pression atmosphérique selon l'altitude (kPa). */
export const patm = (alt: number) => 101.325 * (1 - 2.25577e-5 * alt) ** 5.25588;

/** Tension de vapeur de l'eau (kPa), formule d'Antoine. */
export const pvWater = (t: number) => 0.133322 * 10 ** (8.07131 - 1730.63 / (233.426 + t));

/** Masse volumique et viscosité de l'eau selon la température. */
export function waterProps(t: number) {
  const rho = 1000 - 0.0178 * Math.abs(t - 4) ** 1.7;
  const nu = 1.78 / (1 + 0.0337 * t + 0.000221 * t * t);
  return { rho, nu };
}

/** Propriétés par défaut d'un fluide à une température donnée. */
export function fluidAt(type: FluidId, t: number) {
  const d = FLUIDS[type];
  if (d.water) {
    const w = waterProps(t);
    const solidsRho = d.rho - 998;
    return { rho: Math.round(w.rho + solidsRho), nu: Math.round(w.nu * d.nu * 100) / 100 };
  }
  // Hydrocarbures : la viscosité chute avec la température.
  return { rho: Math.round(d.rho * (1 - 0.0007 * (t - 20))), nu: Math.round(d.nu * Math.exp(-0.025 * (t - 20)) * 10) / 10 };
}

export function vaporPressure(i: Installation) {
  const d = FLUIDS[i.fluid.type];
  return d.water ? pvWater(i.fluid.temp) : (d.pv ?? 1) * Math.exp(0.04 * (i.fluid.temp - 20));
}

/** Perte de charge linéaire Darcy-Weisbach, coefficient de Swamee-Jain. */
export function friction(run: PipeRun, length: number, q: number, nuCst: number) {
  const d = run.dn / 1000;
  const v = vel(q, run.dn);
  if (v <= 0 || d <= 0) return { v: 0, re: 0, f: 0, h: 0 };
  const re = (v * d) / (nuCst * 1e-6);
  const eps = PIPE_MATS[run.material].rough / 1000;
  const f = re < 2300 ? 64 / Math.max(re, 1) : 0.25 / Math.log10(eps / (3.7 * d) + 5.74 / re ** 0.9) ** 2;
  return { v, re, f, h: f * (length / d) * dyn(v) };
}

/** Coefficients de correction pour liquides visqueux (approximation Hydraulic Institute). */
export function viscCorr(nu: number) {
  if (nu <= 10) return { ch: 1, ceta: 1, cq: 1 };
  const ceta = Math.max(0.15, 1 - 0.14 * Math.log(nu / 10) - 0.012 * Math.log(nu / 10) ** 2);
  const ch = 1 - (1 - ceta) * 0.35;
  return { ch, ceta, cq: ch };
}

export const isForage = (i: Installation) => i.pumpType === 'immergee_forage';

/** Hauteur géométrique totale (m). */
export function staticHead(i: Installation) {
  if (isForage(i)) return i.geo.dynamicLevel + i.geo.hRef;
  if (i.mode === 'aspiration') return i.geo.hRef + i.geo.suctionLift;
  if (i.mode === 'charge') return i.geo.hRef - i.geo.chargeHead;
  return i.geo.hRef - i.geo.wetLevel;
}

/** Niveau du liquide au-dessus (+) ou au-dessous (−) de l'entrée de la pompe (m). */
/** Cote de référence des pressions du réseau (pressostat, réservoir à vessie, capteur) : en forage, ils sont
 *  en surface, au-dessus du niveau dynamique ; ailleurs ils sont au refoulement de la pompe. H = p/ρg − pressZ. */
export function pressZ(i: Installation) {
  return isForage(i) ? -i.geo.dynamicLevel : suctionZ(i);
}

export function suctionZ(i: Installation) {
  if (isForage(i)) return i.geo.pumpDepth - i.geo.dynamicLevel;
  if (i.mode === 'aspiration') return -i.geo.suctionLift;
  if (i.mode === 'charge') return i.geo.chargeHead;
  return i.geo.wetLevel;
}

export interface LossDetail { label: string; h: number; side: 'asp' | 'ref' }

/** Pertes de charge totales à un débit donné, détaillées. */
export function losses(i: Installation, q: number) {
  const nu = i.fluid.nu;
  const items: LossDetail[] = [];
  let asp = 0, ref = 0;
  const onAcc = (side: 'asp' | 'ref') => ACCESSORIES.filter((a) => a.side === side && a.inline && i.acc[a.id]?.on);

  if (i.mode !== 'immergee') {
    const fr = friction(i.asp, i.asp.length, q, nu);
    asp += fr.h; items.push({ label: `Conduite d'aspiration ${i.asp.length} m`, h: fr.h, side: 'asp' });
    const el = i.asp.elbows * 0.3 * dyn(fr.v);
    if (el > 0) { asp += el; items.push({ label: `${i.asp.elbows} coude(s) aspiration`, h: el, side: 'asp' }); }
    const hasInlet = i.acc.clapet_pied?.on || i.acc.crepine?.on;
    if (!hasInlet) { const e = 0.5 * dyn(fr.v); asp += e; items.push({ label: 'Entrée de conduite', h: e, side: 'asp' }); }
    for (const a of onAcc('asp')) {
      const s = i.acc[a.id];
      const h = a.k * dyn(vel(q, s.dn || i.asp.dn)) * Math.max(1, s.qty || 1);
      asp += h; items.push({ label: a.label, h, side: 'asp' });
    }
  } else {
    const h = 0.5 * dyn(vel(q, i.pump.dnRef));
    asp += h; items.push({ label: 'Crépine intégrée', h, side: 'asp' });
  }

  const L = refLen(i);
  const fr = friction(i.ref, L, q, nu);
  ref += fr.h; items.push({ label: `Conduite de refoulement ${Math.round(L)} m`, h: fr.h, side: 'ref' });
  const el = i.ref.elbows * 0.3 * dyn(fr.v);
  if (el > 0) { ref += el; items.push({ label: `${i.ref.elbows} coude(s) refoulement`, h: el, side: 'ref' }); }
  for (const a of onAcc('ref')) {
    const s = i.acc[a.id];
    const h = a.k * dyn(vel(q, s.dn || i.ref.dn)) * Math.max(1, s.qty || 1);
    ref += h; items.push({ label: a.label, h, side: 'ref' });
  }
  const ex = 1.0 * dyn(fr.v);
  ref += ex; items.push({ label: 'Sortie de conduite', h: ex, side: 'ref' });
  return { asp, ref, total: asp + ref, items };
}

export function specOf(i: Installation): PumpSpec {
  return { qn: i.pump.qn, hn: i.pump.hn, etaBep: i.pump.eta, nn: i.pump.nn, motorKw: i.pump.motorKw, etaMotor: 0.88, npshrBep: i.pump.npshr, shutoffRatio: i.pump.shutoff };
}

/** Nombre de pompes qui tournent en même temps (installées − secours). */
export const nRun = (i: Installation) => Math.max(1, Math.round((i.pump.count ?? 1) - (i.pump.standby ?? 0)));

/** Courbe de l'ensemble des pompes en service (en parallèle : débits additionnés à hauteur égale). */
/** Courbe constructeur active (si saisie et valide). */
export const pumpFit = (i: Installation): Fit | null => (i.pump.usePts ? fitCurve(i.pump.pts) : null);

export function pumpHead(i: Installation, q: number) {
  const qe = q / nRun(i);
  const f = pumpFit(i);
  if (f) return viscCorr(i.fluid.nu).ch * f.H(qe);
  const h0 = i.pump.hn * i.pump.shutoff;
  const k = (h0 - i.pump.hn) / (i.pump.qn * i.pump.qn);
  return viscCorr(i.fluid.nu).ch * (h0 - k * qe * qe);
}

/** Rendement d'une pompe au débit qe (par pompe), vitesse nominale. */
export function pumpEta(i: Installation, qe: number) {
  const f = pumpFit(i);
  return f?.E ? f.E(qe) : etaAt(specOf(i), qe, 1);
}
export function pumpNpshr(i: Installation, qe: number) {
  const f = pumpFit(i);
  return f?.N ? f.N(qe) : npshrAt(specOf(i), qe, 1);
}
/** Débit maxi d'une pompe (hauteur nulle). */
export function pumpQZero(i: Installation) {
  const f = pumpFit(i);
  if (f) return f.qZero;
  const k = (i.pump.hn * i.pump.shutoff - i.pump.hn) / (i.pump.qn * i.pump.qn);
  return Math.sqrt((i.pump.hn * i.pump.shutoff) / k);
}
/** Vitesse relative (variateur) pour que l'ensemble donne la hauteur hTarget au débit total q : H(q, s) = s² · H(q / s). */
export function speedFor(i: Installation, q: number, hTarget: number) {
  const g = (s: number) => s * s * pumpHead(i, q / s) - hTarget;
  if (g(1.3) < 0) return Infinity;
  let lo = 0.05, hi = 1.3;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (g(m) > 0) hi = m; else lo = m; }
  return hi;
}

/** Pression à fournir au point d'arrivée (m). Réservoir de secours en série : la pompe ne sert plus la maison mais
 *  remplit la cuve par le haut (robinet à flotteur) — c'est la cuve qui donne la pression aux robinets. */
export const pressureHead = (i: Installation) => {
  const b = backupOf(i);
  if (b && backupMode(b) === 'serie') return backupCalc(i, b).headTop * 1e5 / (i.fluid.rho * G) - Math.max(0, i.geo.hRef);
  return (i.duty.pRes * 1e5) / (i.fluid.rho * G);
};
export const systemHeadAt = (i: Installation, q: number) => staticHead(i) + pressureHead(i) + losses(i, q).total;

export function shaftPower(i: Installation, q: number, h: number) {
  const eta = Math.max(0.05, pumpEta(i, q) * viscCorr(i.fluid.nu).ceta);
  return { eta, kw: (i.fluid.rho * G * (q / 3600) * h) / eta / 1000 };
}

export interface Hydro {
  ok: boolean;
  q: number; h: number; x: number;
  hStatic: number; hPress: number; hLoss: number; lossAsp: number; lossRef: number;
  lossItems: LossDetail[];
  vAsp: number; vRef: number; vPumpIn: number; vPumpOut: number;
  npsha: number; npshr: number; margin: number;
  n: number; // pompes en service
  eta: number; pShaft: number; pElec: number; pShaftMax: number; // pShaft = par pompe ; pElec = total
  se: number; // kWh/m³
  kwhYear: number; costYear: number;
  surge: number; // surpression de coup de bélier (m)
  pMaxBar: number; // pression maxi conduite de refoulement, vanne fermée (bar)
  coolingV: number; // vitesse de l'eau le long du moteur (m/s)
  startsH: number; // démarrages / heure (pire cas)
  vortexS: number; // submersion mini anti-vortex (m)
  corr: ReturnType<typeof viscCorr>;
  patm: number; pv: number;
  curve: { q: number; hp: number | null; hs: number }[];
}

/** Calcule tout le comportement hydraulique de l'installation. */
/** Surpression d'un arrêt de pompe (m) : formule de Mendiluce pour le temps d'arrêt de la colonne,
 *  puis Joukowsky (c·v/g) si la conduite est « longue » (T < 2L/c), sinon Michaud (2·L·v / g·T), plus faible. */
export function surgeHead(i: Installation, v: number, hm: number): number {
  if (v <= 0) return 0;
  const c = PIPE_MATS[i.ref.material].celerity;
  const L = Math.max(1, refLen(i));
  const J = (c * v) / G;
  const H = Math.max(1, hm);
  const slope = H / L;
  const C = slope < 0.2 ? 1 : slope > 0.4 ? 0 : 1 - (slope - 0.2) / 0.2;
  const K = L < 500 ? 2 : L < 1500 ? 2 - 0.5 * (L - 500) / 1000 : L < 2500 ? 1.5 - 0.5 * (L - 1500) / 1000 : 1;
  const T = C + (K * L * v) / (G * H);
  return T < (2 * L) / c ? J : Math.min(J, (2 * L * v) / (G * T));
}

export function solve(i: Installation): Hydro {
  const hStatic = staticHead(i);
  const hPress = pressureHead(i);
  const f = (q: number) => pumpHead(i, q) - systemHeadAt(i, q);
  const h0 = pumpHead(i, 0);
  const n = nRun(i);
  const qMaxPump = pumpQZero(i) * n;
  let q = 0;
  const ok = f(0) > 0;
  if (ok) {
    let lo = 0, hi = qMaxPump;
    for (let n = 0; n < 60; n++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
    q = (lo + hi) / 2;
  }
  const L = losses(i, q);
  const h = ok ? pumpHead(i, q) : h0;
  const rhoG = i.fluid.rho * G;
  const pa = patm(i.geo.altitude);
  const pv = vaporPressure(i);
  const npsha = ((pa - pv) * 1000) / rhoG + suctionZ(i) - L.asp;
  const npshr = ok ? pumpNpshr(i, q / n) : i.pump.npshr;
  const pw = shaftPower(i, Math.max(q / n, 0.01), h);
  const qRun = Math.min((qMaxPump / n) * 0.95, i.pump.qn * 1.3);
  const pMax = shaftPower(i, qRun, pumpHead(i, qRun * n)).kw;
  const pElec = ok ? (n * pw.kw) / 0.88 : 0;
  const se = q > 0 ? pElec / q : 0;
  const kwhYear = pElec * i.duty.hoursPerDay * 365;
  const vRef = vel(q, i.ref.dn);
  const surge = surgeHead(i, vRef, h);
  const suctionPress = Math.max(0, suctionZ(i)) * (i.mode === 'charge' ? 1 : 0);
  const pMaxBar = ((h0 + suctionPress) * rhoG) / 1e5;
  const ann = i.geo.boreDia > i.pump.diameterMm ? area(i.geo.boreDia) - area(i.pump.diameterMm) : 1e-6;
  const coolingV = i.acc.chemise?.on ? 0.5 : q / 3600 / ann;
  let startsH = 0;
  if (i.mode === 'immergee' && !isForage(i)) startsH = q / (4 * Math.max(0.05, i.geo.tankVolume / 1000));
  const dAsp = i.asp.dn / 1000;
  const vIn = vel(q, i.asp.dn);
  const vortexS = dAsp * (1 + 2.3 * (vIn / Math.sqrt(G * Math.max(dAsp, 0.01))));

  const qTop = Math.max(i.pump.qn * 1.5 * n, q * 1.2);
  const curve = Array.from({ length: 41 }, (_, n) => {
    const qq = (qTop * n) / 40;
    const hp = pumpHead(i, qq);
    return { q: qq, hp: hp > 0 ? hp : null, hs: systemHeadAt(i, qq) };
  });

  return {
    ok, q, h, x: q / n / i.pump.qn, n,
    hStatic, hPress, hLoss: L.total, lossAsp: L.asp, lossRef: L.ref, lossItems: L.items,
    vAsp: i.mode === 'immergee' ? 0 : vIn, vRef,
    vPumpIn: vel(q / n, i.pump.dnAsp), vPumpOut: vel(q / n, i.pump.dnRef),
    npsha, npshr, margin: npsha - npshr,
    eta: pw.eta, pShaft: ok ? pw.kw : 0, pElec, pShaftMax: pMax,
    se, kwhYear, costYear: kwhYear * i.duty.pricePerKwh,
    surge, pMaxBar, coolingV, startsH, vortexS,
    corr: viscCorr(i.fluid.nu), patm: pa, pv, curve,
  };
}

export { ACC, refLen, refStatic };
