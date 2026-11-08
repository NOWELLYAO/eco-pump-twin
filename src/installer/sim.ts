import { refStatic } from './catalog';
import { effectiveStart, electrical, solar as solarCalc, type ElecResult } from './electrical';
import { isForage, losses, pumpHead, solve, suctionZ, type Hydro } from './hydraulics';
import type { Installation } from './types';

const G = 9.81;
const f1 = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export interface Mods { valve: number; speed: number; level: number; clog: number; wear: number }
export const NO_MODS: Mods = { valve: 100, speed: 100, level: 0, clog: 0, wear: 0 };

/** Installation telle qu'elle fonctionne avec les réglages de simulation. */
export function applyMods(i: Installation, m: Mods): Installation {
  const x: Installation = { ...i, pump: { ...i.pump }, geo: { ...i.geo }, acc: { ...i.acc } };
  const s = m.speed / 100;
  if (s !== 1) { x.pump.qn *= s; x.pump.hn *= s * s; x.pump.npshr *= s * s; }
  if (m.wear > 0) { const w = m.wear / 100; x.pump.hn *= 1 - 0.18 * w; x.pump.eta *= 1 - 0.15 * w; }
  if (m.valve < 100) {
    const v = Math.max(0.05, m.valve / 100);
    const k = 0.2 + 25 * ((1 - v) / v) ** 2;
    const st = x.acc.vanne_ref ?? { on: true, dn: x.ref.dn, qty: 1 };
    x.acc.vanne_ref = { ...st, on: true, qty: k / 0.2 };
  }
  if (m.clog > 0) {
    for (const id of ['clapet_pied', 'crepine', 'filtre_asp', 'prefiltre']) {
      const st = x.acc[id];
      if (st?.on) x.acc[id] = { ...st, qty: (st.qty || 1) * (1 + 15 * (m.clog / 100)) };
    }
  }
  if (m.level !== 0) {
    if (isForage(x)) x.geo.dynamicLevel = Math.max(0, x.geo.dynamicLevel - m.level);
    else if (x.mode === 'aspiration') x.geo.suctionLift = Math.max(0, x.geo.suctionLift - m.level);
    else if (x.mode === 'charge') x.geo.chargeHead = Math.max(0, x.geo.chargeHead + m.level);
    else x.geo.wetLevel = Math.max(0, x.geo.wetLevel + m.level);
  }
  return x;
}

export interface Readings { q: number; pRef: number; pAsp: number; amps: number; kw: number; hmt: number; margin: number; on: boolean }

/** Ce qu'afficheraient les instruments. */
export function readings(i: Installation, h: Hydro, on: boolean, er: ElecResult, qOverride?: number, speed = 1): Readings {
  const rhoG = i.fluid.rho * G;
  const bar = (m: number) => (m * rhoG) / 1e5;
  const z = suctionZ(i);
  if (!on || !h.ok) {
    const hasCheck = i.acc.clapet_ar?.on || i.acc.clapet_boule?.on;
    const hold = hasCheck ? refStatic(i) - (isForage(i) ? i.geo.pumpDepth : 0) : 0;
    return { q: 0, pRef: bar(Math.max(0, hold)), pAsp: bar(z), amps: 0, kw: 0, hmt: 0, margin: h.margin, on: false };
  }
  const q = qOverride ?? h.q;
  const ratio = h.q > 0 ? q / h.q : 1;
  const L = losses(i, q);
  // Hauteur réellement fournie : courbe de la pompe à la vitesse du variateur (H = s² · H(q / s))
  const sp = Math.max(0.2, speed);
  const hq = qOverride != null ? sp * sp * pumpHead(i, q / sp) : h.h;
  const pAsp = bar(z - L.asp);
  const pRef = isForage(i) ? bar(Math.max(0, hq - i.geo.dynamicLevel - L.ref * (i.geo.pumpDepth / Math.max(1, i.ref.length + i.geo.pumpDepth)))) : bar(z - L.asp + hq);
  const kw = speed < 0.995 && q > 0
    ? (rhoG * (q / 3600) * Math.max(0, hq)) / Math.max(0.25, h.eta) / 1000 / 0.88
    : h.pElec * Math.max(0.3, ratio);
  // Courant moteur : proportionnel à la charge (non plafonné, pour voir les surcharges)
  const amps = er.inom * Math.max(0.35, Math.min(2, kw / h.n / (i.pump.motorKw / 0.88)));
  return { q, pRef, pAsp, amps, kw, hmt: hq, margin: h.margin, on: true };
}

