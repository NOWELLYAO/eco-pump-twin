import { losses, pumpEta, pumpHead, speedFor, staticHead, pressureHead, suctionZ, type Hydro } from './hydraulics';
import { refStatic } from './catalog';
import type { Elec, Installation, Issue, StartId } from './types';

const f1 = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const f0 = (v: number) => Math.round(v).toLocaleString('fr-FR');

export const SECTIONS = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120];
/** Intensité admissible (A), câble cuivre multiconducteur, pose courante. */
const AMPACITY_CU = [17, 23, 31, 40, 54, 73, 95, 117, 141, 179, 216, 249];
export const TANK_SIZES = [8, 12, 18, 24, 35, 50, 60, 80, 100, 150, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000];
const START_FACTOR: Record<StartId, number> = { direct: 6, etoile: 2.2, progressif: 3, variateur: 1.1 };
export const START_LABEL: Record<StartId, string> = { direct: 'Démarrage direct', etoile: 'Étoile-triangle', progressif: 'Démarreur progressif', variateur: 'Variateur de fréquence' };
export const SUPPLY_LABEL = { mono: 'Réseau monophasé 230 V', tri: 'Réseau triphasé 400 V', groupe: 'Groupe électrogène', solaire: 'Solaire (contrôleur MPPT)' } as const;

export function defaultElec(i: Pick<Installation, 'pump' | 'pumpType' | 'geo' | 'duty'>): Elec {
  const mono = i.pump.motorKw <= 1.5;
  const len = i.pumpType === 'immergee_forage' ? Math.round(i.geo.pumpDepth + 15) : i.pumpType === 'submersible_relevage' || i.pumpType === 'drainage_immergee' ? 20 : 10;
  return {
    supply: mono ? 'mono' : 'tri', voltage: mono ? 230 : 400, start: 'direct', cosphi: 0.82,
    cableLen: len, cableSec: 2.5, cableMat: 'cu', genKva: 0,
    solar: { psh: 5.5, panelWc: 450, vmp: 41.5, voc: 49.8, imp: 10.85, vdcMax: 800, vmpptMin: 450, dailyM3: Math.round(i.duty.qReq * 6), panels: 0, dcLen: 20, dcSec: 4 },
  };
}

/** Complète une installation ancienne ou partielle avec les réglages électriques par défaut. */
export function ensureElec<T extends Omit<Installation, 'elec'> & { elec?: Partial<Elec> }>(i: T): Installation {
  const d = defaultElec(i);
  return { ...i, elec: { ...d, ...i.elec, solar: { ...d.solar, ...(i.elec?.solar ?? {}) } } } as Installation;
}

export const motorEff = (kw: number) => Math.min(0.94, 0.78 + 0.045 * Math.log(kw + 1));
const isMono = (e: Elec) => e.supply === 'mono';
/** Le moteur est alimenté en monophasé seulement sur réseau mono sans variateur mono→tri. */
const phaseK = (e: Elec) => (isMono(e) ? 2 : Math.sqrt(3));

export function motorCurrent(kw: number, e: Elec) {
  const eta = motorEff(kw);
  return (kw * 1000) / ((isMono(e) ? 1 : Math.sqrt(3)) * e.voltage * e.cosphi * eta);
}

export function effectiveStart(i: Installation): StartId {
  if (i.elec.supply === 'solaire' || i.acc.variateur?.on) return 'variateur';
  return i.elec.start === 'variateur' ? 'direct' : i.elec.start;
}

function dropPct(len: number, amps: number, sec: number, e: Elec, cos = e.cosphi) {
  const rho = e.cableMat === 'cu' ? 0.0225 : 0.036;
  return ((phaseK(e) * len * amps * rho * cos) / sec / e.voltage) * 100;
}
const ampacity = (sec: number, mat: 'cu' | 'al') => {
  const k = SECTIONS.indexOf(sec);
  const a = k >= 0 ? AMPACITY_CU[k] : AMPACITY_CU[0] * (sec / 1.5);
  return mat === 'cu' ? a : a * 0.78;
};

export interface ElecResult {
  inom: number; irun: number; istart: number; start: StartId;
  dropRun: number; dropStart: number; amp: number;
  secRec: number; cores: string; cableType: string;
  breaker: string; vfdKw: number; vfdA: number; filter: string | null;
  genKva: number;
  vfdSpeed: { s: number; hz: number; pNow: number; pNew: number; saving: number } | null;
  vessel: VesselResult | null;
  solar: SolarResult | null;
  feed: { iTot: number; rating: number; sec: number; drop: number; len: number } | null; // arrivée générale du coffret
}

