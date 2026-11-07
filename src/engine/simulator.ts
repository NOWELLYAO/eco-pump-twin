import { ATM_M, M_PER_BAR, curveOf, etaAt, hydKw, npshrAt, systemR, valveFactor } from './physics';
import type { Measurement, PumpConfig } from './types';

/** Bruit gaussien (Box-Muller). */
function gauss(sd: number) {
  const u = 1 - Math.random();
  const v = Math.random();
  return sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simule l'installation RÉELLE (avec ses défauts) et renvoie ce que liraient
 * les capteurs. Le jumeau, lui, ne voit que ces mesures.
 */
export function simulate(cfg: PumpConfig, t: number): Measurement {
  const { spec, system, controls } = cfg;
  const s = controls.speedPct / 100;
  const n = spec.nn * s;
  const f = {
    wear: controls.faults.wear / 100,
    cav: controls.faults.cavitation / 100,
    bearing: controls.faults.bearing / 100,
    clog: controls.faults.clogging / 100,
  };

  if (!controls.running || s < 0.05) {
    const pAsp = (system.npsha - ATM_M) / M_PER_BAR;
    return { t, q: 0, pAsp, pRef: pAsp + system.hStatic / M_PER_BAR, n: 0, pElec: 0, vib: 0.2 + gauss(0.05), temp: 32 + gauss(0.3) };
  }

  // Pompe réelle : l'usure rabaisse et raidit la courbe, et dégrade le rendement.
  const { h0, k } = curveOf(spec);
  const h0r = h0 * (1 - 0.18 * f.wear);
  const kr = k * (1 + 0.3 * f.wear);
  const r = systemR(spec, system) * valveFactor(controls.valvePct) * (1 + 1.2 * f.clog);

  const solve = (drop: number) => {
    const num = s * s * h0r * (1 - drop) - system.hStatic;
    const q = num > 0 ? Math.sqrt(num / (kr * (1 - drop) + r)) : 0;
    return { q, h: s * s * h0r * (1 - drop) - kr * (1 - drop) * q * q };
  };

  let op = solve(0);
  const x0 = op.q / (spec.qn * s);
  const npsha = system.npsha * (1 - 0.75 * f.cav) - 3 * f.clog * x0 * x0;
  const npshr = npshrAt(spec, op.q, s);
  const deficit = npshr - npsha;
  let cavVib = 0;
  if (deficit > -1) {
    // Cavitation : chute de hauteur + vibrations haute fréquence.
    const drop = Math.min(0.35, Math.max(0, 0.1 * (deficit + 0.3)));
    op = solve(drop);
    cavVib = 2.5 * (deficit + 1);
  }

  const x = op.q / (spec.qn * s);
  const eta = etaAt(spec, op.q, s) * (1 - 0.15 * f.wear);
  const pElec = (hydKw(op.q, op.h) / eta / spec.etaMotor) * (1 + 0.04 * f.bearing);
  const load = pElec / spec.motorKw;
  const vib = (0.9 + 2.2 * (x - 1) ** 2) * s + 6.5 * f.bearing ** 1.4 + cavVib;
  const temp = 38 + 14 * load + 45 * f.bearing ** 1.5;

  const pAsp = (npsha - ATM_M) / M_PER_BAR;
  return {
    t,
    q: Math.max(0, op.q * (1 + gauss(0.008))),
    pAsp: pAsp + gauss(0.004),
    pRef: pAsp + (op.h / M_PER_BAR) * (1 + gauss(0.004)),
    n: n * (1 + gauss(0.002)),
    pElec: Math.max(0, pElec * (1 + gauss(0.008))),
    vib: Math.max(0.1, vib * (1 + gauss(0.04))),
    temp: temp + gauss(0.4),
  };
}