export type SimKind = 'vessel' | 'vfd' | 'pit' | 'solar' | 'tank' | 'continuous';
export const KIND_LABEL: Record<SimKind, string> = {
  vessel: 'Pressostat + réservoir à vessie : la pompe démarre et s\'arrête selon la pression',
  vfd: 'Variateur à pression constante : la vitesse suit la consommation',
  pit: 'Fosse à flotteurs : la pompe démarre au niveau haut, s\'arrête au niveau bas',
  solar: 'Pompage solaire : le débit suit le soleil au fil de la journée',
  tank: 'Remplissage d\'un réservoir : arrêt par flotteur quand il est plein',
  continuous: 'Fonctionnement continu tant que la pompe est en marche',
};

export function simKind(i: Installation): SimKind {
  if (i.elec.supply === 'solaire') return 'solar';
  if (i.mode === 'immergee' && !isForage(i)) return 'pit';
  if (i.app === 'surpression' || i.app === 'incendie') {
    if (effectiveStart(i) === 'variateur' && i.acc.capteur_p?.on) return 'vfd';
    if (i.acc.vessie?.on && i.acc.pressostat?.on) return 'vessel';
  }
  if (i.app === 'forage' || i.app === 'transfert' || i.app === 'carburant') return 'tank';
  return 'continuous';
}

export interface SimEvent { t: number; sev: 'info' | 'warning' | 'critical' | 'ok'; text: string; target?: string }
export interface SimPoint { t: number; a: number | null; b: number | null; c: number | null }
export interface SimState {
  t: number; // secondes simulées
  master: boolean; // automatisme / marche demandée
  on: boolean; // pompe réellement en marche
  x: number; // grandeur d'état (pression bar, niveau m, volume m³)
  q: number; // débit pompe instantané
  s: number; // vitesse relative (variateur / solaire)
  pv: number; // puissance solaire disponible (kW)
  vol: number; kwh: number; starts: number;
  dry: boolean; overflow: boolean; cav: boolean;
  events: SimEvent[];
  series: SimPoint[];
}