export interface VesselResult {
  pReq: number; pMax: number; pOn: number; pOff: number; pre: number; pn: number; vol: number;
  volRec: number; pnRec: number; dv: number; starts: number; auto: boolean;
  qFill: number; // débit de la pompe entre marche et arrêt (m³/h)
  useful: number; // part utile du réservoir (0–1)
  volTheo: number; // volume théorique (L)
  zMax: number;
  sizes: { vol: number; starts: number; ok: boolean }[];
  rec: { pOn: number; pOff: number; pre: number; vol: number; pn: number };
  plan: { n: number; size: number; total: number }; // réservoir(s) conseillé(s)
  altDp: { vol: number; pOff: number } | null; // plus grand écart de pression → réservoir plus petit
  altTwo: { n: number; vol: number } | null; // plusieurs réservoirs
  volVfd: number; // avec variateur + capteur
  vfd: boolean;
}

export const MONTHS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

export interface SolarResult {
  monthly: { m: number; ghi: number; m3: number; used: boolean }[] | null;
  designMonth: number; pshDesign: number; prDesign: number;
  eM3: number; wcNeed: number; wcMinMotor: number; nNeed: number;
  ns: number; np: number; n: number; wc: number; area: number;
  vmpStr: number; vocCold: number; iStr: number; dailyM3: number; hours: number; storage: number;
  dcDrop: number; dcSecRec: number; possible: boolean; nsMin: number; nsMax: number;
}

const ceilTo = (v: number, list: number[]) => list.find((x) => x >= v) ?? list[list.length - 1];
/** Au-delà de la plus grande taille du commerce : plusieurs réservoirs identiques. */
export function tankPlan(v: number) {
  const max = TANK_SIZES[TANK_SIZES.length - 1];
  if (!Number.isFinite(v)) return { n: 1, size: max, total: max };
  const n = Math.max(1, Math.ceil(v / max));
  const size = ceilTo(v / n, TANK_SIZES);
  return { n, size, total: n * size };
}
export const planLabel = (p: { n: number; size: number }) => (p.n > 1 ? `${p.n} × ${p.size} L` : `${p.size} L`);

/** Réservoir à vessie : pressions de réglage, volume (loi de Boyle) et démarrages par heure. */
export function vessel(i: Installation, h: Hydro): VesselResult | null {
  const st = i.acc.vessie;
  if (!st?.on || !h.ok) return null;
  const rhoG = i.fluid.rho * 9.81;
  const z = suctionZ(i);
  // Pression nécessaire au refoulement pour servir le point le plus haut au débit demandé
  const lossRef = losses(i, i.duty.qReq).ref;
  const pReq = Math.max(0.5, ((refStatic(i) + pressureHead(i) + lossRef) * rhoG) / 1e5);
  const pMax = ((pumpHead(i, 0) + Math.max(0, z)) * rhoG) / 1e5;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  // Débit de la pompe à une pression de refoulement donnée (inverse de la courbe)
  const flowAt = (pBar: number) => {
    const H = (pBar * 1e5) / rhoG - z;
    if (pumpHead(i, 0) <= H) return 0;
    let lo = 0, hi = i.pump.qn * 3 * h.n;
    for (let n = 0; n < 50; n++) { const m = (lo + hi) / 2; if (pumpHead(i, m) > H) lo = m; else hi = m; }
    return lo;
  };
  const vfd = effectiveStart(i) === 'variateur';
  const zMax = i.pump.maxStarts;
  const MARGIN = 1.1; // +10 % (formule constructeur V = 16,5 × Q × …)
  const theo = (q: number, pOn: number, pOff: number, pre: number) => {
    const k = (pre + 1) * (1 / (pOn + 1) - 1 / (pOff + 1));
    return { k, v: k > 0 ? ((q / (4 * zMax)) / k) * 1000 * MARGIN : Infinity };
  };

  // Réglages conseillés (toujours recalculés)
  const recOn = Math.ceil((pReq + 0.2) * 10) / 10;
  const recOff = Math.max(r1(recOn + 0.6), Math.min(r1(recOn + 1.5), Math.floor((pMax - 0.3) * 10) / 10));
  const recPre = r1(recOn - 0.2);
  const recQ = flowAt((recOn + recOff) / 2) || h.q;
  const recTheo = theo(recQ, recOn, recOff, recPre).v;
  const recVol = vfd ? ceilTo(Math.max(8, (h.q * 1000) / 60 * 0.1), TANK_SIZES) : tankPlan(recTheo).total;
  const recPn = [6, 8, 10, 16, 25].find((p) => p >= Math.max(recOff * 1.1, pMax)) ?? 25;

  // Réglages réels (saisis ou conseillés)
  const auto = st.pOn == null || st.pOff == null;
  const pOn = st.pOn ?? recOn;
  const pOff = st.pOff ?? recOff;
  const pre = st.pre ?? r1(pOn - 0.2);
  const qFill = flowAt((pOn + pOff) / 2) || h.q;
  const { k, v: volTheo } = theo(qFill, pOn, pOff, pre);
  const volVfd = ceilTo(Math.max(8, (h.q * 1000) / 60 * 0.1), TANK_SIZES);
  const plan = vfd ? { n: 1, size: volVfd, total: volVfd } : tankPlan(volTheo);
  const volRec = plan.total;
  const vol = st.vol ?? volRec;
  const startsFor = (v: number) => (k > 0 && v > 0 ? qFill / (4 * (v / 1000) * k) : 999);
  const dv = (vol / 1000) * Math.max(0, k);
  const starts = vfd ? 0 : startsFor(vol);
  const sizes = vfd ? [] : TANK_SIZES.filter((s) => s >= volTheo * 0.35 && s <= Math.max(volTheo * 2.2, 100)).slice(0, 7)
    .map((s) => ({ vol: s, starts: startsFor(s), ok: startsFor(s) <= zMax }));
  // Alternative : écart de pression plus grand pour se contenter de la taille inférieure
  let altDp: VesselResult['altDp'] = null;
  const below = [...TANK_SIZES].reverse().find((s) => s < volRec);
  if (!vfd && below) {
    const kNeed = ((qFill / (4 * zMax)) / (below / 1000)) * MARGIN;
    const inv = 1 / (pOn + 1) - kNeed / (pre + 1);
    if (inv > 0) {
      const pOff2 = Math.ceil((1 / inv - 1) * 10) / 10;
      if (pOff2 > pOff && pOff2 <= pMax - 0.3 && pOff2 * 1.1 <= (st.pn ?? recPn) + 2) altDp = { vol: below, pOff: pOff2 };
    }
  }
  const altTwo = !vfd && volTheo > 500 && volTheo <= TANK_SIZES[TANK_SIZES.length - 1] ? { n: 2, vol: ceilTo(volTheo / 2, TANK_SIZES) } : null;
  const pnRec = [6, 8, 10, 16, 25].find((p) => p >= Math.max(pOff * 1.1, pMax)) ?? 25;
  return {
    pReq, pMax, pOn, pOff, pre, pn: st.pn ?? pnRec, vol, volRec, pnRec, dv, starts, auto,
    qFill, useful: Math.max(0, k), volTheo: vfd ? volVfd : volTheo, zMax, sizes,
    rec: { pOn: recOn, pOff: recOff, pre: recPre, vol: recVol, pn: recPn }, plan, altDp, altTwo, volVfd, vfd,
  };
}

