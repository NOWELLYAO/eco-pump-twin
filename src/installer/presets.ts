import { ACCESSORIES, APPS, FLUIDS, PUMP_TYPES } from './catalog';
import { defaultDn } from './evaluate';
import { fluidAt } from './hydraulics';
import { ensureElec } from './electrical';
import type { AccState, AppId, Elec, FluidId, Installation, ModeId, PumpTypeId } from './types';

export function makeFluid(type: FluidId, temp?: number) {
  const d = FLUIDS[type];
  const t = temp ?? d.temp;
  const p = fluidAt(type, t);
  return { type, temp: t, rho: p.rho, nu: p.nu, solidsPct: d.solidsPct, particleMm: d.particleMm, sandGm3: d.sandGm3, ph: d.ph };
}

/** Active tous les accessoires requis et conseillés (au bon diamètre). */
export function autoEquip(i: Installation, withRecommended = true): Installation {
  let cur = i;
  // Deux passes : certains besoins dépendent d'autres accessoires (pressostat → réservoir).
  for (let pass = 0; pass < 2; pass++) {
    const acc: Record<string, AccState> = { ...cur.acc };
    for (const a of ACCESSORIES) {
      const n = a.need(cur);
      const want = n === 'required' || (withRecommended && n === 'recommended');
      if (want && !acc[a.id]?.on) acc[a.id] = { on: true, dn: defaultDn(cur, a.id), qty: 1, opt: a.id === 'cone_exc' ? 'haut' : undefined };
      if ((n === 'avoid' || n === 'na') && acc[a.id]?.on) acc[a.id] = { ...acc[a.id], on: false };
    }
    cur = { ...cur, acc };
  }
  return cur;
}

type Draft = Omit<Installation, 'elec'> & { elec?: Partial<Elec> };
const mk = (d: Draft) => ensureElec(d);

const base = (app: AppId, pumpType: PumpTypeId, mode: ModeId): Draft => ({
  name: 'Nouvelle installation',
  app, pumpType, mode,
  fluid: makeFluid(APPS[app].fluid),
  pump: { qn: 20, hn: 30, eta: 0.68, npshr: 2.5, nn: 2900, motorKw: 4, dnAsp: 65, dnRef: 50, passage: PUMP_TYPES[pumpType].passage, material: 'fonte', tmax: PUMP_TYPES[pumpType].tmax, sandMax: 50, maxStarts: 15, diameterMm: 98, shutoff: 1.25 },
  asp: { material: 'pvc', dn: 65, pn: 10, length: 5, elbows: 1 },
  ref: { material: 'pvc', dn: 50, pn: 10, length: 50, elbows: 3 },
  geo: { suctionLift: 3, chargeHead: 1.5, hRef: 15, straight: 0.5, immersion: 0.6, bottom: 0.2, staticLevel: 20, dynamicLevel: 30, pumpDepth: 40, boreDepth: 60, boreDia: 150, tankVolume: 500, wetLevel: 0.5, highPoint: false, altitude: 300 },
  duty: { qReq: 20, pRes: 1, hoursPerDay: 10, pricePerKwh: 110, currency: 'FCFA' },
  acc: {},
});