export const clock = (t: number) => {
  const d = Math.floor(t / 86400) + 1;
  const h = Math.floor((t % 86400) / 3600);
  const m = Math.floor((t % 3600) / 60);
  return `J${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const hourOf = (t: number) => (t % 86400) / 3600;
/** Profil de consommation domestique (fraction du débit de pointe). */
const demand = (hr: number) => Math.min(1, 0.08 + 0.85 * Math.exp(-(((hr - 7) / 1.3) ** 2)) + 0.65 * Math.exp(-(((hr - 19.5) / 1.6) ** 2)) + 0.3 * Math.exp(-(((hr - 12.5) / 1.5) ** 2)));

export interface SimCtx { i: Installation; h: Hydro; er: ElecResult; kind: SimKind }

export function makeCtx(i: Installation): SimCtx {
  const h = solve(i);
  return { i, h, er: electrical(i, h).r, kind: simKind(i) };
}

export function initSim(ctx: SimCtx): SimState {
  const { kind, er } = ctx;
  const x = kind === 'vessel' ? (er.vessel?.pOn ?? 3) + 0.4 : kind === 'vfd' ? (er.vessel?.pOn ?? 3) + 0.5 : kind === 'pit' ? 0.2 : kind === 'tank' ? 0.6 : 0;
  return { t: 6 * 3600, master: true, on: false, x, q: 0, s: 1, pv: 0, vol: 0, kwh: 0, starts: 0, dry: false, overflow: false, cav: false, events: [], series: [] };
}

const speedCache = new Map<string, Hydro>();
function atSpeed(i: Installation, s: number): Hydro {
  const k = `${JSON.stringify(i).length}-${i.pump.qn}-${i.pump.hn}-${Math.round(s * 50)}`;
  let h = speedCache.get(k);
  if (!h) {
    h = solve(applyMods(i, { ...NO_MODS, speed: Math.round(s * 50) * 2 }));
    if (speedCache.size > 400) speedCache.clear();
    speedCache.set(k, h);
  }
  return h;
}

/** Événements de démarrage / arrêt, tirés des calculs électriques et hydrauliques. */
function startEvent(ctx: SimCtx, st: SimState): SimEvent[] {
  const { er, h, i } = ctx;
  const cnt = Math.max(1, i.pump.count ?? 1);
  const who = cnt > 1 ? (i.pump.alternate ? ` P-${101 + ((st.starts - 1) % cnt)} (permutation)` : ` (${h.n} pompe${h.n > 1 ? 's' : ''})`) : '';
  const ev: SimEvent[] = [{ t: st.t, sev: er.dropStart > 15 ? 'warning' : 'ok', text: `Démarrage${who} — pointe ${f1(er.istart, 0)} A, chute de tension ${f1(er.dropStart)} %`, target: 'cable' }];
  if (h.ok && h.margin < 0.5) ev.push({ t: st.t, sev: 'critical', text: `Cavitation : marge NPSH ${f1(h.margin)} m — bruit de gravier, érosion de la roue`, target: 'pump' });
  if (!h.ok) ev.push({ t: st.t, sev: 'critical', text: 'Pompe en marche sans débit : elle n\'atteint pas la hauteur demandée', target: 'pump' });
  return ev;
}
function stopEvent(ctx: SimCtx, st: SimState, why: string): SimEvent[] {
  const { i, h } = ctx;
  const ev: SimEvent[] = [{ t: st.t, sev: 'info', text: `Arrêt — ${why}` }];
  const check = i.acc.clapet_ar?.on || i.acc.clapet_boule?.on;
  if (!check && refStatic(i) > 3) ev.push({ t: st.t, sev: 'critical', text: 'Sans clapet : la colonne d\'eau redescend, la pompe tourne à l\'envers', target: 'acc:clapet_ar' });
  else if (h.ok) {
    const prot = i.acc.anti_belier?.on || i.acc.vessie?.on;
    const surge = h.surge * (prot ? 0.35 : 1);
    const p = ((refStatic(i) + surge) * i.fluid.rho * G) / 1e5;
    if (p > i.ref.pn * 0.8) ev.push({ t: st.t, sev: p > i.ref.pn ? 'critical' : 'warning', text: `Coup de bélier : pointe de ${f1(p)} bar dans la conduite (PN${i.ref.pn})${prot ? '' : ' — pas d\'anti-bélier'}`, target: 'ref' });
  }
  return ev;
}

/** Avance la simulation de dt secondes (par pas internes de 5 s). */
export function stepSim(ctx: SimCtx, prev: SimState, dt: number): SimState {
  const { i, h, er, kind } = ctx;
  const st: SimState = { ...prev, events: prev.events };
  const newEv: SimEvent[] = [];
  const rhoG = i.fluid.rho * G;
  const sub = 5;
  const n = Math.max(1, Math.round(dt / sub));
  const v = er.vessel;
  const start = () => { if (!st.on) { st.on = true; st.starts++; newEv.push(...startEvent(ctx, st)); } };
  const stop = (why: string) => { if (st.on) { st.on = false; newEv.push(...stopEvent(ctx, st, why)); } };

  for (let k = 0; k < n; k++) {
    const hr = hourOf(st.t);
    if (!st.master) { stop('arrêt manuel'); st.q = 0; }

    if (kind === 'vessel' && v) {
      const vt = v.vol / 1000; // m³
      const qd = demand(hr) * i.duty.qReq; // m³/h
      // Pression → volume d'eau stocké (loi de Boyle)
      let vw = vt * (1 - (v.pre + 1) / (Math.max(st.x, v.pre) + 1));
      if (st.master && st.x <= v.pOn) start();
      if (st.on && st.x >= v.pOff) stop(`pressostat (${f1(v.pOff)} bar)`);
      const hNeed = (st.x * 1e5) / rhoG - suctionZ(i);
      const h0 = pumpHead(i, 0);
      const kq = (h0 - pumpHead(i, i.pump.qn)) / (i.pump.qn * i.pump.qn);
      st.q = st.on ? Math.sqrt(Math.max(0, (h0 - hNeed) / Math.max(1e-6, kq))) : 0;
      vw += ((st.q - qd) / 3600) * sub;
      if (vw <= 0) {
        // Réservoir vide : la pression ne tient que si la pompe suit la demande
        st.x = st.on ? Math.min(v.pOff, st.x) : Math.max(0, st.x - 0.05);
      } else st.x = (v.pre + 1) * vt / Math.max(1e-6, vt - Math.min(vw, vt * 0.95)) - 1;
      st.s = 1;
    } else if (kind === 'vfd') {
      const set = (v?.pOn ?? 3) + 0.5;
      const qd = demand(hr) * i.duty.qReq;
      if (st.master && qd > 0.06 * i.duty.qReq) start();
      if (st.on && qd < 0.04 * i.duty.qReq) stop('mise en veille (très faible consommation)');
      const hs = (set * 1e5) / rhoG - suctionZ(i);
      const h0n = pumpHead(i, 0);
      const kq = (h0n - pumpHead(i, i.pump.qn)) / (i.pump.qn ** 2);
      const qe = qd / h.n;
      const sNeed = Math.sqrt((hs + kq * qe * qe) / h0n);
      if (st.on && sNeed > 1) {
        // Le variateur est à 50 Hz et ne tient plus la consigne : la pression chute sur la courbe de la pompe
        st.s = 1;
        const hAt = Math.max(0, h0n - kq * qe * qe);
        st.x = Math.max(0, (hAt + suctionZ(i)) * rhoG / 1e5);
        st.q = qd;
        if (!st.cav) { st.cav = true; newEv.push({ t: st.t, sev: 'warning', text: `Variateur à 50 Hz : consigne ${f1(set)} bar non tenue (${f1(st.x)} bar) — pompe trop faible pour cette consommation`, target: 'pump' }); }
      } else {
        st.q = st.on ? qd : 0;
        st.x = st.on ? set + (Math.sin(st.t / 37) * 0.04) : Math.max(set - 0.6, st.x - 0.01);
        st.s = st.on ? Math.max(0.3, sNeed) : 0;
        if (sNeed < 0.95) st.cav = false;
      }
    } else if (kind === 'pit') {
      const area = (i.geo.tankVolume / 1000) / 0.5; // m², 0,5 m entre flotteurs
      const qin = (0.15 + 0.75 * demand(hr)) * h.q * 0.55;
      const hasStart = !!i.acc.flotteur_marche?.on, hasStop = !!i.acc.flotteur_arret?.on;
      if (st.master && hasStart && st.x >= 0.5) start();
      if (st.master && !hasStart && st.x >= 0.5 && !st.overflow && st.x >= 1.2) { st.overflow = true; newEv.push({ t: st.t, sev: 'critical', text: 'Débordement de la fosse : aucun flotteur de marche', target: 'acc:flotteur_marche' }); }
      if (st.on && hasStop && st.x <= 0) stop('flotteur bas');
      st.q = st.on && h.ok ? h.q : 0;
      st.x += ((qin - st.q) / 3600 / area) * sub;
      if (st.x < -0.1) {
        st.x = -0.1;
        if (st.on && !st.dry) { st.dry = true; newEv.push({ t: st.t, sev: 'critical', text: 'Marche à sec : la fosse est vide et la pompe tourne', target: 'acc:flotteur_arret' }); }
        if (st.on) st.q = qin;
      } else st.dry = false;
      if (st.x > 0.8 && i.acc.flotteur_alarme?.on && !st.overflow) { st.overflow = true; newEv.push({ t: st.t, sev: 'warning', text: 'Alarme niveau très haut', target: 'acc:flotteur_alarme' }); }
      if (st.x < 0.6) st.overflow = false;
      st.x = Math.min(st.x, 1.3);
    } else if (kind === 'solar') {
      const sr = solarCalc(i, h);
      const gpk = (sr?.pshDesign ?? i.elec.solar.psh) / 7.64; // kW/m² en crête (mois de dimensionnement)
      const g = Math.max(0, Math.sin((Math.PI * (hr - 6)) / 12)) * gpk;
      st.pv = sr ? (sr.wc / 1000) * g * 0.75 : 0;
      const pFull = Math.max(0.1, h.pElec / 0.95);
      if (st.master && st.pv >= 0.3 * pFull) start();
      if (st.on && st.pv < 0.25 * pFull) stop(hr > 12 ? 'fin de journée, soleil insuffisant' : 'soleil insuffisant');
      if (st.on) {
        st.s = Math.min(1, Math.cbrt(st.pv / pFull));
        const hs = atSpeed(i, st.s);
        st.q = hs.ok ? hs.q : 0;
      } else { st.q = 0; st.s = 0; }
      st.x += (st.q / 3600) * sub; // volume pompé du jour
      if (hr < 0.01) st.x = 0;
    } else if (kind === 'tank') {
      const cap = Math.max(5, i.duty.qReq * 4); // m³
      const use = demand(hr) * i.duty.qReq * 0.55;
      const hasFloat = !!i.acc.flotteur_res?.on;
      if (st.master && (!hasFloat || st.x < 0.7)) start();
      if (st.on && hasFloat && st.x >= 1) stop('réservoir plein (flotteur)');
      st.q = st.on && h.ok ? h.q : 0;
      st.x += ((st.q - use) / 3600 / cap) * sub;
      if (st.x > 1.02 && !st.overflow) { st.overflow = true; newEv.push({ t: st.t, sev: 'warning', text: 'Réservoir plein : il déborde (pas de flotteur d\'arrêt)', target: 'acc:flotteur_res' }); }
      if (st.x < 0.95) st.overflow = false;
      st.x = Math.max(0, Math.min(1.05, st.x));
    } else {
      if (st.master) start();
      st.q = st.on && h.ok ? h.q : 0;
    }

    if (st.on) {
      const kw = kind === 'solar' ? Math.min(st.pv, h.pElec / 0.95) : kind === 'vfd' ? h.pElec * Math.max(0.15, st.s ** 3) : h.pElec * (st.q > 0 && h.q > 0 ? Math.max(0.5, Math.min(1.1, st.q / h.q)) : 1);
      st.kwh += (kw * sub) / 3600;
      st.vol += (st.q * sub) / 3600;
    }
    st.t += sub;
  }

  const hr = hourOf(st.t);
  const a = kind === 'vessel' || kind === 'vfd' ? st.x : kind === 'pit' ? st.x * 100 : kind === 'solar' ? st.pv : kind === 'tank' ? st.x * 100 : readings(i, h, st.on, er).pRef;
  const c = kind === 'vessel' || kind === 'vfd' ? demand(hr) * i.duty.qReq : kind === 'pit' ? (0.15 + 0.75 * demand(hr)) * h.q * 0.55 : kind === 'tank' ? demand(hr) * i.duty.qReq * 0.55 : null;
  st.series = [...prev.series, { t: st.t, a, b: st.q, c }].slice(-240);
  if (newEv.length) st.events = [...newEv.reverse(), ...prev.events].slice(0, 80);
  return st;
}

export const SERIES_LABEL: Record<SimKind, { a: string; unit: string; c?: string }> = {
  vessel: { a: 'Pression du réseau', unit: 'bar', c: 'Consommation' },
  vfd: { a: 'Pression du réseau', unit: 'bar', c: 'Consommation' },
  pit: { a: 'Niveau au-dessus du flotteur bas', unit: 'cm', c: 'Arrivée d\'effluents' },
  solar: { a: 'Puissance solaire disponible', unit: 'kW' },
  tank: { a: 'Remplissage du réservoir', unit: '%', c: 'Consommation' },
  continuous: { a: 'Pression au refoulement', unit: 'bar' },
};