/** Pompage solaire : champ photovoltaïque, câblage série/parallèle, volume journalier. */
export function solar(i: Installation, h: Hydro): SolarResult | null {
  if (i.elec.supply !== 'solaire' || !h.ok || h.q <= 0) return null;
  const s = i.elec.solar;
  // Pertes : température, poussière, câbles, contrôleur, éclairement variable.
  // Avec données mensuelles : 0,78 hors température, puis −0,4 %/°C au-dessus de 25 °C de cellule (≈ air + 20 °C).
  const hasM = Array.isArray(s.ghi) && s.ghi.length === 12 && s.ghi.every((v) => Number.isFinite(v) && v > 0);
  const used = (m: number) => !s.months || s.months.length !== 12 || s.months[m];
  const prM = (m: number) => (hasM ? 0.78 * (1 - 0.004 * Math.max(0, (s.temp?.[m] ?? 25) + 20 - 25)) : 0.7);
  const pshM = (m: number) => (hasM ? s.ghi![m] : s.psh);
  let designMonth = -1;
  if (hasM) {
    const idx = Array.from({ length: 12 }, (_, m) => m).filter(used);
    designMonth = (idx.length ? idx : Array.from({ length: 12 }, (_, m) => m)).reduce((a, b) => (pshM(b) * prM(b) < pshM(a) * prM(a) ? b : a));
  }
  const pshDesign = hasM ? pshM(designMonth) : s.psh;
  const PR = hasM ? prM(designMonth) : 0.7;
  const eM3 = (h.pElec / 0.95) / h.q; // kWh/m³ (rendement contrôleur 95 %)
  const wcNeed = (s.dailyM3 * eM3 * 1000) / (pshDesign * PR);
  const wcMinMotor = i.pump.motorKw * h.n * 1000 * 1.3;
  const wcTarget = Math.max(wcNeed, wcMinMotor);
  const nNeed = Math.ceil(wcTarget / s.panelWc);
  const nsMax = Math.floor(s.vdcMax / (s.voc * 1.12)); // Voc à froid (+12 %)
  const nsMin = Math.ceil(s.vmpptMin / (s.vmp * 0.88)); // Vmp à chaud (−12 %)
  const possible = nsMin <= nsMax && nsMax > 0;
  const nTarget = s.panels > 0 ? s.panels : nNeed;
  let best = { ns: Math.max(1, nsMax), np: 1, n: 0 };
  if (possible) {
    best = { ns: nsMax, np: Math.ceil(nTarget / nsMax), n: nsMax * Math.ceil(nTarget / nsMax) };
    for (let ns = nsMin; ns <= nsMax; ns++) {
      const np = Math.ceil(nTarget / ns);
      const n = ns * np;
      if (n < best.n || (n === best.n && ns > best.ns)) best = { ns, np, n };
    }
  } else best = { ns: Math.max(1, nsMax), np: Math.ceil(nTarget / Math.max(1, nsMax)), n: Math.max(1, nsMax) * Math.ceil(nTarget / Math.max(1, nsMax)) };
  if (s.panels > 0 && possible) best = { ns: best.ns, np: Math.max(1, Math.floor(s.panels / best.ns)), n: best.ns * Math.max(1, Math.floor(s.panels / best.ns)) };
  const wc = best.n * s.panelWc;
  const dailyM3 = (wc * pshDesign * PR) / 1000 / eM3;
  const monthly = hasM ? Array.from({ length: 12 }, (_, m) => ({ m, ghi: pshM(m), m3: (wc * pshM(m) * prM(m)) / 1000 / eM3, used: used(m) })) : null;
  const vmpStr = best.ns * s.vmp;
  const iStr = best.np * s.imp;
  const dcDrop = ((2 * s.dcLen * iStr * 0.0225) / s.dcSec / vmpStr) * 100;
  const dcSecRec = SECTIONS.find((sec) => ((2 * s.dcLen * iStr * 0.0225) / sec / vmpStr) * 100 <= 2 && sec >= 4) ?? 120;
  return {
    monthly, designMonth, pshDesign, prDesign: PR,
    eM3, wcNeed, wcMinMotor, nNeed, ns: best.ns, np: best.np, n: best.n, wc, area: (wc / 1000) / 0.21,
    vmpStr, vocCold: best.ns * s.voc * 1.12, iStr, dailyM3, hours: dailyM3 / h.q, storage: Math.ceil(s.dailyM3 * 1.5),
    dcDrop, dcSecRec, possible, nsMin, nsMax,
  };
}