export const PRESETS: { id: string; label: string; build: () => Installation }[] = [
  {
    id: 'forage', label: 'Forage de village — pompe immergée 4"',
    build: () => autoEquip(mk({
      ...base('forage', 'immergee_forage', 'immergee'), name: 'Forage de village',
      elec: { supply: 'tri', voltage: 400, start: 'direct', cableLen: 70, cableSec: 2.5 },
      fluid: { ...makeFluid('eau_forage', 28), sandGm3: 20 },
      pump: { qn: 6, hn: 62, eta: 0.6, npshr: 3, nn: 2900, motorKw: 2.2, dnAsp: 40, dnRef: 40, passage: 2, material: 'inox304', tmax: 35, sandMax: 50, maxStarts: 20, diameterMm: 98, shutoff: 1.3 },
      ref: { material: 'pehd', dn: 50, pn: 10, length: 300, elbows: 4 },
      geo: { ...base('forage', 'immergee_forage', 'immergee').geo, staticLevel: 25, dynamicLevel: 40, pumpDepth: 52, boreDepth: 70, boreDia: 150, hRef: 12 },
      duty: { qReq: 6, pRes: 0, hoursPerDay: 12, pricePerKwh: 110, currency: 'FCFA' },
    })),
  },
  {
    id: 'forage_solaire', label: 'Forage solaire — pompe immergée sur panneaux',
    build: () => autoEquip(mk({
      ...base('forage', 'immergee_forage', 'immergee'), name: 'Forage solaire maraîchage',
      fluid: { ...makeFluid('eau_forage', 28), sandGm3: 15 },
      pump: { qn: 5, hn: 60, eta: 0.6, npshr: 3, nn: 2900, motorKw: 2.2, dnAsp: 40, dnRef: 40, passage: 2, material: 'inox304', tmax: 35, sandMax: 50, maxStarts: 20, diameterMm: 98, shutoff: 1.3 },
      ref: { material: 'pehd', dn: 50, pn: 10, length: 150, elbows: 3 },
      geo: { ...base('forage', 'immergee_forage', 'immergee').geo, staticLevel: 30, dynamicLevel: 45, pumpDepth: 57, boreDepth: 80, boreDia: 150, hRef: 10 },
      duty: { qReq: 5, pRes: 0, hoursPerDay: 7, pricePerKwh: 110, currency: 'FCFA' },
      elec: { supply: 'solaire', voltage: 400, start: 'variateur', cableLen: 75, cableSec: 2.5, solar: { psh: 5.5, panelWc: 450, vmp: 41.5, voc: 49.8, imp: 10.85, vdcMax: 800, vmpptMin: 300, dailyM3: 30, panels: 0, dcLen: 25, dcSec: 4 } },
    })),
  },
  {
    id: 'surpression', label: 'Surpresseur d\'immeuble R+8',
    build: () => autoEquip(mk({
      ...base('surpression', 'multi_v', 'charge'), name: 'Surpresseur immeuble',
      elec: { supply: 'tri', voltage: 400, start: 'variateur', cableLen: 8, cableSec: 2.5 },
      fluid: makeFluid('eau_claire', 25),
      pump: { qn: 12, hn: 62, eta: 0.66, npshr: 2, nn: 2900, motorKw: 4, dnAsp: 50, dnRef: 40, passage: 2, material: 'inox304', tmax: 110, sandMax: 20, maxStarts: 20, diameterMm: 0, shutoff: 1.25 },
      asp: { material: 'pehd', dn: 65, pn: 10, length: 4, elbows: 2 },
      ref: { material: 'galva', dn: 50, pn: 16, length: 60, elbows: 10 },
      geo: { ...base('surpression', 'multi_v', 'charge').geo, chargeHead: 1.5, hRef: 30, straight: 0.6, immersion: 0.6, bottom: 0.1 },
      duty: { qReq: 10, pRes: 2, hoursPerDay: 14, pricePerKwh: 110, currency: 'FCFA' },
    })),
  },
  {
    id: 'irrigation', label: 'Irrigation en rivière — pompe de surface (avec erreurs)',
    build: () => mk({
      ...base('irrigation', 'surface', 'aspiration'), name: 'Irrigation maraîchère',
      elec: { supply: 'tri', voltage: 400, start: 'direct', cableLen: 60, cableSec: 2.5 },
      fluid: makeFluid('eau_brute', 28),
      pump: { qn: 60, hn: 52, eta: 0.74, npshr: 4.5, nn: 2900, motorKw: 15, dnAsp: 80, dnRef: 65, passage: 8, material: 'fonte', tmax: 90, sandMax: 100, maxStarts: 10, diameterMm: 0, shutoff: 1.22 },
      asp: { material: 'flexible', dn: 65, pn: 6, length: 25, elbows: 4 },
      ref: { material: 'pvc', dn: 80, pn: 6, length: 400, elbows: 6 },
      geo: { ...base('irrigation', 'surface', 'aspiration').geo, suctionLift: 6, hRef: 12, straight: 0.2, immersion: 0.3, bottom: 0.05 },
      duty: { qReq: 55, pRes: 2.5, hoursPerDay: 8, pricePerKwh: 110, currency: 'FCFA' },
      acc: {
        clapet_pied: { on: true, dn: 65, qty: 1 }, clapet_ar: { on: true, dn: 65, qty: 1 }, vanne_ref: { on: true, dn: 65, qty: 1 },
        coffret: { on: true, dn: 0, qty: 1 }, manometre: { on: true, dn: 0, qty: 1 },
      },
    }),
  },
  {
    id: 'relevage', label: 'Poste de relevage d\'eaux usées',
    build: () => autoEquip(mk({
      ...base('relevage', 'submersible_relevage', 'immergee'), name: 'Poste de relevage',
      elec: { supply: 'tri', voltage: 400, start: 'direct', cableLen: 20, cableSec: 1.5 },
      fluid: makeFluid('eaux_usees', 25),
      pump: { qn: 20, hn: 9, eta: 0.52, npshr: 1.5, nn: 1450, motorKw: 1.5, dnAsp: 80, dnRef: 80, passage: 50, material: 'fonte', tmax: 40, sandMax: 500, maxStarts: 15, diameterMm: 0, shutoff: 1.45 },
      ref: { material: 'pehd', dn: 80, pn: 10, length: 80, elbows: 4 },
      geo: { ...base('relevage', 'submersible_relevage', 'immergee').geo, wetLevel: 0.5, hRef: 6, tankVolume: 600 },
      duty: { qReq: 20, pRes: 0, hoursPerDay: 6, pricePerKwh: 110, currency: 'FCFA' },
    })),
  },
  {
    id: 'carburant', label: 'Transfert de gasoil — auto-amorçante',
    build: () => {
      const i = autoEquip(mk({
        ...base('carburant', 'auto_amorcante', 'aspiration'), name: 'Transfert gasoil',
        elec: { supply: 'mono', voltage: 230, start: 'direct', cableLen: 15, cableSec: 2.5 },
        fluid: makeFluid('gasoil', 30),
        pump: { qn: 7, hn: 20, eta: 0.45, npshr: 2, nn: 2900, motorKw: 1.5, dnAsp: 40, dnRef: 40, passage: 3, material: 'fonte', tmax: 60, sandMax: 10, maxStarts: 15, diameterMm: 0, shutoff: 1.25 },
        asp: { material: 'acier', dn: 50, pn: 16, length: 6, elbows: 3 },
        ref: { material: 'pehd', dn: 40, pn: 10, length: 40, elbows: 4 },
        geo: { ...base('carburant', 'auto_amorcante', 'aspiration').geo, suctionLift: 2.5, hRef: 4, straight: 0.3, immersion: 0.5, bottom: 0.1 },
        duty: { qReq: 7, pRes: 0.5, hoursPerDay: 2, pricePerKwh: 110, currency: 'FCFA' },
      }));
      return { ...i, acc: { ...i.acc, atex: { on: false, dn: 0, qty: 1 } } };
    },
  },
  {
    id: 'piscine', label: 'Filtration de piscine',
    build: () => autoEquip(mk({
      ...base('piscine', 'auto_amorcante', 'charge'), name: 'Piscine 50 m³',
      elec: { supply: 'mono', voltage: 230, start: 'direct', cableLen: 12, cableSec: 1.5 },
      fluid: makeFluid('eau_piscine', 28),
      pump: { qn: 14, hn: 13, eta: 0.55, npshr: 2, nn: 2900, motorKw: 1.1, dnAsp: 50, dnRef: 50, passage: 6, material: 'thermoplastique', tmax: 50, sandMax: 20, maxStarts: 15, diameterMm: 0, shutoff: 1.3 },
      asp: { material: 'pvc', dn: 65, pn: 10, length: 10, elbows: 4 },
      ref: { material: 'pvc', dn: 50, pn: 10, length: 8, elbows: 5 },
      geo: { ...base('piscine', 'auto_amorcante', 'charge').geo, chargeHead: 0.3, hRef: 1.5, straight: 0.4, immersion: 0.5, bottom: 0.3 },
      duty: { qReq: 14, pRes: 0.8, hoursPerDay: 8, pricePerKwh: 110, currency: 'FCFA' },
    })),
  },
];

/** Nouvelle installation vierge pour une application, déjà équipée du minimum requis. */
export function blank(app: AppId): Installation {
  const pumpType = APPS[app].pumps[0];
  const mode = PUMP_TYPES[pumpType].modes[0];
  return autoEquip(mk({ ...base(app, pumpType, mode), name: APPS[app].label }), false);
}
