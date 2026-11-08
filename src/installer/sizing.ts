/** Dimensionnement : pompe adaptée au besoin (débit demandé à la hauteur réellement nécessaire). */
import { PUMP_TYPES } from './catalog';
import { systemHeadAt } from './hydraulics';
import { aquiferOf } from './aquifer';
import type { Installation, PumpMatId } from './types';

const MOTORS = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160];

function pumpMaterial(d: Installation): PumpMatId {
  const f = d.fluid.type;
  if (f === 'eau_mer') return 'inox316';
  if (f === 'boues') return 'fonte_chrome';
  if (f === 'eaux_usees') return 'fonte';
  if (f === 'eau_piscine') return d.pumpType === 'auto_amorcante' ? 'thermoplastique' : 'inox316';
  if (d.pumpType === 'immergee_forage' || d.pumpType === 'multi_v' || d.pumpType === 'multi_h') return 'inox304';
  return 'fonte';
}

/** Pompe proposée pour atteindre le besoin : débit demandé à la hauteur réellement nécessaire. */
export function proposePump(d: Installation): Installation {
  // Chaque pompe en service fournit sa part du débit, à la hauteur totale du réseau
  const nr = Math.max(1, (d.pump.count ?? 1) - (d.pump.standby ?? 0));
  // Forage dont l'essai de pompage est connu : on ne demande pas plus que le débit d'exploitation du forage,
  // et la hauteur est calculée avec le niveau dynamique à CE débit (rabattement Q / C)
  const aq = aquiferOf(d);
  const qTot = aq?.known ? Math.max(0.1, Math.min(d.duty.qReq, aq.qExp)) : d.duty.qReq;
  const dLvl = aq?.known ? { ...d, geo: { ...d.geo, dynTest: aq.dynTest, dynamicLevel: Math.min(d.geo.pumpDepth - 0.3, d.geo.staticLevel + qTot / aq.c) } } : d;
  const q = Math.max(0.1, qTot / nr);
  const hReq = Math.max(2, systemHeadAt(dLvl, qTot));
  const pt = d.pumpType;
  const shutoff = pt === 'immergee_forage' ? 1.3 : pt === 'submersible_relevage' ? 1.45 : 1.25;
  // Avec pressostat (sans variateur), la pompe doit pouvoir monter au-dessus de la pression de marche
  // pour atteindre l'arrêt : on garde ≥ 13 m (≈ 1,3 bar) de réserve à débit nul.
  const pressostat = !!d.acc.pressostat?.on || !!d.acc.vessie?.on;
  const h0 = Math.max(hReq * shutoff, pressostat ? hReq + 14 : 0);
  const hn = Math.ceil(h0 / shutoff);
  // Courbe H = h0 − k·q² passant par le besoin (q, hReq) : débit nominal correspondant
  const qn = h0 > hReq * shutoff + 0.01 ? Math.sqrt(((shutoff - 1) * hn) / ((h0 - hReq) / (q * q))) : q;
  const eta = pt === 'immergee_forage' ? 0.6 : pt === 'submersible_relevage' ? 0.5 : pt === 'drainage_immergee' ? 0.45 : pt === 'auto_amorcante' ? 0.48
    : Math.min(0.78, Math.max(0.5, 0.56 + 0.05 * Math.log(q / 5)));
  const pkw = (d.fluid.rho * 9.81 * (Math.max(q, qn) / 3600) * Math.max(hReq, hn)) / eta / 1000;
  const motorKw = MOTORS.find((m) => m >= pkw * 1.15) ?? 160;
  const def = PUMP_TYPES[pt];
  return {
    ...d,
    pump: {
      ...d.pump,
      usePts: false,
      qn: Math.round(qn * 10) / 10, hn, eta: Math.round(eta * 100) / 100, motorKw,
      npshr: pt === 'surface' ? Math.round((2.2 + q / 40) * 10) / 10 : pt === 'immergee_forage' ? 3 : pt === 'submersible_relevage' ? 1.5 : 2,
      nn: pt === 'submersible_relevage' ? 1450 : 2900,
      passage: def.passage, tmax: def.tmax, material: pumpMaterial(d),
      sandMax: pt === 'submersible_relevage' ? 500 : pt === 'drainage_immergee' ? 200 : 50,
      maxStarts: motorKw <= 4 ? 20 : motorKw <= 11 ? 15 : 10,
      diameterMm: pt === 'immergee_forage' ? (q <= 8 && d.geo.boreDia < 160 ? 98 : 142) : 0,
      shutoff,
      dnAsp: d.asp.dn, dnRef: d.ref.dn,
    },
  };
}