/** Vitesse de variateur qui donne exactement le débit demandé (lois de similitude). */
function vfdSpeed(i: Installation, h: Hydro) {
  if (!h.ok || h.q < i.duty.qReq * 1.08) return null;
  const q = i.duty.qReq;
  const hs = staticHead(i) + pressureHead(i) + losses(i, q).total;
  const n = h.n;
  const qe = q / n;
  const s = speedFor(i, q, hs);
  if (!Number.isFinite(s) || s >= 0.99 || s < 0.5) return null;
  const eta = Math.max(0.1, pumpEta(i, qe / s)); // similitude : même rendement au débit q / s
  const pNew = (i.fluid.rho * 9.81 * (q / 3600) * hs) / eta / 1000 / 0.88 / 0.97;
  const pNow = h.pElec;
  // Même volume pompé : comparer l'énergie par m³.
  const saving = 1 - (pNew / q) / (pNow / h.q);
  return { s, hz: 50 * s, pNow, pNew, saving };
}

export function electrical(i: Installation, h: Hydro): { r: ElecResult; issues: Issue[]; goods: string[] } {
  const e = i.elec;
  const issues: Issue[] = [];
  const goods: string[] = [];
  const add = (x: Issue) => issues.push(x);
  const start = effectiveStart(i);
  const inom = motorCurrent(i.pump.motorKw, e);
  const irun = motorCurrent(Math.max(0.05, h.pShaft), e);
  const istart = inom * START_FACTOR[start];
  const len = e.cableLen;
  const dropRun = dropPct(len, inom, e.cableSec, e);
  const dropStart = dropPct(len, istart, e.cableSec, e, 0.35);
  const amp = ampacity(e.cableSec, e.cableMat);
  const maxStart = start === 'direct' ? 15 : 10;
  const secRec = SECTIONS.find((sec) => ampacity(sec, e.cableMat) >= inom * 1.25 && dropPct(len, inom, sec, e) <= 4 && dropPct(len, istart, sec, e, 0.35) <= maxStart) ?? 120;
  const immersed = i.mode === 'immergee';
  const cores = isMono(e) ? '3G' : start === 'etoile' ? '7G' : '4G';
  const cableType = immersed ? 'câble immergeable (H07RN-F / alimentaire pour forage)' : 'câble U1000 R2V (ou H07RN-F en extérieur)';
  const breaker = `Disjoncteur moteur réglé à ${f1(inom, 1)} A (plage ${f1(inom * 0.9, 1)}–${f1(inom * 1.15, 1)} A)`;
  const vfdKw = Math.max(i.pump.motorKw, Math.ceil(i.pump.motorKw * 1.1 * 10) / 10);
  const vfdA = inom * 1.1;
  const filter = start === 'variateur' && len > 50 ? (immersed ? 'filtre sinus' : 'filtre dU/dt') : start === 'variateur' && immersed && len > 30 ? 'filtre dU/dt' : null;
  const genFactor: Record<StartId, number> = { direct: 3, etoile: 2.2, progressif: 2, variateur: 1.5 };
  // Groupe : démarrage de la dernière pompe pendant que les autres tournent
  const genKva = Math.ceil(((i.pump.motorKw * genFactor[start]) + i.pump.motorKw * 1.25 * (h.n - 1)) / 0.8 / 5) * 5;
  const vs = start === 'variateur' && e.supply !== 'solaire' ? vfdSpeed(i, h) : null;
  const ves = vessel(i, h);
  const sol = solar(i, h);

  // ----- Alimentation & démarrage -----
  if (isMono(e) && i.pump.motorKw > 2.2) {
    add({ id: 'mono', sev: 'warning', cat: 'electricite', title: 'Moteur monophasé trop puissant',
      detail: `${f1(i.pump.motorKw)} kW en monophasé : courant nominal ${f1(inom)} A, démarrage autour de ${f0(istart)} A.`,
      consequences: ['Démarrages difficiles, chutes de tension sur le réseau', 'Condensateur et bobinage qui chauffent'], parts: ['moteur', 'coffret'],
      solutions: ['Passer en triphasé 400 V', 'Ou variateur entrée monophasée / sortie triphasée avec moteur triphasé 230 V'] });
  }
  if (start === 'direct' && !isMono(e) && i.pump.motorKw > 7.5) {
    add({ id: 'dol', sev: 'warning', cat: 'electricite', title: 'Démarrage direct d\'un moteur puissant',
      detail: `${f1(i.pump.motorKw)} kW en direct : pointe d'environ ${f0(istart)} A (6 × In) et coup de bélier au démarrage.`,
      consequences: ['Creux de tension, déclenchements', 'Coups de bélier à chaque démarrage', 'Contraintes mécaniques sur l\'accouplement'], parts: ['moteur', 'coffret', 'accouplement', 'clapet'],
      solutions: ['Démarreur progressif ou variateur', immersed ? 'L\'étoile-triangle est possible en forage avec un câble à 6 conducteurs' : 'Ou étoile-triangle'],
      fix: { label: 'Démarreur progressif', apply: (x) => ({ ...x, elec: { ...x.elec, start: 'progressif' } }) } });
  }

  // ----- Câble -----
  if (inom * 1.25 > amp) {
    add({ id: 'cableamp', sev: 'critical', cat: 'electricite', title: 'Câble moteur trop petit pour le courant',
      detail: `${f1(e.cableSec)} mm² ${e.cableMat === 'cu' ? 'cuivre' : 'aluminium'} : ${f0(amp)} A admissibles pour ${f1(inom)} A nominaux (+25 % de marge).`,
      consequences: ['Échauffement du câble', 'Isolant dégradé, court-circuit, incendie'], parts: ['cable', 'coffret', 'moteur'],
      solutions: [`Câble ${cores} ${secRec} mm²`], fix: { label: `Section ${secRec} mm²`, apply: (x) => ({ ...x, elec: { ...x.elec, cableSec: secRec } }) } });
  }
  if (dropRun > 5 || dropStart > maxStart) {
    const crit = dropRun > 8 || dropStart > maxStart + 7;
    add({ id: 'drop', sev: crit ? 'critical' : 'warning', cat: 'electricite', title: 'Chute de tension excessive dans le câble moteur',
      detail: `${f0(len)} m en ${f1(e.cableSec)} mm² : ${f1(dropRun)} % en marche (maxi 5 %), ${f1(dropStart)} % au démarrage (maxi ${maxStart} %).`,
      consequences: ['Le moteur chauffe et perd du couple', 'Démarrage impossible ou très long', 'Durée de vie du bobinage réduite'], parts: ['moteur', 'cable', 'coffret'],
      solutions: [`Passer le câble en ${secRec} mm²`, 'Rapprocher le coffret de la pompe', start === 'direct' ? 'Démarrage progressif ou variateur pour réduire la pointe' : 'Vérifier la tension du réseau'],
      fix: { label: `Section ${secRec} mm²`, apply: (x) => ({ ...x, elec: { ...x.elec, cableSec: secRec } }) } });
  } else if (inom * 1.25 <= amp) goods.push(`Câble moteur correct : ${cores} ${f1(e.cableSec)} mm², chute de tension ${f1(dropRun)} %`);

  // ----- Variateur -----
  if (start === 'variateur' && e.supply !== 'solaire') {
    if (filter) {
      add({ id: 'vfdfilter', sev: immersed ? 'warning' : 'info', cat: 'electricite', title: `Câble long entre variateur et moteur : ${filter} nécessaire`,
        detail: `${f0(len)} m de câble : les fronts de tension du variateur créent des surtensions au moteur.`,
        consequences: ['Claquage de l\'isolant du bobinage', 'Courants de palier'], parts: ['moteur', 'roulements', 'cable'],
        solutions: [`Ajouter un ${filter} en sortie de variateur`, 'Utiliser un moteur compatible variateur'] });
    }
    if (vs) {
      goods.push(`Variateur : régler à ${f0(vs.s * 100)} % (${f1(vs.hz)} Hz) pour le débit demandé, ${f0(vs.saving * 100)} % d'énergie en moins par m³`);
    }
  }
  if (e.supply === 'groupe') {
    if (e.genKva > 0 && e.genKva < genKva) {
      add({ id: 'gen', sev: e.genKva < genKva * 0.7 ? 'critical' : 'warning', cat: 'electricite', title: 'Groupe électrogène sous-dimensionné',
        detail: `${f0(e.genKva)} kVA installés ; il faut environ ${f0(genKva)} kVA pour démarrer ${f1(i.pump.motorKw)} kW en ${START_LABEL[start].toLowerCase()}.`,
        consequences: ['Le groupe cale au démarrage', 'Tension et fréquence instables qui abîment le moteur'], parts: ['moteur', 'coffret'],
        solutions: [`Groupe d'au moins ${f0(genKva)} kVA`, 'Ou démarreur progressif / variateur pour réduire la pointe'] });
    } else if (e.genKva === 0) {
      add({ id: 'gen0', sev: 'info', cat: 'electricite', title: `Groupe électrogène conseillé : ${f0(genKva)} kVA`, detail: `Pour ${f1(i.pump.motorKw)} kW en ${START_LABEL[start].toLowerCase()}.`, consequences: [], parts: [], solutions: [`Groupe de ${f0(genKva)} kVA minimum`] });
    } else goods.push(`Groupe électrogène suffisant (${f0(e.genKva)} kVA)`);
  }

  // ----- Réservoir à vessie -----
  if (ves) {
    if (ves.pOff > ves.pMax - 0.2) {
      add({ id: 'v_off', sev: 'critical', cat: 'securite', title: 'Pression d\'arrêt inatteignable par la pompe',
        detail: `Arrêt réglé à ${f1(ves.pOff)} bar alors que la pompe plafonne à ${f1(ves.pMax)} bar vanne fermée.`,
        consequences: ['La pompe ne s\'arrête jamais', 'Fonctionnement à débit nul : l\'eau chauffe dans la pompe'], parts: ['garniture', 'roulements', 'moteur'],
        solutions: [`Régler l'arrêt à ${f1(ves.pMax - 0.4)} bar maximum`],
        fix: { label: `Arrêt à ${f1(ves.pMax - 0.4)} bar`, apply: (x) => ({ ...x, acc: { ...x.acc, vessie: { ...x.acc.vessie, pOff: Math.round((ves.pMax - 0.4) * 10) / 10 } } }) } });
    }
    if (ves.pOn < ves.pReq) {
      add({ id: 'v_on', sev: 'warning', cat: 'hydraulique', title: 'Pression d\'enclenchement trop basse',
        detail: `La pompe redémarre à ${f1(ves.pOn)} bar alors qu'il faut ${f1(ves.pReq)} bar au refoulement pour servir le point le plus haut.`,
        consequences: ['Pression insuffisante aux étages hauts avant redémarrage'], parts: [],
        solutions: [`Enclenchement à ${f1(Math.ceil((ves.pReq + 0.2) * 10) / 10)} bar`],
        fix: { label: 'Réglages conseillés', apply: (x) => ({ ...x, acc: { ...x.acc, vessie: { ...x.acc.vessie, pOn: undefined, pOff: undefined, pre: undefined } } }) } });
    }
    if (ves.pOff - ves.pOn < 0.6) {
      add({ id: 'v_diff', sev: 'warning', cat: 'securite', title: 'Écart marche / arrêt trop faible', detail: `${f1(ves.pOff - ves.pOn)} bar d'écart (conseillé 1 à 1,5 bar).`,
        consequences: ['Réserve d\'eau minuscule, démarrages incessants'], parts: ['moteur', 'coffret', 'membrane'], solutions: ['Écarter les seuils du pressostat'] });
    }
    if (Math.abs(ves.pre - (ves.pOn - 0.2)) > 0.3) {
      add({ id: 'v_pre', sev: 'warning', cat: 'securite', title: 'Précharge du réservoir mal réglée',
        detail: `Précharge ${f1(ves.pre)} bar ; elle doit être 0,2 bar sous l'enclenchement, soit ${f1(ves.pOn - 0.2)} bar (réglée vide d'eau).`,
        consequences: ves.pre > ves.pOn - 0.2 ? ['Réservoir jamais rempli : volume utile perdu'] : ['Membrane écrasée au fond du réservoir, déchirure'], parts: ['membrane', 'moteur'],
        solutions: [`Regonfler à ${f1(ves.pOn - 0.2)} bar, réservoir vide`],
        fix: { label: `Précharge ${f1(ves.pOn - 0.2)} bar`, apply: (x) => ({ ...x, acc: { ...x.acc, vessie: { ...x.acc.vessie, pre: Math.round((ves.pOn - 0.2) * 10) / 10 } } }) } });
    }
    if (ves.pn < ves.pOff * 1.1) {
      add({ id: 'v_pn', sev: 'critical', cat: 'securite', title: 'Réservoir à vessie de PN insuffisante', detail: `PN${ves.pn} pour un arrêt à ${f1(ves.pOff)} bar.`,
        consequences: ['Éclatement du réservoir'], parts: ['membrane', 'joints'], solutions: [`Réservoir PN${ves.pnRec}`],
        fix: { label: `PN${ves.pnRec}`, apply: (x) => ({ ...x, acc: { ...x.acc, vessie: { ...x.acc.vessie, pn: ves.pnRec } } }) } });
    } else if (ves.pn < ves.pMax && !i.acc.soupape?.on) {
      add({ id: 'v_pn2', sev: 'warning', cat: 'securite', title: 'Réservoir non protégé contre la pression maxi de la pompe',
        detail: `Si le pressostat reste collé, la pompe peut monter à ${f1(ves.pMax)} bar pour un réservoir PN${ves.pn}.`,
        consequences: ['Rupture du réservoir en cas de panne du pressostat'], parts: ['membrane'],
        solutions: [`Réservoir PN${ves.pnRec}`, 'Ou soupape de sûreté tarée sous la PN'],
        fix: { label: 'Ajouter une soupape', apply: (x) => ({ ...x, acc: { ...x.acc, soupape: { on: true, dn: 0, qty: 1 } } }) } });
    }
    if (ves.starts > i.pump.maxStarts) {
      add({ id: 'v_vol', sev: ves.starts > i.pump.maxStarts * 1.5 ? 'critical' : 'warning', cat: 'securite', title: 'Réservoir à vessie trop petit',
        detail: `${f0(ves.vol)} L entre ${f1(ves.pOn)} et ${f1(ves.pOff)} bar ne stockent que ${f0(ves.dv * 1000)} L utiles (${f0(ves.useful * 100)} % du volume) ; la pompe les remplit à ${f1(ves.qFill)} m³/h : jusqu'à ${f0(ves.starts)} démarrages/h pour ${i.pump.maxStarts} admissibles.`,
        consequences: ['Moteur et contacteur usés prématurément', 'Membrane fatiguée'], parts: ['moteur', 'coffret', 'membrane'],
        solutions: ves.volTheo > 1500
          ? [`Le plus raisonnable : variateur + capteur de pression, un réservoir de ${f0(ves.volVfd)} L suffit`, `Sinon : ${planLabel(ves.plan)} (théorique ${f0(ves.volTheo)} L) — encombrant et coûteux`, ...(ves.altDp ? [`Ou ${f0(ves.altDp.vol)} L en réglant l'arrêt à ${f1(ves.altDp.pOff)} bar`] : [])]
          : [`Réservoir de ${planLabel(ves.plan)} (théorique ${f0(ves.volTheo)} L)`, ...(ves.altDp ? [`Ou ${f0(ves.altDp.vol)} L en réglant l'arrêt à ${f1(ves.altDp.pOff)} bar`] : []), ...(ves.altTwo ? [`Ou ${ves.altTwo.n} réservoirs de ${f0(ves.altTwo.vol)} L`] : []), `Ou variateur + capteur de pression : ${f0(ves.volVfd)} L suffisent`],
        fix: ves.volTheo > 1500
          ? { label: 'Variateur + capteur de pression', apply: (x) => ({ ...x, elec: { ...x.elec, start: 'variateur' }, acc: { ...x.acc, variateur: { dn: 0, qty: 1, ...((x.acc.variateur as object | undefined) ?? {}), on: true }, capteur_p: { dn: 0, qty: 1, ...((x.acc.capteur_p as object | undefined) ?? {}), on: true }, vessie: { ...x.acc.vessie, vol: undefined } } }) }
          : { label: planLabel(ves.plan), apply: (x) => ({ ...x, acc: { ...x.acc, vessie: { ...x.acc.vessie, vol: ves.volRec } } }) } });
    } else goods.push(`Réservoir à vessie ${f0(ves.vol)} L PN${ves.pn} : ${f1(ves.pOn)} / ${f1(ves.pOff)} bar, ${start === 'variateur' ? 'régulation par variateur' : `${f0(ves.starts)} démarrages/h maxi`}`);
  }

  // ----- Solaire -----
  if (sol) {
    const s = e.solar;
    if (!sol.possible) {
      add({ id: 'pv_str', sev: 'critical', cat: 'electricite', title: 'Panneaux incompatibles avec le contrôleur',
        detail: `Il faudrait au moins ${sol.nsMin} panneaux en série pour la plage MPPT (${s.vmpptMin} V) mais au plus ${sol.nsMax} pour la tension maxi (${s.vdcMax} V).`,
        consequences: ['Contrôleur qui ne démarre pas ou qui est détruit par surtension'], parts: ['coffret'],
        solutions: ['Choisir des panneaux ou un contrôleur adaptés'] });
    }
    if (s.panels > 0 && sol.dailyM3 < s.dailyM3 * 0.95) {
      add({ id: 'pv_few', sev: sol.dailyM3 < s.dailyM3 * 0.7 ? 'critical' : 'warning', cat: 'electricite', title: 'Champ solaire trop petit',
        detail: `${sol.n} panneaux (${f1(sol.wc / 1000, 2)} kWc) donnent environ ${f1(sol.dailyM3)} m³/j pour ${f1(s.dailyM3)} m³/j demandés.`,
        consequences: ['Besoin journalier non couvert', 'Pompe qui démarre tard et s\'arrête tôt'], parts: [],
        solutions: [`Installer ${sol.nNeed} panneaux de ${s.panelWc} Wc`], fix: { label: `${sol.nNeed} panneaux`, apply: (x) => ({ ...x, elec: { ...x.elec, solar: { ...x.elec.solar, panels: 0 } } }) } });
    } else goods.push(`Champ solaire : ${sol.n} panneaux de ${s.panelWc} Wc (${sol.ns} en série × ${sol.np}) → environ ${f1(sol.dailyM3)} m³/j`);
    if (sol.wc < sol.wcMinMotor) {
      add({ id: 'pv_motor', sev: 'warning', cat: 'electricite', title: 'Puissance crête trop faible pour le moteur', detail: `${f1(sol.wc / 1000, 2)} kWc pour un moteur de ${f1(i.pump.motorKw)} kW (conseillé ≥ 1,3 ×).`,
        consequences: ['La pompe ne démarre qu\'en plein soleil'], parts: ['moteur'], solutions: [`Au moins ${f1(sol.wcMinMotor / 1000, 2)} kWc`] });
    }
    if (sol.dcDrop > 3) {
      add({ id: 'pv_dc', sev: 'warning', cat: 'electricite', title: 'Câble DC trop fin', detail: `${f1(s.dcSec)} mm² sur ${f0(s.dcLen)} m : ${f1(sol.dcDrop)} % de pertes (maxi 2 à 3 %).`,
        consequences: ['Énergie solaire perdue en chaleur'], parts: ['cable'], solutions: [`Câble solaire ${sol.dcSecRec} mm²`],
        fix: { label: `${sol.dcSecRec} mm²`, apply: (x) => ({ ...x, elec: { ...x.elec, solar: { ...x.elec.solar, dcSec: sol.dcSecRec } } }) } });
    }
    if (!i.acc.marche_sec?.on && i.app !== 'relevage') {
      add({ id: 'pv_dry', sev: 'warning', cat: 'securite', title: 'Pompage solaire sans protection manque d\'eau',
        detail: 'Le pompage solaire tourne sans surveillance toute la journée.', consequences: ['Marche à sec en fin de journée'], parts: ['moteur', 'garniture'],
        solutions: ['Sonde ou électrodes de niveau reliées au contrôleur'], fix: { label: 'Ajouter', apply: (x) => ({ ...x, acc: { ...x.acc, marche_sec: { on: true, dn: 0, qty: 1 } } }) } });
    }
  }

  // ----- Arrivée générale du coffret (toutes les pompes en service + auxiliaires) -----
  let feed: ElecResult['feed'] = null;
  if (e.supply !== 'solaire') {
    const flen = e.feedLen ?? 15;
    const iTot = inom * h.n + 2;
    const RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250];
    const rating = RATINGS.find((x) => x >= iTot * 1.15) ?? 250;
    // démarrage de la dernière pompe pendant que les autres tournent
    const iStartTot = istart + inom * (h.n - 1);
    const fsec = SECTIONS.find((sec) => ampacity(sec, 'cu') >= rating && dropPct(flen, iTot, sec, { ...e, cableMat: 'cu' }) <= 3 && dropPct(flen, iStartTot, sec, { ...e, cableMat: 'cu' }, 0.35) <= 8) ?? 120;
    feed = { iTot, rating, sec: fsec, drop: dropPct(flen, iTot, fsec, { ...e, cableMat: 'cu' }), len: flen };
  }
  return { r: { inom, irun, istart, start, dropRun, dropStart, amp, secRec, cores, cableType, breaker, vfdKw, vfdA, filter, genKva, vfdSpeed: vs, vessel: ves, solar: sol, feed }, issues, goods };
}
