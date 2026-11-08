import { PIPE_MATS, refStatic } from './catalog';
import { effectiveStart, electrical, solar as solarCalc, type ElecResult } from './electrical';
import { isForage, losses, pumpHead, solve, speedFor, suctionZ, type Hydro } from './hydraulics';
import type { Installation } from './types';
import { LOCAL_FAULTS, applyFaults, combined, faultById, type FaultEffect, type Sym } from './faults';

const G = 9.81;
const f1 = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** draw : consommation imposée en % du besoin ; -1 = profil journalier automatique. */
export interface Mods { valve: number; speed: number; level: number; clog: number; wear: number; draw: number; faults: string[] }
export const NO_MODS: Mods = { valve: 100, speed: 100, level: 0, clog: 0, wear: 0, draw: -1, faults: [] };

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
  return m.faults?.length ? applyFaults(x, m.faults) : x;
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
  // Réseaux sous pression (immeuble, incendie, mais aussi forage ou irrigation avec pressostat / variateur)
  if (['surpression', 'incendie', 'forage', 'irrigation', 'transfert'].includes(i.app)) {
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
  // Pannes
  trip: string | null; // protection déclenchée (message)
  tripKind: Sym | null; // quelle protection
  recent: Partial<Record<Sym, number>>; // symptômes passagers vus récemment (instant)
  hum: boolean; // moteur alimenté mais bloqué
  primed: boolean; // pompe amorcée
  noFlow: boolean; // en marche sans débit (désamorcée, à sec)
  runT: number; // temps de marche depuis le démarrage (s)
  runTot?: number; // temps de marche cumulé (s), compteur horaire
  // ---- Physique ----
  tm?: number; // température du bobinage moteur (°C)
  tl?: number; // température du liquide dans le corps de pompe (°C)
  relay?: number; // image thermique du relais du disjoncteur moteur (1 = courant de réglage permanent)
  pPeak?: number; // dernière pointe de pression (coup de bélier ou vanne fermée), bar
  pPeakT?: number; // instant de cette pointe
  fatigue?: number; // sollicitations au-delà de la PN
  burst?: 'fuite' | 'rupture' | null; // dommage sur la conduite de refoulement
  burnt?: boolean; // bobinage grillé
  sealGone?: boolean; // garniture détruite (vaporisation, marche à sec)
  cavT?: number; // temps de marche en cavitation (s)
  flags?: Record<string, boolean>; // événements déjà signalés
  outageUntil: number; // coupure secteur jusqu'à t
  dd: number; // rabattement supplémentaire du niveau (m)
  startLog: number[]; // instants des démarrages
  runaway: boolean; // l'arrêt est demandé mais la pompe tourne
  blocked: boolean; // le démarrage est demandé mais impossible
  backDrop: boolean; // la pression / le niveau chute pompe arrêtée
  isolated: string | null; // pompe 1 en défaut, isolée : les autres pompes continuent (message)
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

export interface SimCtx { i: Installation; h: Hydro; er: ElecResult; kind: SimKind; draw: number; fx: FaultEffect & { ids: string[] } }

export function makeCtx(i: Installation, draw = -1, faults: string[] = []): SimCtx {
  const h = solve(i);
  return { i, h, er: electrical(i, h).r, kind: simKind(i), draw, fx: combined(faults) };
}
/** Fraction du besoin consommée à cette heure (profil journalier, ou valeur imposée). */
const use = (ctx: SimCtx, hr: number) => (ctx.draw >= 0 ? ctx.draw / 100 : demand(hr));

export function initSim(ctx: SimCtx): SimState {
  const { kind, er } = ctx;
  const x = kind === 'vessel' ? (er.vessel?.pOn ?? 3) + 0.4 : kind === 'vfd' ? (er.vessel?.pOn ?? 3) + 0.5 : kind === 'pit' ? 0.2 : kind === 'tank' ? 0.6 : 0;
  return {
    t: 6 * 3600, master: true, on: false, x, q: 0, s: 1, pv: 0, vol: 0, kwh: 0, starts: 0, dry: false, overflow: false, cav: false, events: [], series: [],
    trip: null, tripKind: null, recent: {}, hum: false, primed: true, noFlow: false, runT: 0, outageUntil: 0, dd: 0, startLog: [], runaway: false, blocked: false, backDrop: false, isolated: null,
  };
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
  const { i } = ctx;
  const ev: SimEvent[] = [{ t: st.t, sev: 'info', text: `Arrêt — ${why}` }];
  const check = i.acc.clapet_ar?.on || i.acc.clapet_boule?.on;
  if (!check && refStatic(i) > 3) ev.push({ t: st.t, sev: 'critical', text: 'Sans clapet : la colonne d\'eau redescend, la pompe tourne à l\'envers', target: 'acc:clapet_ar' });
  return ev;
}

/** Hauteur d'eau disponible avant que la pompe n'aspire de l'air (m). */
function submergence(i: Installation) {
  if (isForage(i)) return Math.max(0.5, i.geo.pumpDepth - i.geo.dynamicLevel);
  if (i.mode === 'aspiration') return Math.max(0.3, i.geo.immersion);
  if (i.mode === 'charge') return Math.max(0.3, i.geo.chargeHead + i.geo.immersion);
  return Math.max(0.2, i.geo.wetLevel);
}


/** Pointe de pression d'un arrêt (coup de bélier, formule de Joukowsky ΔH = c·Δv / g), en bar au refoulement de la pompe. */
export function surgePeak(i: Installation, h: Hydro, q: number, soft: boolean): { p: number; dH: number } {
  const v = h.q > 0 ? h.vRef * Math.min(1.5, q / h.q) : 0;
  const c = PIPE_MATS[i.ref.material].celerity;
  const prot = i.acc.anti_belier?.on || i.acc.vessie?.on;
  const dH = (c * v) / G * (prot ? 0.35 : 1) * (soft ? 0.3 : 1);
  return { p: ((refStatic(i) + dH) * i.fluid.rho * G) / 1e5, dH };
}
/** Température de vaporisation de l'eau à la pression absolue p (bar), approchée. */
export const tSat = (pAbsBar: number) => 100 * Math.max(0.3, pAbsBar) ** 0.25;

/** Avance la simulation de dt secondes (par pas internes de 5 s). */
export function stepSim(ctx: SimCtx, prev: SimState, dt: number): SimState {
  const { i, h, er, kind } = ctx;
  const multi = Math.max(1, i.pump.count ?? 1) > 1 || !!prev.isolated;
  // Pompe en défaut isolée : ses pannes propres ne jouent plus, les autres pompes assurent le service
  let fx = prev.isolated ? combined(ctx.fx.ids.filter((x) => !LOCAL_FAULTS.has(x))) : ctx.fx;
  const st: SimState = { ...prev, events: prev.events };
  const newEv: SimEvent[] = [];
  const rhoG = i.fluid.rho * G;
  const sub = 5;
  const n = Math.max(1, Math.round(dt / sub));
  const v0 = er.vessel;
  // Pressostat déréglé : seuils décalés de 1 bar vers le bas
  const v = v0 && fx.pswitch === 'drift' ? { ...v0, pOn: Math.max(0.3, v0.pOn - 1), pOff: Math.max(0.8, v0.pOff - 1) } : v0;
  const hasDryProt = !!i.acc.marche_sec?.on;
  const avail = submergence(i);
  let dryT = 0;
  // ---- Constantes physiques ----
  const imm = i.mode === 'immergee';
  const tAmb = imm ? i.fluid.temp : 32; // moteur immergé : refroidi par le liquide ; en surface : air ambiant
  const kwM = Math.max(0.37, i.pump.motorKw);
  const tauM = 60 * (10 + 4 * Math.sqrt(kwM)); // constante de temps thermique du moteur (s)
  const iBase = h.ok ? readings(i, h, true, er).amps / Math.max(0.1, er.inom) : 0.5; // courant en marche normale / In
  const soft = effectiveStart(i) !== 'direct' && effectiveStart(i) !== 'etoile';
  const pn = i.ref.pn;
  const mCase = 2 + 0.6 * kwM; // kg de liquide dans le corps de pompe
  const pShut = Math.max(0, ((pumpHead(i, 0) + suctionZ(i)) * rhoG) / 1e5); // pression à débit nul (bar)
  if (st.tm == null) st.tm = tAmb;
  if (st.tl == null) st.tl = i.fluid.temp;
  st.flags = { ...(st.flags ?? {}) };
  const once = (k: string, e: SimEvent) => { if (!st.flags![k]) { st.flags![k] = true; newEv.push(e); } };
  const hit = (p: number, why: string) => {
    st.pPeak = p; st.pPeakT = st.t;
    if (p > pn * 1.5 && st.burst !== 'rupture') {
      st.burst = 'rupture'; seen('fuite_visible', 'pression_basse');
      newEv.push({ t: st.t, sev: 'critical', text: `RUPTURE de la conduite : ${why} ${f1(p)} bar pour une conduite PN${pn} (plus de 1,5 × PN)`, target: 'ref' });
    } else if (p > pn) {
      st.fatigue = (st.fatigue ?? 0) + 1;
      newEv.push({ t: st.t, sev: 'critical', text: `${why} ${f1(p)} bar : au-dessus de la PN${pn} de la conduite (sollicitation n° ${st.fatigue})`, target: 'ref' });
      if ((st.fatigue ?? 0) >= 5 && !st.burst) { st.burst = 'fuite'; seen('fuite_visible'); newEv.push({ t: st.t, sev: 'critical', text: 'Un raccord a lâché après des surpressions répétées : fuite sur le refoulement', target: 'ref' }); }
    } else if (p > pn * 0.8) newEv.push({ t: st.t, sev: 'warning', text: `${why} ${f1(p)} bar : proche de la PN${pn} de la conduite`, target: 'ref' });
  };
  // Coup de bélier quand la pompe s'arrête en débitant (brutal si coupure, déclenchement ou démarrage direct)
  const hammer = (sudden: boolean) => {
    if (st.q < 0.1 || !h.ok) return;
    const sp = surgePeak(i, h, st.q, soft && !sudden);
    if (sp.p > pn * 0.8) hit(sp.p, `Coup de bélier à l'arrêt${sudden ? ' brutal' : ''} (${i.acc.anti_belier?.on || i.acc.vessie?.on ? 'atténué par l\'anti-bélier' : 'sans anti-bélier'}) :`);
    else { st.pPeak = sp.p; st.pPeakT = st.t; }
  };

  const seen = (...xs: Sym[]) => { st.recent = { ...st.recent }; for (const x of xs) st.recent[x] = st.t; };
  const trip = (msg: string, kind: Sym = 'decl_thermique') => {
    if (st.trip) return;
    if (multi && fx.tripLocal && !st.isolated) {
      const sb = Math.max(0, i.pump.standby ?? 0);
      st.isolated = msg; st.tripKind = kind; seen(kind);
      st.hum = false; st.noFlow = false; st.runT = 0;
      fx = combined(ctx.fx.ids.filter((x) => !LOCAL_FAULTS.has(x)));
      newEv.push({ t: st.t, sev: 'critical', text: `${msg} — pompe 1 isolée, ${sb ? 'basculement automatique sur la pompe de secours' : 'les autres pompes continuent (débit réduit)'}`, target: 'cable' });
      return;
    }
    if (st.on) hammer(true);
    st.trip = msg; st.tripKind = kind; seen(kind); st.on = false; st.hum = false; st.noFlow = false; st.q = 0;
    newEv.push({ t: st.t, sev: 'critical', text: `${msg} — la pompe est arrêtée, réarmement nécessaire`, target: 'cable' });
  };
  const start = () => {
    if (st.on) return;
    if (!st.master) return;
    const power = st.t >= st.outageUntil;
    if (!power || st.trip) { st.blocked = true; return; }
    st.blocked = false;
    if (fx.tripAtStart) { st.starts++; st.startLog = [...st.startLog, st.t].slice(-60); trip(fx.tripAtStart, fx.tripKind ?? 'decl_diff'); return; }
    if (st.burnt) { st.blocked = true; return; }
    st.on = true; st.starts++; st.runT = 0; st.startLog = [...st.startLog, st.t].slice(-60);
    // Chaque démarrage chauffe le bobinage (courant de démarrage pendant ~1 à 3 s)
    st.tm = (st.tm ?? tAmb) + 2.5 * Math.min(4, (er.istart / Math.max(0.1, er.inom) / 6) ** 2) * (soft ? 0.5 : 1);
    st.hum = !!fx.noStart;
    st.noFlow = !st.hum && !st.primed;
    newEv.push(...startEvent(ctx, st));
    if (st.hum) seen('ronfle', 'ne_demarre_pas', 'courant_haut');
    if (st.noFlow) seen('debit_nul', 'marche_a_sec');
    if (st.hum) newEv.push({ t: st.t, sev: 'critical', text: 'Le moteur ronfle mais ne tourne pas — courant de rotor bloqué', target: 'cable' });
    if (st.noFlow) newEv.push({ t: st.t, sev: 'critical', text: 'Pompe désamorcée : elle tourne sans débiter (marche à sec)', target: 'pump' });
  };
  const stop = (why: string, forced = false) => {
    if (!st.on) return;
    if (fx.noStop && !forced) {
      if (!st.runaway) newEv.push({ t: st.t, sev: 'critical', text: `Arrêt demandé (${why}) mais le moteur reste alimenté`, target: 'cable' });
      st.runaway = true; seen('ne_s_arrete_pas', 'marche_sans_commande'); return;
    }
    hammer(false);
    st.on = false; st.hum = false; st.noFlow = false; st.runaway = false;
    if (fx.primeLoss) st.primed = false;
    newEv.push(...stopEvent(ctx, st, why));
  };

  for (let k = 0; k < n; k++) {
    const hr = hourOf(st.t);
    const power = st.t >= st.outageUntil;
    if (!power && st.on) { hammer(true); st.on = false; st.hum = false; st.noFlow = false; newEv.push({ t: st.t, sev: 'warning', text: 'Coupure secteur : plus de tension, la pompe s\'arrête', target: 'cable' }); }
    if (power && prev.outageUntil > 0 && st.t - sub < st.outageUntil && st.t >= st.outageUntil) newEv.push({ t: st.t, sev: 'ok', text: 'Retour du courant : redémarrage automatique possible', target: 'cable' });
    if (!st.master) { stop('arrêt manuel', true); st.q = 0; st.blocked = false; }
    // Moteur déjà lancé quand la panne apparaît : il cale et ronfle (rotor bloqué)
    if (fx.noStart && st.on && !st.hum) { st.hum = true; st.runT = 0; seen('ronfle', 'ne_demarre_pas', 'courant_haut'); newEv.push({ t: st.t, sev: 'critical', text: 'Le moteur cale et ronfle — courant de rotor bloqué', target: 'cable' }); }
    const leakQ = ((fx.leak ?? 0) + (st.burst === 'rupture' ? 0.7 : st.burst === 'fuite' ? 0.2 : 0) + (st.sealGone ? 0.03 : 0)) * i.duty.qReq;
    st.backDrop = false;

    if (kind === 'vessel' && v) {
      const vt = (v.vol / 1000) * (fx.vesselK ?? 1); // m³ utiles
      const qd = use(ctx, hr) * i.duty.qReq + leakQ;
      let vw = vt * (1 - (v.pre + 1) / (Math.max(st.x, v.pre) + 1));
      if (st.x <= v.pOn) start();
      if (st.on && st.x >= v.pOff) {
        if (fx.pswitch === 'stuck') { if (!st.runaway) newEv.push({ t: st.t, sev: 'critical', text: `Pression d'arrêt ${f1(v.pOff)} bar atteinte mais le pressostat ne coupe pas`, target: 'acc:pressostat' }); st.runaway = true; }
        else stop(`pressostat (${f1(v.pOff)} bar)`);
      }
      const hNeed = (st.x * 1e5) / rhoG - suctionZ(i);
      const h0 = pumpHead(i, 0);
      // Débit de la pompe face à la pression du réservoir + pertes (vannes, filtres…) : bissection
      let qq = 0;
      if (st.on && !st.hum && !st.noFlow && h0 > hNeed) {
        let lo = 0, hi = i.pump.qn * 2.5 * h.n;
        for (let it = 0; it < 22; it++) { const m = (lo + hi) / 2; if (pumpHead(i, m) - losses(i, m).total > hNeed) lo = m; else hi = m; }
        qq = lo;
      }
      st.q = qq;
      if (!st.on && fx.backflow) { vw -= (0.25 * i.duty.qReq / 3600) * sub; st.backDrop = true; }
      vw += ((st.q - qd) / 3600) * sub;
      const pMax = (h0 + Math.max(0, suctionZ(i))) * rhoG / 1e5;
      if (vw <= 0) st.x = st.on && st.q > 0 ? Math.min(v.pOff, st.x) : Math.max(0, st.x - 0.08);
      else st.x = Math.min(pMax, (v.pre + 1) * vt / Math.max(1e-6, vt - Math.min(vw, vt * 0.95)) - 1);
      if (st.on && st.q < 0.05 * i.duty.qReq && st.x >= pMax - 0.05) st.x = pMax;
      st.s = 1;
    } else if (kind === 'vfd') {
      const set = (v0?.pOn ?? 3) + 0.5;
      const qd = use(ctx, hr) * i.duty.qReq + leakQ;
      if (fx.sensorZero) {
        // Le variateur croit la pression nulle : il reste à 50 Hz et ne se met jamais en veille
        start();
        if (st.on && !st.hum && !st.noFlow) {
          st.s = 1; st.q = qd;
          st.x = Math.max(0, (pumpHead(i, qd) + suctionZ(i)) * rhoG / 1e5);
          if (qd < 0.06 * i.duty.qReq) { if (!st.runaway) newEv.push({ t: st.t, sev: 'critical', text: 'Consommation nulle mais le variateur reste à 50 Hz (capteur lu à 0 bar)', target: 'acc:capteur_p' }); st.runaway = true; }
        } else { st.q = 0; }
      } else {
        if (qd > 0.06 * i.duty.qReq) start();
        if (st.on && qd < 0.04 * i.duty.qReq) stop('mise en veille (très faible consommation)');
        const hs = (set * 1e5) / rhoG - suctionZ(i);
        const sNeed = speedFor(i, qd, hs);
        if (st.on && (st.hum || st.noFlow)) { st.q = 0; st.s = 1; st.x = Math.max(0, st.x - 0.05); }
        else if (st.on && sNeed > 1) {
          st.s = 1;
          const hAt = Math.max(0, pumpHead(i, qd));
          st.x = Math.max(0, (hAt + suctionZ(i)) * rhoG / 1e5);
          st.q = qd;
          if (!st.cav) { st.cav = true; newEv.push({ t: st.t, sev: 'warning', text: `Variateur à 50 Hz : consigne ${f1(set)} bar non tenue (${f1(st.x)} bar) — pompe trop faible pour cette consommation`, target: 'pump' }); }
        } else if (st.on) {
          st.q = qd;
          st.x = set + (Math.sin(st.t / 37) * 0.04);
          st.s = Math.max(0.3, sNeed);
          if (sNeed < 0.95) st.cav = false;
        } else {
          st.q = 0;
          st.x = Math.max(fx.backflow ? 0 : set - 0.6, st.x - (fx.backflow ? 0.12 : 0.01) - (qd > 0 && !power ? 0.2 : 0));
          if (fx.backflow) st.backDrop = true;
        }
      }
    } else if (kind === 'pit') {
      const area = (i.geo.tankVolume / 1000) / 0.5; // m², 0,5 m entre flotteurs
      const qin = (0.15 + 0.75 * use(ctx, hr)) * i.duty.qReq * 0.55;
      const hasStart = !!i.acc.flotteur_marche?.on && fx.floatPit !== 'low';
      const hasStop = !!i.acc.flotteur_arret?.on && fx.floatPit !== 'high';
      if (hasStart && st.x >= 0.5) start();
      if (fx.floatPit === 'low' && st.x >= 0.5 && !st.on) st.blocked = true;
      if (!i.acc.flotteur_marche?.on && st.x >= 0.5 && !st.overflow && st.x >= 1.2) { st.overflow = true; newEv.push({ t: st.t, sev: 'critical', text: 'Débordement de la fosse : aucun flotteur de marche', target: 'acc:flotteur_marche' }); }
      if (st.on && st.x <= 0) {
        if (hasStop) stop('flotteur bas');
        else if (fx.floatPit === 'high' && !st.runaway) { st.runaway = true; newEv.push({ t: st.t, sev: 'critical', text: 'Fosse vide mais le flotteur d\'arrêt ne coupe pas', target: 'acc:flotteur_arret' }); }
      }
      st.q = st.on && h.ok && !st.hum && !st.noFlow ? h.q : 0;
      st.x += ((qin - st.q) / 3600 / area) * sub;
      if (st.x < -0.1) {
        st.x = -0.1;
        if (st.on && !st.dry) { st.dry = true; newEv.push({ t: st.t, sev: 'critical', text: 'Marche à sec : la fosse est vide et la pompe tourne', target: 'acc:flotteur_arret' }); }
        if (st.on) st.q = qin;
      } else st.dry = false;
      if (st.x > 0.8 && i.acc.flotteur_alarme?.on && !st.overflow) { st.overflow = true; newEv.push({ t: st.t, sev: 'warning', text: 'Alarme niveau très haut', target: 'acc:flotteur_alarme' }); }
      if (st.x > 1.25 && !st.overflow) { st.overflow = true; newEv.push({ t: st.t, sev: 'critical', text: 'La fosse déborde', target: 'source' }); }
      if (st.x < 0.6) st.overflow = false;
      st.x = Math.min(st.x, 1.3);
    } else if (kind === 'solar') {
      const sr = solarCalc(i, h);
      const gpk = (sr?.pshDesign ?? i.elec.solar.psh) / 7.64;
      const g = Math.max(0, Math.sin((Math.PI * (hr - 6)) / 12)) * gpk;
      st.pv = sr ? (sr.wc / 1000) * g * 0.75 : 0;
      const pFull = Math.max(0.1, h.pElec / 0.95);
      if (st.pv >= 0.3 * pFull) start();
      if (st.on && st.pv < 0.25 * pFull) stop(hr > 12 ? 'fin de journée, soleil insuffisant' : 'soleil insuffisant', true);
      if (st.on && !st.hum && !st.noFlow) {
        st.s = Math.min(1, Math.cbrt(st.pv / pFull));
        const hs = atSpeed(i, st.s);
        st.q = hs.ok ? hs.q : 0;
      } else { st.q = 0; st.s = st.on ? 1 : 0; }
      st.x += (st.q / 3600) * sub;
      if (hr < 0.01) st.x = 0;
    } else if (kind === 'tank') {
      const cap = Math.max(5, i.duty.qReq * 4); // m³
      const out = use(ctx, hr) * i.duty.qReq * 0.55 + leakQ;
      const hasFloat = !!i.acc.flotteur_res?.on;
      if (!hasFloat || st.x < 0.7) start();
      if (st.on && hasFloat && st.x >= 1) {
        if (fx.floatRes) { if (!st.runaway) newEv.push({ t: st.t, sev: 'critical', text: 'Réservoir plein mais le flotteur ne commande pas l\'arrêt', target: 'acc:flotteur_res' }); st.runaway = true; }
        else stop('réservoir plein (flotteur)');
      }
      st.q = st.on && h.ok && !st.hum && !st.noFlow ? h.q : 0;
      const back = !st.on && fx.backflow ? 0.3 * i.duty.qReq : 0;
      if (back) st.backDrop = true;
      st.x += ((st.q - out - back) / 3600 / cap) * sub;
      if (st.x > 1.02 && !st.overflow) { st.overflow = true; newEv.push({ t: st.t, sev: 'warning', text: 'Réservoir plein : il déborde', target: 'acc:flotteur_res' }); }
      if (st.x < 0.95) st.overflow = false;
      st.x = Math.max(0, Math.min(1.05, st.x));
    } else {
      start();
      st.q = st.on && h.ok && !st.hum && !st.noFlow ? h.q : 0;
    }

    // ----- Rabattement de la source -----
    if (fx.drawdown) {
      st.dd = st.on && st.q > 0 ? st.dd + (fx.drawdown * sub) / 3600 : Math.max(0, st.dd - (fx.drawdown * 0.4 * sub) / 3600);
      if (st.on && !st.hum) {
        if (st.dd >= avail) {
          if (!st.noFlow) newEv.push({ t: st.t, sev: 'critical', text: `Niveau d'eau sous l'entrée de la pompe (−${f1(st.dd)} m) : la pompe aspire de l'air`, target: 'source' });
          st.noFlow = true; st.q = 0;
        } else {
          st.q *= Math.max(0.2, 1 - 0.5 * (st.dd / avail) ** 2);
        }
      }
    }


    // ===== Physique : moteur, liquide dans la pompe, pression =====
    {
      const closedNow = st.on && !st.hum && !st.noFlow && h.ok && st.q < 0.05;
      if (st.on && st.dry) seen('marche_a_sec');
      const iR = !st.on ? 0 : st.hum ? (i.elec.supply === 'mono' ? 4.5 : 3.2) : st.noFlow ? 0.42 : closedNow ? 0.5 * (fx.ampsK ?? 1)
        : iBase * (fx.ampsK ?? 1) * (kind === 'vfd' || kind === 'solar' ? Math.max(0.35, st.s ** 2) : 1);
      // Refroidissement : moteur immergé = liquide qui le longe ; moteur de surface = ventilateur (arrêté avec le moteur)
      let cool = 1;
      if (st.on && imm) {
        if (st.noFlow || st.dry) cool = 8; // moteur dans l'air : plus aucun refroidissement par l'eau
        else if (closedNow) cool = 2; // eau immobile autour du moteur
        else if (isForage(i) && !i.acc.chemise?.on && i.geo.boreDia > i.pump.diameterMm) {
          const ann = (Math.PI / 4) * ((i.geo.boreDia / 1000) ** 2 - (i.pump.diameterMm / 1000) ** 2);
          const vc = st.q / 3600 / Math.max(1e-4, ann);
          if (vc < 0.08) cool = 1.35; // vitesse de refroidissement insuffisante
        }
      }
      const tEq = tAmb + 80 * iR * iR * cool;
      const tau = st.hum ? tauM / 3 : !st.on && !imm ? tauM * 2.5 : tauM;
      st.tm = (st.tm ?? tAmb) + ((tEq - (st.tm ?? tAmb)) * sub) / tau;
      if (st.tm > 130) once('tm130', { t: st.t, sev: 'warning', text: `Moteur chaud : bobinage à ${f1(st.tm, 0)} °C`, target: 'pump' });
      if (st.tm > 155) { once('tm155', { t: st.t, sev: 'critical', text: `Bobinage à ${f1(st.tm, 0)} °C : au-delà de la classe d'isolation F (155 °C), le vernis se dégrade`, target: 'pump' }); seen('bruit'); }
      if (st.tm > 180 && !st.burnt) {
        st.burnt = true;
        trip(`Moteur grillé : bobinage à ${f1(st.tm, 0)} °C, court-circuit entre spires`, 'decl_thermique');
      }
      if (st.tm < 100) { delete st.flags!.tm130; }
      // Relais thermique du disjoncteur moteur (classe 10, réglé au courant nominal)
      if (i.elec.supply !== 'solaire') {
        st.relay = (st.relay ?? 0) + ((iR * iR - (st.relay ?? 0)) * sub) / 250;
        if (st.on && st.relay >= 1.44) trip(`Disjoncteur moteur Q1 déclenché (relais thermique) : ${f1(iR * er.inom)} A pour un réglage de ${f1(er.inom)} A`, 'decl_thermique');
      }
      // Liquide dans le corps de pompe : à débit nul, toute la puissance chauffe le liquide
      const tf = i.fluid.temp;
      if (closedNow) st.tl = (st.tl ?? tf) + ((kwM * 0.35 * 1000) / (mCase * 4186)) * sub;
      else if (st.on && !st.noFlow && !st.hum) st.tl = (st.tl ?? tf) + ((tf - (st.tl ?? tf)) * sub) / 30;
      else st.tl = (st.tl ?? tf) + ((tf - (st.tl ?? tf)) * sub) / 900;
      const ts = tSat(pShut + 1);
      if (st.tl > 60 && closedNow) once('tl60', { t: st.t, sev: 'warning', text: `Le liquide chauffe dans la pompe : ${f1(st.tl, 0)} °C (débit nul, vanne fermée)`, target: 'pump' });
      if (st.tl >= ts - 2) {
        st.tl = ts;
        if (!st.sealGone) {
          st.sealGone = true; seen('fuite_visible', 'bruit');
          newEv.push({ t: st.t, sev: 'critical', text: `Vaporisation dans la pompe (${f1(ts, 0)} °C) : la garniture mécanique est détruite, fuite au niveau de l'arbre`, target: 'pump' });
        }
      }
      if (st.tl < 50) delete st.flags!.tl60;
      // Pression à débit nul contre la conduite
      if (closedNow && pShut > pn * 0.8 && !st.flags!.pshut) {
        st.flags!.pshut = true;
        if (i.acc.soupape?.on) { newEv.push({ t: st.t, sev: 'warning', text: `La soupape de décharge s'ouvre : elle limite la pression à environ ${f1(Math.min(pShut, pn * 0.9))} bar`, target: 'acc:soupape' }); st.pPeak = Math.min(pShut, pn * 0.9); st.pPeakT = st.t; }
        else hit(pShut, 'Pression à débit nul');
      }
      if (!closedNow) delete st.flags!.pshut;
      // Cavitation
      if (st.on && h.ok && !st.noFlow && h.margin < 0.5) {
        st.cavT = (st.cavT ?? 0) + sub; seen('bruit');
        if (st.cavT >= 600) once('cav', { t: st.t, sev: 'critical', text: 'Cavitation prolongée : bruit de gravier, la roue s\'érode (piqûres)', target: 'pump' });
      }
    }
    // ----- Marche sans débit : protection manque d'eau -----
    if (st.on && st.noFlow) {
      st.dry = true; dryT += sub;
      if (hasDryProt && dryT >= 30) trip('Relais manque d\'eau déclenché', 'decl_manque_eau');
    } else if (kind !== 'pit') st.dry = false;

    if (st.runaway) seen('ne_s_arrete_pas');
    if (st.backDrop) seen('pression_tombe_arret');
    if (st.on && st.noFlow) seen('debit_nul', 'marche_a_sec');
    if (st.blocked && !st.on && !st.trip) seen('ne_demarre_pas'); // après un déclenchement, c'est la protection qui empêche le démarrage
    // ----- Déclenchement thermique / défaut -----
    if (st.on) {
      st.runT += sub; st.runTot = (st.runTot ?? 0) + sub;
      if (fx.tripAfter != null && st.runT >= fx.tripAfter) trip(fx.tripMsg ?? 'Protection déclenchée', fx.tripKind ?? 'decl_thermique');
    }

    // Pompe qui tourne contre une vanne fermée : pas de débit, l'eau s'échauffe dans le corps
    if (st.on && !st.hum && !st.noFlow && h.ok && h.q < 0.05) {
      seen('debit_nul', 'pression_haute', 'courant_bas');
      if (st.runT >= 120 && st.runT - sub < 120) newEv.push({ t: st.t, sev: 'critical', text: 'La pompe tourne vanne fermée depuis 2 min : aucun débit, l\'eau chauffe dans la pompe (garniture en danger)', target: 'acc:vanne_ref' });
    }
    if (st.on) {
      const kw = h.ok && h.q < 0.05 && !st.hum ? (i.pump.motorKw / 0.88) * 0.4 * h.n : st.hum ? i.pump.motorKw * 0.3 : st.noFlow ? h.pElec * 0.35 : kind === 'solar' ? Math.min(st.pv, h.pElec / 0.95) : kind === 'vfd' ? h.pElec * Math.max(0.15, st.s ** 3) : h.pElec * (st.q > 0 && h.q > 0 ? Math.max(0.5, Math.min(1.1, st.q / h.q)) : 1);
      st.kwh += (kw * sub) / 3600;
      st.vol += (st.q * sub) / 3600;
    }
    st.t += sub;
  }

  const hr = hourOf(st.t);
  const a = kind === 'vessel' || kind === 'vfd' ? st.x : kind === 'pit' ? st.x * 100 : kind === 'solar' ? st.pv : kind === 'tank' ? st.x * 100 : liveReadings(ctx, st).pRef;
  const c = kind === 'vessel' || kind === 'vfd' ? use(ctx, hr) * i.duty.qReq : kind === 'pit' ? (0.15 + 0.75 * use(ctx, hr)) * i.duty.qReq * 0.55 : kind === 'tank' ? use(ctx, hr) * i.duty.qReq * 0.55 : null;
  st.series = [...prev.series, { t: st.t, a, b: st.q, c }].slice(-240);
  if (newEv.length) st.events = [...newEv.reverse(), ...prev.events].slice(0, 80);
  return st;
}

/** Lectures des instruments, pannes comprises. */
export function liveReadings(ctx: SimCtx, st: SimState): Readings {
  const { i, h, er, kind, fx } = ctx;
  const rhoG = i.fluid.rho * G;
  const bar = (m: number) => (m * rhoG) / 1e5;
  const running = st.on && st.q > 0 && !st.hum && !st.noFlow;
  const r = readings(i, h, running, er, running ? st.q : undefined, kind === 'vfd' && running ? st.s : 1);
  if (st.on && st.hum) return { ...r, on: true, q: 0, kw: i.pump.motorKw * 0.3, amps: er.inom * (i.elec.supply === 'mono' ? 4.5 : 3.2) };
  if (st.on && st.noFlow) return { ...r, on: true, q: 0, pRef: bar(Math.max(0, suctionZ(i))), pAsp: bar(Math.min(0, suctionZ(i))), kw: h.pElec * 0.35, amps: er.inom * 0.42 };
  if (st.on && !running && kind === 'vessel' && st.runaway) return { ...r, on: true, kw: h.pElec * 0.45, amps: er.inom * 0.5 * (fx.ampsK ?? 1) };
  const out = { ...r };
  // Vanne fermée : la pompe tourne à débit nul (puissance ≈ 40 % de la nominale, pression maxi de la courbe)
  if (running && h.q < 0.05) { out.kw = (i.pump.motorKw / 0.88) * 0.4 * h.n; out.amps = er.inom * 0.5; out.q = 0; }
  if (running && fx.ampsK) out.amps = out.amps * fx.ampsK;
  if (running && st.dd > 0 && i.mode === 'aspiration') out.pAsp = r.pAsp - bar(st.dd);
  return out;
}

/** Symptômes observables (mesures + constats), comparés à l'installation sans panne. */
export function observe(ctx: SimCtx, normal: SimCtx, st: SimState): Sym[] {
  const { i, kind, fx, er } = ctx;
  const o = new Set<Sym>();
  const r = liveReadings(ctx, st);
  const running = st.on && !st.hum && !st.noFlow;
  const rn = readings(normal.i, normal.h, true, normal.er, kind === 'vessel' || kind === 'vfd' ? Math.max(0.1, st.q) : undefined, kind === 'vfd' ? st.s : 1);
  if (st.t < st.outageUntil) { o.add('pas_de_tension'); o.add('ne_demarre_pas'); }
  if ((st.trip || st.isolated) && st.tripKind) o.add(st.tripKind);
  // Symptômes passagers : ceux des 3 dernières heures, ou des 3 heures avant le déclenchement (tant qu'il n'est pas réarmé)
  const ref = (st.trip || st.isolated) && st.tripKind && st.recent[st.tripKind as Sym] != null ? st.recent[st.tripKind as Sym]! : st.t;
  for (const [k, t] of Object.entries(st.recent)) if (t != null && t > ref - 3 * 3600) o.add(k as Sym);
  if (fx.ids.includes('sous_tension') && st.t >= st.outageUntil) o.add('tension_basse');
  if (st.overflow) o.add('debordement');
  if (st.on && st.noFlow) { o.add('debit_nul'); o.add('marche_a_sec'); o.add('courant_bas'); }
  if (st.dry && st.on) o.add('marche_a_sec');
  if (st.backDrop) o.add('pression_tombe_arret');
  const recent = st.startLog.filter((t) => t > st.t - 3600).length;
  if (recent > Math.max(6, i.pump.maxStarts)) o.add('cycles_courts');
  if (running) {
    if (kind === 'continuous' || kind === 'tank' || kind === 'solar') {
      const qExp = kind === 'solar' ? atSpeed(normal.i, st.s).q : normal.h.q;
      if (st.q < qExp * 0.85) o.add(st.q < 0.05 ? 'debit_nul' : 'debit_bas');
      if (kind !== 'solar' && r.pRef < rn.pRef * 0.85 - 0.05) o.add('pression_basse');
      if (kind !== 'solar' && r.pRef > rn.pRef * 1.15 + 0.1) o.add('pression_haute');
    }
    if (kind === 'vessel' && r.pRef > rn.pRef * 1.15 + 0.2) o.add('pression_haute');
    if (r.amps > rn.amps * 1.12 + 0.1 || r.amps > er.inom * 1.05) o.add('courant_haut');
    if (r.amps < rn.amps * 0.86) o.add('courant_bas');
    if (r.pAsp < rn.pAsp - 0.12) o.add('depression_forte');
  }
  if (kind === 'vessel' && ctx.er.vessel) {
    const v = ctx.er.vessel;
    if (st.x > v.pOff + 0.3) o.add('pression_haute');
    if (st.x < v.pOn - 0.4 || (fx.pswitch === 'drift' && st.x < v.pOff - 0.6)) o.add('pression_basse');
  }
  if (kind === 'vfd') {
    const set = (ctx.er.vessel?.pOn ?? 3) + 0.5;
    if (st.x > set + 0.6) o.add('pression_haute');
    if (st.x < set - 0.5) o.add('pression_basse');
  }
  // Constats sur le terrain (bruit, fuite) liés aux pannes présentes
  for (const id of fx.ids) for (const s of faultById(id)?.sig ?? []) if (s === 'bruit' || s === 'fuite_visible') o.add(s);
  return [...o];
}

export const SERIES_LABEL: Record<SimKind, { a: string; unit: string; c?: string }> = {
  vessel: { a: 'Pression du réseau', unit: 'bar', c: 'Consommation' },
  vfd: { a: 'Pression du réseau', unit: 'bar', c: 'Consommation' },
  pit: { a: 'Niveau au-dessus du flotteur bas', unit: 'cm', c: 'Arrivée d\'effluents' },
  solar: { a: 'Puissance solaire disponible', unit: 'kW' },
  tank: { a: 'Remplissage du réservoir', unit: '%', c: 'Consommation' },
  continuous: { a: 'Pression au refoulement', unit: 'bar' },
};
