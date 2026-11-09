/** Dimensionnement : pompe adaptée au besoin (débit demandé à la hauteur réellement nécessaire). */
import { PUMP_TYPES, withPipe } from './catalog';
import { solve, systemHeadAt } from './hydraulics';
import { aquiferOf } from './aquifer';
import type { Installation, PumpMatId } from './types';
import { BORE_SIZES, outletFor, sizeFor } from './borepump';

const MOTORS = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 9.2, 11, 15, 18.5, 22, 26, 30, 37, 45, 55, 75, 93, 110, 132, 150, 160, 185, 200, 250, 300];

function pumpMaterial(d: Installation): PumpMatId {
  const f = d.fluid.type;
  if (f === 'eau_mer') return 'inox316';
  if (f === 'boues') return 'fonte_chrome';
  if (f === 'eaux_usees') return 'fonte';
  if (f === 'eau_piscine') return d.pumpType === 'auto_amorcante' ? 'thermoplastique' : 'inox316';
  if (d.pumpType === 'immergee_forage' || d.pumpType === 'multi_v' || d.pumpType === 'multi_h') return 'inox304';
  return 'fonte';
}

/** Pompe proposée pour atteindre le besoin : débit demandé à la hauteur réellement nécessaire.
 *  On vérifie ensuite le point réel (liquide visqueux, pertes, plusieurs pompes) et on corrige si le débit n'y est pas. */
export function proposePump(d0: Installation): Installation {
  if (d0.pumpType !== 'immergee_forage') return sizeLoop(d0);
  // Forage : une seule pompe dans le tubage (pas de pompes en parallèle ni de secours dans le même forage).
  // La colonne doit avoir au moins le diamètre de sortie de la pompe : on la pose AVANT de calculer la hauteur (pertes).
  let d: Installation = { ...d0, pump: { ...d0.pump, count: 1, standby: 0, alternate: false } };
  const z0 = (d.pump.boreIn ? BORE_SIZES.find((x) => x.inch === d.pump.boreIn) : undefined) ?? sizeFor(d.duty.qReq, 0, d.geo.boreDia);
  { const DNS = [25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300]; const v = (dn: number) => d.duty.qReq / 3600 / (Math.PI * (dn / 1000) ** 2 / 4);
    const o0 = outletFor(z0, d.duty.qReq);
    d = withPipe({ ...d, pump: { ...d.pump, dnRef: o0, dnAsp: o0, diameterMm: z0.mm } }, 'ref', Math.max(d.ref.dn, o0, DNS.find((dn) => v(dn) <= 2) ?? 300)); }
  let out = sizeLoop(d);
  if (out.ref.dn !== d.ref.dn || out.pump.dnRef !== d.pump.dnRef) out = sizeLoop(withPipe({ ...d, pump: { ...d.pump, dnRef: out.pump.dnRef, dnAsp: out.pump.dnAsp, diameterMm: out.pump.diameterMm } }, 'ref', out.ref.dn)); // gamme plus grosse que prévu : nouvelle colonne, nouveau calcul
  return out;
}

function sizeLoop(d: Installation): Installation {
  let k = 1, best = proposeOnce(d, 1);
  for (let n = 0; n < 6; n++) {
    const h = solve(best);
    const aq = aquiferOf(best);
    const target = aq?.known ? Math.min(d.duty.qReq, aq.qExp) : d.duty.qReq;
    if (h.ok && h.q >= target * 0.98) {
      // Moteur assez puissant pour le point réel (viscosité, densité)
      const need = h.pShaft * 1.15;
      if (need > best.pump.motorKw) best = { ...best, pump: { ...best.pump, motorKw: MOTORS.find((m) => m >= need) ?? 300 } };
      return best.pumpType === 'immergee_forage' ? fitBore(best) : best;
    }
    k *= h.ok && h.q > 0 ? Math.min(1.6, Math.max(1.03, (target / h.q) ** 2)) : 1.3;
    best = proposeOnce(d, k);
  }
  return best.pumpType === 'immergee_forage' ? fitBore(best) : best;
}

function proposeOnce(d: Installation, kH: number): Installation {
  // Chaque pompe en service fournit sa part du débit, à la hauteur totale du réseau
  const nr = Math.max(1, (d.pump.count ?? 1) - (d.pump.standby ?? 0));
  // Forage dont l'essai de pompage est connu : on ne demande pas plus que le débit d'exploitation du forage,
  // et la hauteur est calculée avec le niveau dynamique à CE débit (rabattement Q / C)
  const aq = aquiferOf(d);
  const qTot = aq?.known ? Math.max(0.1, Math.min(d.duty.qReq, aq.qExp)) : d.duty.qReq;
  const dLvl = aq?.known ? { ...d, geo: { ...d.geo, dynTest: aq.dynTest, dynamicLevel: Math.min(d.geo.pumpDepth - 0.3, d.geo.staticLevel + qTot / aq.c) } } : d;
  const q = Math.max(0.1, qTot / nr);
  const hReq = Math.max(2, systemHeadAt(dLvl, qTot)) * kH;
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
  const motorKw = MOTORS.find((m) => m >= pkw * 1.15) ?? 300;
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
      sandMax: d.fluid.type === 'boues' ? 5000 : pt === 'submersible_relevage' ? 500 : pt === 'drainage_immergee' ? 200 : 50,
      maxStarts: motorKw <= 4 ? 20 : motorKw <= 11 ? 15 : 10,
      diameterMm: pt === 'immergee_forage' ? (q <= 20 || d.geo.boreDia < 160 ? 98 : 145) : 0,
      shutoff,
      dnAsp: d.asp.dn, dnRef: d.ref.dn,
    },
  };
}


/** Pompe de forage : taille normalisée (3" mono … 12" tri) d'après le débit et le moteur, sortie de refoulement
 *  et colonne montante au bon diamètre, alimentation mono (3") ou tri (4" et plus). */
export function fitBore(i: Installation): Installation {
  const q = i.pump.qn, kw = i.pump.motorKw;
  const s = (i.pump.boreIn ? BORE_SIZES.find((x) => x.inch === i.pump.boreIn) : undefined) ?? sizeFor(Math.max(q, i.duty.qReq), kw, i.geo.boreDia);
  const out = outletFor(s, Math.max(q, i.duty.qReq));
  // Conduite de refoulement : jamais plus étroite que la sortie de la pompe
  const DNS = [25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];
  const v = (dn: number) => i.duty.qReq / 3600 / (Math.PI * (dn / 1000) ** 2 / 4);
  const refDn = Math.max(i.ref.dn, out, DNS.find((dn) => v(dn) <= 2) ?? 300);
  const elec = i.elec.supply === 'solaire' || i.elec.supply === 'groupe' ? i.elec
    : s.phase === 'mono' ? { ...i.elec, supply: 'mono' as const, voltage: 230 } : { ...i.elec, supply: 'tri' as const, voltage: i.elec.voltage === 230 ? 400 : i.elec.voltage };
  return { ...withPipe(i, 'ref', refDn), elec, pump: { ...i.pump, diameterMm: s.mm, dnRef: out, dnAsp: out } };
}
