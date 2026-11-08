import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SYM_LABEL, type Sym } from '../faults';
import { X } from 'lucide-react';
import { effectiveStart } from '../electrical';
import type { Evaluation } from '../evaluate';
import type { Installation } from '../types';
import { fmt } from '../../ui/util';

/** État électrique en direct (simulation) ; absent = schéma au repos. */
export interface ELive {
  powered: boolean; on: boolean; coilOn: boolean;
  trip: string | null; tripKind: string | null; hum: boolean; amps: number; faults: string[];
  running?: number[]; // pompes en marche (1, 2…)
  isolated?: boolean; // pompe 1 isolée après défaut
  // Mesures pour l'afficheur du coffret
  q?: number; pRef?: number; pAsp?: number; kw?: number; hz?: number; x?: number; kind?: string;
  clock?: string; starts?: number; startsH?: number; vol?: number; kwh?: number; runTot?: number; pv?: number;
  syms?: string[]; floatPit?: 'high' | 'low' | 'tangle'; floatRes?: boolean; noFlow?: boolean; sandy?: boolean; unbalance?: boolean; relayK?: number;
  lowLevel?: boolean;
  bk?: { open: boolean; feed: boolean; level: number; latch?: string | null };
  phys?: { tmCause?: string; relaySet?: number; tm: number; tl: number; relay: number; pPeak?: number; peakAge?: number; burst: 'fuite' | 'rupture' | null; burnt: boolean; sealGone: boolean };
}

type Kind = 'switch' | 'spd' | 'rcd' | 'mcb' | 'mpcb' | 'contactor' | 'timer' | 'soft' | 'vfd' | 'mppt' | 'relay' | 'transfo' | 'fuse' | 'cap' | 'terminal' | 'filter' | 'dcswitch' | 'psu';
type Door = 'lamp-w' | 'lamp-g' | 'lamp-r' | 'lamp-o' | 'sel' | 'estop' | 'amp' | 'hour' | 'keypad';

interface EPart {
  id: string; tag: string; label: string; kind: Kind | Door; poles: number; row: 0 | 1 | 2 | 'door';
  base?: string; pump?: number;
  role: string; setting?: string; panne?: string; faults?: string[];
}

export interface ECfg {
  mono: boolean; solar: boolean; start: ReturnType<typeof effectiveStart>; vfd: boolean;
  dryRelay: boolean; phaseRelay: boolean; pumps: number; standby: number; parts: EPart[];
  auto: 'pressostat' | 'capteur' | 'flotteurs' | 'flotteur_res' | 'soleil' | 'manuel';
}

/** Composition du coffret, déduite de l'installation (alimentation, démarrage, protections, automatisme). */
export function elecConfig(i: Installation, ev: Evaluation): ECfg {
  const e = ev.elec;
  const solar = i.elec.supply === 'solaire';
  const mono = i.elec.supply === 'mono';
  const start = effectiveStart(i);
  const vfd = start === 'variateur' || solar;
  const dryRelay = !!i.acc.marche_sec?.on;
  const phaseRelay = !mono && !solar;
  const pumps = Math.max(1, i.pump.count ?? 1);
  const a = (id: string) => !!i.acc[id]?.on;
  const auto: ECfg['auto'] = solar ? 'soleil' : a('capteur_p') && vfd ? 'capteur' : a('pressostat') ? 'pressostat'
    : a('flotteur_marche') || a('flotteur_arret') ? 'flotteurs' : a('flotteur_res') ? 'flotteur_res' : 'manuel';
  const P: EPart[] = [];
  const In = fmt(e.inom, 1);
  // Rangée 1 : arrivée et protections générales
  if (solar) {
    P.push({ id: 'qdc', tag: 'Q0', label: 'Interrupteur-sectionneur DC', kind: 'dcswitch', poles: 2, row: 0, role: 'Coupe le champ solaire (courant continu) avant toute intervention sur le contrôleur.', setting: `≥ ${fmt((ev.elec.solar?.vocCold ?? 600) * 1.05, 0)} V DC`, panne: 'Contacts brûlés si on coupe en charge avec un appareil non prévu pour le DC.' });
    P.push({ id: 'fdc', tag: 'F0', label: 'Parafoudre DC (type 2)', kind: 'spd', poles: 2, row: 0, role: 'Écoule à la terre les surtensions de foudre induites dans les câbles des panneaux.', setting: 'Uc ≥ tension à vide du champ', panne: 'Témoin rouge : cartouche à remplacer après un coup de foudre.' });
    P.push({ id: 'fus', tag: 'F1', label: 'Fusibles de chaînes (gPV)', kind: 'fuse', poles: 2, row: 0, role: 'Protège chaque chaîne de panneaux contre le courant inverse des autres chaînes.', setting: `${fmt((i.elec.solar.imp || 10) * 1.5, 0)} A gPV` });
  } else {
    P.push({ id: 'q0', tag: 'Q0', label: 'Interrupteur-sectionneur général', kind: 'switch', poles: mono ? 2 : 4, row: 0, role: `Met tout le coffret hors tension pour intervenir en sécurité (cadenassable).${e.feed ? ` Courant total ${fmt(e.feed.iTot, 1)} A${pumps > 1 ? ` (${Math.max(1, pumps - (i.pump.standby ?? 0))} pompe(s) en service + auxiliaires)` : ''}.` : ''}`, setting: e.feed ? `${e.feed.rating} A · câble d'arrivée ${mono ? '3G' : '5G'} ${fmt(e.feed.sec)} mm² sur ${fmt(e.feed.len, 0)} m (protégé en amont par un disjoncteur ${e.feed.rating} A)` : undefined, panne: 'Aucune tension en aval : vérifier qu\'il est fermé et que le réseau est présent.', faults: ['coupure'] });
    P.push({ id: 'f0', tag: 'F0', label: 'Parafoudre (type 2)', kind: 'spd', poles: mono ? 2 : 4, row: 0, setting: `Type 2, In 20 kA / Imax 40 kA, Uc ${mono ? '275' : '440'} V`, role: 'Protège moteur et électronique contre les surtensions d\'orage, fréquentes sur les lignes aériennes.', panne: 'Témoin rouge après un orage : cartouche à remplacer.' });
    P.push({ id: 'q2', tag: 'Q2', label: 'Interrupteur différentiel 30 mA', kind: 'rcd', poles: mono ? 2 : 4, row: 0, role: 'Coupe si du courant fuit vers la terre : protège les personnes (pompe dans l\'eau, câble immergé).', setting: '30 mA, type A (type B avec variateur triphasé)', panne: 'Déclenche au démarrage : défaut d\'isolement du câble ou du moteur (mesurer au mégohmmètre).', faults: ['isolement'] });
  }
  // Rangée 2 : départ moteur
  if (!solar) P.push({ id: 'q1', tag: 'Q1', label: 'Disjoncteur moteur magnéto-thermique', kind: 'mpcb', poles: mono ? 2 : 3, row: 1, role: 'Protège le moteur contre la surcharge (thermique) et le court-circuit (magnétique).', setting: `Réglé à ${In} A (courant nominal du moteur)`, panne: 'Déclenche : surcharge, perte d\'une phase, roulements, tension basse. Mesurer le courant avant de réarmer.', faults: ['perte_phase', 'sous_tension', 'roulements', 'condensateur'] });
  if (start === 'direct' || start === 'etoile' || (start === 'progressif')) {
    P.push({ id: 'km1', tag: 'KM1', label: start === 'etoile' ? 'Contacteur de ligne' : 'Contacteur moteur', kind: 'contactor', poles: mono ? 2 : 3, row: 1, role: 'Interrupteur commandé : sa bobine, alimentée par l\'automatisme (pressostat, flotteurs…), ferme le circuit du moteur.', setting: `AC-3 ≥ ${fmt(e.inom * 1.1, 0)} A`, panne: 'Contacts collés : le moteur ne s\'arrête plus. Bobine grillée : le moteur ne démarre plus.', faults: ['contacteur_colle', 'perte_phase'] });
  }
  if (start === 'etoile') {
    P.push({ id: 'km2', tag: 'KM2', label: 'Contacteur triangle', kind: 'contactor', poles: 3, row: 1, role: 'Couple le moteur en triangle après le démarrage (pleine puissance).', setting: `AC-3 ≥ ${fmt(e.inom * 0.6, 0)} A` });
    P.push({ id: 'km3', tag: 'KM3', label: 'Contacteur étoile', kind: 'contactor', poles: 3, row: 1, role: 'Couple le moteur en étoile au démarrage : courant divisé par 3.', setting: `AC-3 ≥ ${fmt(e.inom * 0.35, 0)} A` });
    P.push({ id: 'kt', tag: 'KT1', label: 'Temporisation étoile-triangle', kind: 'timer', poles: 1, row: 1, role: 'Bascule d\'étoile en triangle quand le moteur a pris sa vitesse.', setting: '3 à 8 s' });
  }
  if (start === 'progressif') P.push({ id: 'u1', tag: 'U1', label: 'Démarreur progressif', kind: 'soft', poles: 3, row: 1, role: 'Monte la tension progressivement : démarrage et arrêt doux, moins de coups de bélier.', setting: 'Rampe 5–10 s, arrêt 10–20 s' });
  if (start === 'variateur' && !solar) {
    P.push({ id: 'u1', tag: 'U1', label: 'Variateur de fréquence', kind: 'vfd', poles: 3, row: 1, role: 'Fait varier la vitesse de la pompe (0–50 Hz) pour tenir la pression ou le débit voulu ; démarrage doux.', setting: `≥ ${fmt(e.vfdKw, 1)} kW / ${fmt(e.vfdA, 1)} A${e.vfdSpeed ? ` · consigne ≈ ${fmt(e.vfdSpeed.hz, 0)} Hz` : ''}`, panne: 'Codes défaut : OV (surtension), OC (surintensité), UV (sous-tension), OH (surchauffe), perte capteur.', faults: ['defaut_variateur', 'capteur_hs'] });
    if (e.filter) P.push({ id: 'flt', tag: 'Z1', label: `Filtre de sortie (${e.filter})`, kind: 'filter', poles: 3, row: 1, role: 'Limite les pics de tension dans le câble long du moteur (protège le bobinage).' });
  }
  if (solar) P.push({ id: 'u1', tag: 'U1', label: 'Contrôleur solaire MPPT', kind: 'mppt', poles: 3, row: 1, role: 'Convertit le courant continu des panneaux en triphasé à fréquence variable et suit le point de puissance maximale.', setting: `≥ ${fmt(i.pump.motorKw, 1)} kW`, panne: 'Pas de démarrage par faible soleil (normal), défaut tension DC, manque d\'eau.', faults: ['defaut_variateur'] });
  if (mono) P.push({ id: 'c1', tag: 'C1', label: 'Condensateur moteur', kind: 'cap', poles: 1, row: 1, role: 'Crée le déphasage nécessaire au démarrage du moteur monophasé.', setting: 'µF et tension de la plaque moteur', panne: 'Gonflé ou sec : le moteur ronfle sans démarrer.', faults: ['condensateur'] });
  // Rangée 3 : commande
  if (!mono && !solar) P.push({ id: 't1', tag: 'T1', label: 'Transformateur de commande', kind: 'transfo', poles: 2, row: 2, role: 'Abaisse 400 V en 24 V pour le circuit de commande (sécurité de l\'opérateur).', setting: '400 / 24 V AC, 63 VA' });
  P.push({ id: 'f3', tag: 'F3', label: 'Fusible / disjoncteur de commande', kind: 'fuse', poles: 1, row: 2, role: 'Protège le circuit de commande (bobines, voyants, relais).', setting: '2 A' });
  if (phaseRelay) P.push({ id: 'ka1', tag: 'KA1', label: 'Relais de contrôle de phases', kind: 'relay', poles: 1, row: 2, role: 'Interdit le démarrage si une phase manque, si l\'ordre des phases est faux ou si la tension est hors plage.', setting: '±10 % · ordre L1-L2-L3', panne: 'LED rouge : phase absente ou inversée.', faults: ['perte_phase', 'rotation', 'sous_tension'] });
  if (dryRelay) P.push({ id: 'ka2', tag: 'KA2', label: 'Relais manque d\'eau (électrodes)', kind: 'relay', poles: 1, row: 2, role: 'Arrête la pompe quand les électrodes ne sont plus dans l\'eau (marche à sec).', setting: 'Sensibilité 5–50 kΩ · tempo 5 s', panne: 'Déclenché : niveau trop bas, pompe désamorcée, électrode encrassée.', faults: ['source_tarie', 'clapet_pied_fuit'] });
  if (pumps > 1) P.push({ id: 'ka3', tag: 'KA3', label: i.pump.alternate ? 'Relais d\'alternance' : 'Relais de cascade', kind: 'relay', poles: 1, row: 2, role: i.pump.alternate ? 'Fait démarrer les pompes à tour de rôle (usure égale) et bascule sur la pompe de secours en cas de défaut.' : 'Démarre la pompe suivante si la demande augmente.' });
  if (vfd && !solar) P.push({ id: 'psu', tag: 'G1', label: 'Alimentation capteur 24 V DC', kind: 'psu', poles: 1, row: 2, setting: '24 V DC, 1 A', role: 'Alimente le capteur de pression 4-20 mA (souvent fournie par le variateur).' });
  P.push({ id: 'x1', tag: 'X1', label: 'Bornier de raccordement', kind: 'terminal', poles: mono ? 4 : 6, row: 2, setting: 'bornes à ressort + bornes de terre PE', role: 'Raccorde câble moteur, flotteurs, pressostat, électrodes et terre (PE vert-jaune).' });
  // Porte
  P.push({ id: 'p1', tag: 'P1', label: 'Ampèremètre', kind: 'amp', poles: 1, row: 'door', role: 'Affiche le courant du moteur : premier indicateur de panne (surcharge, marche à sec).', setting: `Normal ≈ ${fmt(e.irun, 1)} A` });
  P.push({ id: 'h1', tag: 'H1', label: 'Voyant sous tension (blanc)', kind: 'lamp-w', poles: 1, row: 'door', setting: 'Ø 22 mm, LED', role: 'Allumé quand le coffret est alimenté.', faults: ['coupure'] });
  P.push({ id: 'h2', tag: 'H2', label: 'Voyant marche (vert)', kind: 'lamp-g', poles: 1, row: 'door', setting: 'Ø 22 mm, LED', role: 'Allumé quand le contacteur / variateur commande le moteur.' });
  P.push({ id: 'h3', tag: 'H3', label: 'Voyant défaut (rouge)', kind: 'lamp-r', poles: 1, row: 'door', setting: 'Ø 22 mm, LED', role: 'Allumé si une protection a déclenché (disjoncteur, manque d\'eau, variateur).' });
  if (auto === 'flotteurs') P.push({ id: 'h4', tag: 'H4', label: 'Voyant alarme niveau haut', kind: 'lamp-o', poles: 1, row: 'door', setting: 'Ø 22 mm, LED orange', role: 'Allumé si le flotteur d\'alarme bascule (risque de débordement).' });
  P.push({ id: 's1', tag: 'S1', label: 'Sélecteur Manu – 0 – Auto', kind: 'sel', poles: 1, row: 'door', setting: 'Ø 22 mm, 3 positions fixes', role: 'Auto : l\'automatisme commande la pompe. Manu : marche forcée pour essai (sans les flotteurs / pressostat, mais avec les protections).' });
  P.push({ id: 's0', tag: 'S0', label: 'Arrêt d\'urgence', kind: 'estop', poles: 1, row: 'door', setting: 'coup-de-poing Ø 40 mm, contact NF', role: 'Coupe la commande immédiatement ; à déverrouiller en tournant.' });
  P.push({ id: 'p2', tag: 'P2', label: 'Compteur horaire', kind: 'hour', poles: 1, row: 'door', setting: 'encastrable, 24 V', role: 'Compte les heures de marche pour planifier l\'entretien (roulements, garniture).' });
  if (vfd) P.push({ id: 'kp', tag: 'U1', label: solar ? 'Afficheur du contrôleur' : 'Clavier déporté du variateur', kind: 'keypad', poles: 1, row: 'door', role: 'Affiche fréquence, courant, pression, codes défaut ; réglage de la consigne.' });
  // Plusieurs pompes : un départ moteur complet par pompe (disjoncteur, contacteur / variateur…) et un voyant de marche chacune
  const standby = Math.max(0, Math.min(pumps - 1, i.pump.standby ?? 0));
  const PER = new Set(['q1', 'km1', 'km2', 'km3', 'kt', 'flt', 'c1', 'h2', 'p1', ...(solar ? [] : ['u1'])]);
  let parts = P;
  if (pumps > 1) {
    parts = [];
    const shared = P.filter((p) => !PER.has(p.id));
    const per = P.filter((p) => PER.has(p.id));
    for (const p of shared.filter((q) => q.row === 0)) parts.push(p);
    for (let k = 1; k <= pumps; k++) {
      const sb = k > pumps - standby;
      for (const p of per.filter((q) => q.row !== 'door')) parts.push({ ...p, id: `${p.id}.${k}`, base: p.id, pump: k, tag: `${p.tag}.${k}`, label: `${p.label} — pompe ${k}${sb ? ' (secours)' : ''}` });
    }
    for (const p of shared.filter((q) => q.row !== 0)) parts.push(p);
    for (let k = 1; k <= pumps; k++) {
      for (const p of per.filter((q) => q.row === 'door')) parts.push({ ...p, id: `${p.id}.${k}`, base: p.id, pump: k, tag: `${p.tag}.${k}`, label: `${p.label} — pompe ${k}` });
    }
  }
  return { mono, solar, start, vfd, dryRelay, phaseRelay, pumps, standby, parts, auto };
}

/** État de chaque composant pour la simulation. */
function partState(p0: EPart, L: ELive | undefined): 'off' | 'on' | 'trip' | 'fault' {
  if (!L) return 'off';
  const tk = L.tripKind;
  // Départ d'une pompe donnée : la panne touche la pompe en service, les autres suivent leur propre marche
  const run = L.running ?? (L.on ? [1] : []);
  const faulty = L.isolated ? 1 : run[0] ?? 1;
  if (p0.pump != null && p0.pump !== faulty) {
    const b = p0.base ?? p0.id;
    if (!L.powered) return 'off';
    if (['km1', 'km2', 'km3', 'u1', 'kt', 'flt', 'c1', 'h2'].includes(b)) return run.includes(p0.pump) ? 'on' : 'off';
    return 'on';
  }
  const p = { ...p0, id: p0.base ?? p0.id };
  if (p.id === 'q1' && tk === 'decl_thermique') return 'trip';
  if (p.id === 'q2' && tk === 'decl_diff') return 'trip';
  if (p.id === 'ka2' && (tk === 'decl_manque_eau' || tk === 'decl_sous_charge' || L.lowLevel)) return 'trip';
  if ((p.id === 'u1' || p.id === 'kp') && tk === 'decl_variateur') return 'trip';
  if (p.id === 'ka1' && (L.faults.includes('perte_phase') || L.faults.includes('rotation'))) return 'fault';
  if (p.id === 'km1' && L.faults.includes('contacteur_colle')) return 'fault';
  if (p.id === 'c1' && L.faults.includes('condensateur')) return 'fault';
  if (!L.powered && !p.id.startsWith('q') && p.id !== 'f0') return 'off';
  if (p.id === 'q0' || p.id === 'qdc') return L.powered ? 'on' : 'off';
  if (['km1', 'km2', 'km3', 'u1', 'kt', 'flt', 'c1', 'h2', 'kp'].includes(p.id)) return L.on || (p.id === 'km1' && L.faults.includes('contacteur_colle') && L.on) ? 'on' : 'off';
  if (p.id === 'h1') return L.powered ? 'on' : 'off';
  if (p.id === 'h3') return L.trip || L.isolated || (L.syms ?? []).some((y) => CRIT_SYMS.has(y)) ? 'trip' : 'off';
  return L.powered ? 'on' : 'off';
}

/* =============================== Coffret ================================= */
const MOD = 20; // largeur d'un pôle (module 18 mm)

function Module({ p, x, y, st, sel, hl, onPick, hz }: { p: EPart; x: number; y: number; st: string; sel: boolean; hl?: boolean; onPick: (id: string) => void; hz?: number }) {
  const w = Math.max(1, p.poles) * MOD;
  const big = p.kind === 'vfd' || p.kind === 'mppt' || p.kind === 'soft';
  const h = big ? 112 : p.kind === 'transfo' ? 64 : 80;
  const yy = big ? y - 16 : y;
  const W = big ? Math.max(w, 86) : p.kind === 'transfo' ? 62 : p.kind === 'cap' ? 30 : w;
  let body: ReactNode;
  const lever = (lx: number, ly: number) => <rect x={lx - 5} y={st === 'trip' ? ly + 8 : ly - 8} width={10} height={14} rx={2} className={`m-lever ${st}`} />;
  switch (p.kind) {
    case 'switch': case 'dcswitch':
      body = <><circle cx={x + W / 2} cy={yy + 40} r={15} className="m-knob" /><rect x={x + W / 2 - 3} y={yy + 24} width={6} height={32} rx={2} className={`m-knob-bar ${st}`} transform={st === 'on' ? '' : `rotate(-90 ${x + W / 2} ${yy + 40})`} /></>; break;
    case 'rcd': case 'mcb':
      body = <>{lever(x + W / 2, yy + 34)}<rect x={x + W - 14} y={yy + 58} width={10} height={8} rx={2} className="m-test" /><text x={x + 5} y={yy + 66} className="m-mini">T</text></>; break;
    case 'mpcb':
      body = <><circle cx={x + W / 2} cy={yy + 26} r={9} className="m-dial" /><path d={`M${x + W / 2} ${yy + 26} l5 -5`} className="m-needle" />{lever(x + W / 2, yy + 52)}</>; break;
    case 'contactor':
      body = <><rect x={x + 6} y={yy + 24} width={W - 12} height={26} rx={3} className={`m-window ${st}`} /><text x={x + W / 2} y={yy + 41} textAnchor="middle" className="m-mini">{st === 'on' || st === 'fault' ? 'I' : 'O'}</text></>; break;
    case 'relay': case 'timer': case 'psu':
      body = <><circle cx={x + 8} cy={yy + 18} r={3.5} className={`m-led ${st === 'trip' || st === 'fault' ? 'red' : st === 'on' ? 'green' : ''}`} /><circle cx={x + W / 2} cy={yy + 44} r={7} className="m-dial" /></>; break;
    case 'fuse':
      body = <><rect x={x + 5} y={yy + 22} width={W - 10} height={34} rx={3} className="m-fuse" /></>; break;
    case 'spd':
      body = <>{Array.from({ length: p.poles }).map((_, k) => <rect key={k} x={x + k * MOD + 4} y={yy + 24} width={MOD - 8} height={30} rx={2} className="m-cart" />)}<rect x={x + 4} y={yy + 58} width={8} height={6} className="m-ok" /></>; break;
    case 'terminal':
      body = <>{Array.from({ length: p.poles }).map((_, k) => <rect key={k} x={x + k * MOD + 3} y={yy + 14} width={MOD - 6} height={52} rx={2} className={k === p.poles - 1 ? 'm-pe' : 'm-term'} />)}</>; break;
    case 'transfo':
      body = <><rect x={x + 6} y={yy + 10} width={W - 12} height={44} rx={3} className="m-coil" /><path d={`M${x + 16} ${yy + 16} v32 M${x + W - 16} ${yy + 16} v32`} className="m-core" /></>; break;
    case 'cap':
      body = <rect x={x + 3} y={yy + 6} width={W - 6} height={68} rx={12} className="m-cap" />; break;
    case 'filter':
      body = <><rect x={x + 4} y={yy + 16} width={W - 8} height={46} rx={3} className="m-coil" /></>; break;
    case 'vfd': case 'mppt': case 'soft':
      body = <><rect x={x + 10} y={yy + 14} width={W - 20} height={26} rx={3} className={`m-screen ${st}`} /><text x={x + W / 2} y={yy + 32} textAnchor="middle" className="m-scrtxt">{st === 'trip' ? (p.kind === 'soft' ? 'ERR' : 'OV') : st === 'on' ? (p.kind === 'soft' ? 'BYP' : (hz ?? 50).toFixed(1)) : 'rdy'}</text><rect x={x + 14} y={yy + 50} width={W - 28} height={34} rx={3} className="m-vent" /></>; break;
    default: body = null;
  }
  return (
    <g className={`mod ${sel ? 'sel' : ''} ${hl ? 'hl' : ''} ${st}`} onClick={(e) => { e.stopPropagation(); onPick(p.id); }}>
      <rect x={x} y={yy} width={W} height={h} rx={4} className={`m-body ${p.kind === 'vfd' || p.kind === 'mppt' ? 'dark' : ''}`} />
      {body}
      <text x={x + W / 2} y={yy + h + 13} textAnchor="middle" className="m-tag">{p.tag}</text>
      {st === 'trip' && <text x={x + W / 2} y={yy - 4} textAnchor="middle" className="m-tripTxt">DÉCLENCHÉ</text>}
      {st === 'fault' && <text x={x + W / 2} y={yy - 4} textAnchor="middle" className="m-tripTxt">DÉFAUT</text>}
      <title>{p.tag} — {p.label}</title>
    </g>
  );
}

function DoorItem({ p, x, y, st, L, sel, onPick, inom }: { p: EPart; x: number; y: number; st: string; L?: ELive; sel: boolean; onPick: (id: string) => void; inom?: number }) {
  let body: ReactNode;
  const lamp = (cls: string, lit: boolean) => <><circle cx={x} cy={y} r={13} className="d-bezel" /><circle cx={x} cy={y} r={9} className={`d-lamp ${cls} ${lit ? 'lit' : ''}`} /></>;
  switch (p.kind) {
    case 'lamp-w': body = lamp('w', st === 'on'); break;
    case 'lamp-g': body = lamp('g', st === 'on'); break;
    case 'lamp-r': body = lamp('r', st === 'trip'); break;
    case 'lamp-o': body = lamp('o', false); break;
    case 'sel': body = <><circle cx={x} cy={y} r={15} className="d-bezel" /><rect x={x - 3} y={y - 13} width={6} height={26} rx={3} className="d-handle" transform={`rotate(40 ${x} ${y})`} /><text x={x - 22} y={y - 16} className="d-mini">M</text><text x={x - 3} y={y - 19} className="d-mini">0</text><text x={x + 15} y={y - 16} className="d-mini">A</text></>; break;
    case 'estop': body = <><rect x={x - 16} y={y - 16} width={32} height={32} rx={4} className="d-yellow" /><circle cx={x} cy={y} r={12} className="d-red" /></>; break;
    case 'amp': {
      const a = L && (p.pump == null || (L.running ?? []).includes(p.pump)) ? L.amps : 0;
      const ang = -60 + 120 * Math.min(1, a / Math.max(0.1, (inom ?? 10) * 1.5));
      const over = a > (inom ?? 1e9) * 1.05;
      body = <><rect x={x - 26} y={y - 22} width={52} height={44} rx={3} className="d-meter" /><path d={`M${x - 18} ${y + 8} A 20 20 0 0 1 ${x + 18} ${y + 8}`} className="d-scale" /><path d={`M${x + 9.5} ${y - 6.5} A 20 20 0 0 1 ${x + 18} ${y + 8}`} className="d-scale red" /><path d={`M${x} ${y + 10} l0 -18`} className="d-needle" style={{ transform: `rotate(${ang}deg)`, transformOrigin: `${x}px ${y + 10}px`, transition: 'transform .6s' }} /><text x={x} y={y + 19} textAnchor="middle" className={`d-mini ${over ? 'over' : ''}`}>{L ? `${fmt(a, 1)} A` : 'A'}</text></>; break;
    }
    case 'hour': body = <><rect x={x - 24} y={y - 12} width={48} height={24} rx={3} className="d-meter" /><text x={x} y={y + 5} textAnchor="middle" className="d-digits">{String(Math.floor((L?.runTot ?? 0) / 3600 * 10)).padStart(5, '0')}</text></>; break;
    case 'keypad': body = <><rect x={x - 24} y={y - 28} width={48} height={56} rx={4} className="d-keypad" /><rect x={x - 18} y={y - 22} width={36} height={16} rx={2} className={`m-screen ${st}`} /><text x={x} y={y - 10} textAnchor="middle" className="m-scrtxt">{st === 'trip' ? 'OV' : st === 'on' ? `${fmt(L?.hz ?? 50, 1)}Hz` : 'rdy'}</text></>; break;
    default: body = null;
  }
  return (
    <g className={`door-it ${sel ? 'sel' : ''}`} onClick={(e) => { e.stopPropagation(); onPick(p.id); }}>
      <rect x={x - 30} y={y - 30} width={60} height={64} className="hit" />
      {body}
      <text x={x} y={y + (p.kind === 'keypad' ? 42 : 34)} textAnchor="middle" className="m-tag">{p.tag}</text>
      <title>{p.tag} — {p.label}</title>
    </g>
  );
}


/* ===================== Afficheur de supervision (temps réel) ===================== */
const CRIT_SYMS = new Set(['decl_thermique', 'decl_diff', 'decl_manque_eau', 'decl_sous_charge', 'decl_variateur', 'pas_de_tension', 'ronfle', 'marche_a_sec', 'debordement', 'ne_demarre_pas', 'ne_s_arrete_pas']);
interface Alarm { id: string; text: string; crit: boolean }
interface AlarmRec extends Alarm { since: string; ack: boolean; active: boolean; end?: string }

/** Alarmes actives déduites des mesures et des protections */
function activeAlarms(i: Installation, ev: Evaluation, L: ELive): Alarm[] {
  const out: Alarm[] = [];
  const add = (id: string, text: string, crit = false) => { if (!out.some((a) => a.id === id)) out.push({ id, text, crit }); };
  if (!L.powered) add('pas_de_tension', 'Absence de tension réseau', true);
  if (L.trip) add('trip', L.trip, true);
  if (L.isolated) add('isolated', 'Pompe 1 en défaut, isolée : la pompe de secours a pris le relais', true);
  for (const y of L.syms ?? []) if (!(L.trip && y.startsWith('decl_')) && !(y === 'courant_haut' && L.on && L.amps > ev.elec.inom * 1.05) && !(y === 'moteur_chaud' && L.phys)) add(y, SYM_LABEL[y as Sym] ?? y, CRIT_SYMS.has(y));
  const e = ev.elec;
  if (L.on && L.amps > e.inom * 1.05) add('i_high', `Surintensité : ${fmt(L.amps, 1)} A pour ${fmt(e.inom, 1)} A nominal`, L.amps > e.inom * 1.2);
  if (L.on && L.noFlow) add('debit_nul', 'Pompe en marche sans débit', true);
  if ((L.startsH ?? 0) > i.pump.maxStarts) add('cycles_courts', `Démarrages trop fréquents : ${L.startsH} dans l'heure (maxi ${i.pump.maxStarts})`);
  if (L.on && e.dropRun > 5) add('drop', `Chute de tension en marche : ${fmt(e.dropRun, 1)} % (maxi 5 %)`);
  if (L.lowLevel) add('lowlevel', 'Manque d\'eau dans le forage : électrodes hors de l\'eau, la pompe attend que le niveau remonte');
  if (L.bk?.latch) add('bk_latch', `Défaut pompe (${L.bk.latch}) : électrovanne de secours maintenue ouverte, réarmer après réparation`, true);
  if (L.bk && L.bk.level <= 0.002) add('bk_empty', 'Réservoir vide : plus d\'eau à la maison', true);
  if (L.bk?.feed) add('bk_feed', `Maison alimentée par le réservoir de secours (${Math.round(L.bk.level * 100)} %)`, L.bk.level < 0.2);
  const P = L.phys;
  if (P) {
    if (P.burnt) add('burnt', 'Moteur grillé : bobinage à remplacer ou rebobiner', true);
    else if (P.tm > 155) add('tm', `Température moteur ${fmt(P.tm, 0)} °C : au-delà de la classe F${P.tmCause ? ` — ${P.tmCause}` : ''}`, true);
    else if (P.tm > 140) add('tm', `Moteur très chaud : ${fmt(P.tm, 0)} °C${P.tmCause ? ` — ${P.tmCause}` : ''}`, true);
    else if (P.tm > 120) add('tm', `Moteur chaud : ${fmt(P.tm, 0)} °C${P.tmCause ? ` — ${P.tmCause}` : ''}`);
    if (!P.burnt && P.relay > 1.1 && L.on) add('relay', `Relais thermique à ${fmt((P.relay / 1.44) * 100, 0)} % du seuil de déclenchement`);
    if (P.sealGone) add('seal', 'Garniture mécanique détruite (vaporisation) : fuite à l\'arbre', true);
    else if (P.tl > 60) add('tl', `Liquide à ${fmt(P.tl, 0)} °C dans la pompe (débit nul)`, P.tl > 90);
    if (P.burst) add('burst', P.burst === 'rupture' ? 'Conduite de refoulement rompue' : 'Fuite sur un raccord du refoulement', true);
    if (P.pPeak != null && (P.peakAge ?? 1e9) < 3600 && P.pPeak > i.ref.pn) add('peak', `Pointe de pression ${fmt(P.pPeak, 1)} bar > PN${i.ref.pn}`, true);
  }
  return out;
}

function Tile({ l, v, u, sub, lvl, bar }: { l: string; v: string; u?: string; sub?: string; lvl?: 'ok' | 'warn' | 'crit'; bar?: number }) {
  return (
    <div className={`hmi-tile ${lvl ?? ''}`}>
      <small>{l}</small>
      <b>{v}{u && <em>{u}</em>}</b>
      {bar != null && <i className="hmi-bar"><span style={{ width: `${Math.max(0, Math.min(100, bar * 100))}%` }} /></i>}
      {sub && <span>{sub}</span>}
    </div>
  );
}

/** Afficheur de la façade : état, mesures utiles et alarmes, mis à jour en temps réel pendant la simulation. */
export function CabinetHmi({ i, ev, cfg, L }: { i: Installation; ev: Evaluation; cfg: ECfg; L?: ELive }) {
  const e = ev.elec;
  const hist = useRef<Map<string, AlarmRec>>(new Map());
  const [, force] = useState(0);
  const act = L ? activeAlarms(i, ev, L) : [];
  const key = act.map((a) => a.id).join('|');
  useEffect(() => {
    if (!L) { hist.current.clear(); return; }
    const m = hist.current;
    for (const a of act) {
      const r = m.get(a.id);
      if (!r || !r.active) m.set(a.id, { ...a, since: L.clock ?? '', ack: false, active: true });
      else r.text = a.text;
    }
    for (const r of m.values()) if (r.active && !act.some((a) => a.id === r.id)) { r.active = false; r.end = L.clock ?? ''; }
    // On garde les 10 dernières
    const all = [...m.values()];
    if (all.length > 10) for (const r of all.filter((x) => !x.active).slice(0, all.length - 10)) m.delete(r.id);
    force((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, !!L]);
  const recs = [...hist.current.values()].sort((a, b) => Number(b.active) - Number(a.active));
  const unack = recs.filter((r) => r.active && !r.ack);
  const ack = (id?: string) => { for (const r of hist.current.values()) if (!id || r.id === id) r.ack = true; force((n) => n + 1); };
  const clear = () => { for (const r of [...hist.current.values()]) if (!r.active) hist.current.delete(r.id); force((n) => n + 1); };

  const nP = Math.max(1, i.pump.count ?? 1);
  const run = L?.running ?? [];
  const U = i.elec.supply === 'solaire' ? null : i.elec.voltage;
  const autoTxt = { pressostat: 'pressostat', capteur: 'capteur de pression + variateur', flotteurs: 'flotteurs de la fosse', flotteur_res: 'flotteur du réservoir', soleil: 'solaire (MPPT)', manuel: 'commande manuelle' }[cfg.auto];

  if (!L) {
    return (
      <div className="hmi idle">
        <div className="hmi-head"><span className="hmi-state off">AU REPOS</span><span>Mode AUTO · {autoTxt}</span></div>
        <div className="hmi-grid">
          {U != null && <Tile l="Tension" v={fmt(U, 0)} u=" V" sub={i.elec.supply === 'mono' ? 'monophasé' : 'triphasé'} />}
          <Tile l="Courant nominal" v={fmt(e.inom, 1)} u=" A" sub={`démarrage ≈ ${fmt(e.istart, 0)} A`} />
          <Tile l="Puissance moteur" v={fmt(i.pump.motorKw, 1)} u=" kW" sub={`${nP > 1 ? `${nP} pompes · ` : ''}cos φ ${fmt(i.elec.cosphi, 2)}`} />
          <Tile l="Chute de tension" v={fmt(e.dropRun, 1)} u=" %" sub={`au démarrage ${fmt(e.dropStart, 1)} %`} lvl={e.dropRun > 5 ? 'warn' : 'ok'} />
          {e.vessel && <Tile l="Pressostat" v={`${fmt(e.vessel.pOn, 1)} / ${fmt(e.vessel.pOff, 1)}`} u=" bar" sub="marche / arrêt" />}
        </div>
        <p className="hmi-note">Lancez la simulation (page Simulation, onglet Coffret) : l'afficheur montre alors en temps réel tension, courant, pression, débit, compteurs et alarmes.</p>
      </div>
    );
  }

  const tensionBasse = (L.syms ?? []).includes('tension_basse');
  const uNow = U == null ? null : !L.powered ? 0 : U * (1 - (L.on ? e.dropRun : 0) / 100) * (tensionBasse ? 0.88 : 1);
  const state = !L.powered ? { t: 'HORS TENSION', c: 'off' } : L.trip ? { t: 'DÉFAUT', c: 'crit' } : L.on ? { t: run.length > 1 ? `MARCHE · ${run.length} POMPES` : 'MARCHE', c: 'on' } : { t: 'ARRÊT · ATTENTE', c: 'wait' };
  // Ordre de marche donné par l'automatisme
  let cmd = '';
  const x = L.x ?? 0;
  if (cfg.auto === 'pressostat' && e.vessel) cmd = `Pression ${fmt(x, 2)} bar · marche ≤ ${fmt(e.vessel.pOn, 1)} · arrêt ≥ ${fmt(e.vessel.pOff, 1)} bar`;
  else if (cfg.auto === 'capteur') cmd = `Pression mesurée ${fmt(x, 2)} bar · consigne ${fmt((e.vessel?.pOn ?? 3) + 0.5, 1)} bar`;
  else if (cfg.auto === 'flotteurs') cmd = `Niveau ${fmt(x, 2)} m · ${L.floatPit === 'high' ? 'flotteur de marche basculé' : L.floatPit === 'low' ? 'flotteur d\'arrêt retombé' : L.on ? 'vidange en cours' : 'remplissage de la fosse'}`;
  else if (cfg.auto === 'flotteur_res') cmd = `Réservoir ${fmt(x, 1)} m³ · ${L.on ? 'remplissage' : 'plein : flotteur fermé'}`;
  else if (cfg.auto === 'soleil') cmd = `Puissance solaire ${fmt(L.pv ?? 0, 2)} kW · ${fmt(L.hz ?? 0, 1)} Hz`;
  else cmd = L.on ? 'Marche manuelle' : 'Arrêt';
  const iMax = e.inom * 1.3;
  const iLvl = L.amps > e.inom * 1.2 ? 'crit' : L.amps > e.inom * 1.05 ? 'warn' : 'ok';
  const pMax = ev.hydro.pMaxBar;
  return (
    <div className={`hmi ${unack.some((r) => r.crit) ? 'alarm' : ''}`}>
      <div className="hmi-head">
        <span className={`hmi-state ${state.c}`}>{state.t}</span>
        <span>AUTO · {autoTxt}</span>
        <span className="hmi-clock">{L.clock}</span>
      </div>
      <p className="hmi-cmd">{cmd}</p>
      <div className="hmi-grid">
        {uNow != null && <Tile l={i.elec.supply === 'mono' ? 'Tension (L-N)' : 'Tension (entre phases)'} v={fmt(uNow, 0)} u=" V" lvl={!L.powered ? 'crit' : uNow < U! * 0.92 ? 'warn' : 'ok'} sub={`${fmt(U!, 0)} V nominal`} />}
        {Array.from({ length: nP }, (_, k) => k + 1).map((p) => {
          const a = run.includes(p) ? L.amps : 0;
          const ph = L.unbalance && a ? ` · L1 ${fmt(a * 1.12, 1)} / L2 ${fmt(a * 0.97, 1)} / L3 ${fmt(a * 0.86, 1)} A` : '';
          return <Tile key={p} l={nP > 1 ? `Courant pompe ${p}` : 'Courant moteur'} v={fmt(a, 1)} u=" A" bar={a / iMax} lvl={a ? (L.unbalance ? 'warn' : iLvl) : undefined} sub={`In ${fmt(e.inom, 1)} A · Q1 réglé ${fmt(L.phys?.relaySet ?? e.inom * (L.relayK ?? 1), 1)} A${ph}${nP > 1 ? (run.includes(p) ? ' · en marche' : L.isolated && p === 1 ? ' · isolée' : ' · à l\'arrêt') : ''}`} />;
        })}
        <Tile l="Puissance absorbée" v={fmt(L.kw ?? 0, 2)} u=" kW" sub={L.on ? `cos φ ${fmt(i.elec.cosphi, 2)}` : 'moteur arrêté'} />
        {L.hz != null && <Tile l="Fréquence" v={fmt(L.on ? L.hz : 0, 1)} u=" Hz" bar={L.on ? L.hz / 50 : 0} sub="sortie variateur" />}
        {(L.kind === 'vessel' || L.kind === 'vfd') ? <Tile l={cfg.auto === 'capteur' ? 'Pression (capteur)' : 'Pression (pressostat)'} v={fmt(x, 2)} u=" bar" bar={x / Math.max(1, (e.vessel?.pOff ?? pMax) * 1.15)} lvl={(L.syms ?? []).includes('pression_haute') || (L.syms ?? []).includes('pression_basse') ? 'warn' : undefined} sub={cfg.auto === 'capteur' ? `consigne ${fmt((e.vessel?.pOn ?? 3) + 0.5, 1)} bar` : e.vessel ? `marche ${fmt(e.vessel.pOn, 1)} / arrêt ${fmt(e.vessel.pOff, 1)} bar` : ''} /> : <Tile l="Pression refoulement" v={fmt(L.pRef ?? 0, 2)} u=" bar" bar={(L.pRef ?? 0) / Math.max(1, pMax)} lvl={(L.syms ?? []).includes('pression_haute') ? 'warn' : (L.syms ?? []).includes('pression_basse') ? 'warn' : undefined} sub={`maxi vanne fermée ${fmt(pMax, 1)} bar`} />}
        {i.mode !== 'immergee' && <Tile l="Aspiration" v={fmt(L.pAsp ?? 0, 2)} u=" bar" lvl={(L.syms ?? []).includes('depression_forte') ? 'warn' : undefined} sub="relative (négatif = dépression)" />}
        {L.kind === 'pit' && <Tile l="Niveau fosse" v={fmt(x, 2)} u=" m" lvl={(L.syms ?? []).includes('debordement') ? 'crit' : undefined} sub={L.floatPit === 'high' ? 'flotteur haut basculé' : L.floatPit === 'low' ? 'flotteur bas' : 'entre les flotteurs'} />}
        {L.kind === 'tank' && <Tile l="Réservoir" v={fmt(x, 1)} u=" m³" sub={L.floatRes ? 'flotteur : plein' : 'flotteur : demande d\'eau'} />}
        <Tile l="Débit" v={fmt(L.q ?? 0, 1)} u=" m³/h" bar={(L.q ?? 0) / Math.max(0.1, i.duty.qReq * 1.3)} lvl={L.on && L.noFlow ? 'crit' : undefined} sub={`besoin ${fmt(i.duty.qReq, 1)} m³/h`} />
        {L.phys && <Tile l="Température moteur" v={fmt(L.phys.tm, 0)} u=" °C" bar={L.phys.tm / 180} lvl={L.phys.burnt || L.phys.tm > 140 ? 'crit' : L.phys.tm > 120 ? 'warn' : 'ok'} sub={L.phys.burnt ? 'GRILLÉ' : `classe F : 155 °C · relais ${fmt(Math.min(100, (L.phys.relay / 1.44) * 100), 0)} %`} />}
        {L.phys && (L.phys.tl > i.fluid.temp + 4 || L.phys.sealGone) && <Tile l="Liquide dans la pompe" v={fmt(L.phys.tl, 0)} u=" °C" bar={L.phys.tl / 160} lvl={L.phys.sealGone ? 'crit' : L.phys.tl > 60 ? 'warn' : undefined} sub={L.phys.sealGone ? 'garniture détruite' : 'débit nul'} />}
        {L.phys?.pPeak != null && <Tile l="Pointe de pression" v={fmt(L.phys.pPeak, 1)} u=" bar" bar={L.phys.pPeak / (i.ref.pn * 1.5)} lvl={L.phys.pPeak > i.ref.pn ? 'crit' : L.phys.pPeak > i.ref.pn * 0.8 ? 'warn' : 'ok'} sub={`conduite PN${i.ref.pn}${L.phys.burst ? ` · ${L.phys.burst === 'rupture' ? 'ROMPUE' : 'fuite'}` : ''}`} />}
        <Tile l="Démarrages" v={String(L.startsH ?? 0)} u=" /h" lvl={(L.startsH ?? 0) > i.pump.maxStarts ? 'warn' : undefined} sub={`total ${L.starts ?? 0} · maxi ${i.pump.maxStarts}/h`} />
        <Tile l="Heures de marche" v={fmt((L.runTot ?? 0) / 3600, 1)} u=" h" sub={`${fmt(L.vol ?? 0, 1)} m³ pompés`} />
        <Tile l="Énergie" v={fmt(L.kwh ?? 0, 1)} u=" kWh" sub={(L.vol ?? 0) > 0.01 ? `${fmt(((L.kwh ?? 0) / (L.vol ?? 1)) * 1000, 0)} Wh/m³` : '—'} />
      </div>
      <div className="hmi-alarms">
        <div className="hmi-al-h">
          <b>Alarmes {recs.filter((r) => r.active).length > 0 ? `(${recs.filter((r) => r.active).length} active${recs.filter((r) => r.active).length > 1 ? 's' : ''})` : ''}</b>
          {unack.length > 0 && <button type="button" className="btn sm" onClick={() => ack()}>Acquitter tout</button>}
          {recs.some((r) => !r.active) && <button type="button" className="link" onClick={clear}>Effacer l'historique</button>}
        </div>
        {recs.length === 0 ? <p className="hmi-ok">✓ Aucune alarme</p> : (
          <ul>
            {recs.map((r) => (
              <li key={r.id} className={`${r.crit ? 'crit' : 'warn'} ${r.active ? 'act' : 'old'} ${r.active && !r.ack ? 'new' : ''}`}>
                <span className="hmi-t">{r.since}</span>
                <span className="hmi-x">{r.text}{!r.active && <em> — disparue à {r.end}</em>}</span>
                {r.active && !r.ack && <button type="button" className="link" onClick={() => ack(r.id)}>Acquitter</button>}
                {r.active && r.ack && <em className="hmi-ack">acquittée</em>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CabinetView({ i, ev, live, print }: { i: Installation; ev: Evaluation; live?: ELive; print?: boolean }) {
  const cfg = elecConfig(i, ev);
  const [sel, setSel] = useState<string | null>(null);
  const rows: (0 | 1 | 2)[] = [0, 1, 2];
  const rowY = [70, 230, 390];
  const titles = [cfg.solar ? 'Arrivée champ solaire' : 'Arrivée et protections', 'Départ moteur', 'Commande et sécurités'];
  const faultyPump = live?.isolated ? 1 : (live?.running ?? [])[0] ?? 1;
  const hl = new Set(cfg.parts.filter((p) => (p.pump == null || p.pump === faultyPump) && p.faults?.some((f) => live?.faults.includes(f))).map((p) => p.id));
  const placed: ReactNode[] = [];
  let maxX = 0;
  rows.forEach((r) => {
    let x = 46;
    for (const p of cfg.parts.filter((q) => q.row === r)) {
      const big = p.kind === 'vfd' || p.kind === 'mppt' || p.kind === 'soft';
      const w = big ? Math.max(p.poles * MOD, 86) : p.kind === 'transfo' ? 62 : p.kind === 'cap' ? 30 : p.poles * MOD;
      placed.push(<Module key={p.id} p={p} x={x} y={rowY[r]} st={partState(p, live)} sel={sel === p.id} hl={hl.has(p.id)} onPick={setSel} hz={live?.hz} />);
      x += w + 12;
    }
    maxX = Math.max(maxX, x);
  });
  const W = Math.max(520, maxX + 30);
  const door = cfg.parts.filter((p) => p.row === 'door');
  const cur = cfg.parts.find((p) => p.id === sel);
  return (
    <div className="cabinet">
      {!print && <CabinetHmi i={i} ev={ev} cfg={cfg} L={live} />}
      <div className="cab-wrap" onClick={() => setSel(null)}>
        <svg viewBox={`0 0 ${W + 20} 560`} className="cab-in" role="img" aria-label="Intérieur du coffret électrique">
          <rect x={10} y={10} width={W} height={540} rx={10} className="cab-box" />
          <rect x={24} y={24} width={W - 28} height={512} rx={4} className="cab-plate" />
          {rows.map((r) => (
            <g key={r}>
              <text x={34} y={rowY[r] - 26} className="cab-row">{titles[r]}</text>
              <rect x={30} y={rowY[r] + 30} width={W - 40} height={18} className="cab-rail" />
              <rect x={30} y={rowY[r] + 112} width={W - 40} height={16} rx={2} className="cab-duct" />
            </g>
          ))}
          <text x={W / 2 + 10} y={548} textAnchor="middle" className="cab-foot">Presse-étoupes : alimentation · câble moteur {ev.elec.cores} {String(i.elec.cableSec).replace('.', ',')} mm² · flotteurs / capteurs</text>
          {placed}
        </svg>
        <svg viewBox={`0 0 190 ${60 + Math.ceil(door.length / 2) * 92}`} className="cab-doorsvg" role="img" aria-label="Façade du coffret">
          <rect x={4} y={4} width={182} height={52 + Math.ceil(door.length / 2) * 92} rx={10} className="cab-door" />
          <text x={95} y={36} textAnchor="middle" className="cab-row">Porte (façade)</text>
          {door.map((p, k) => (
            <DoorItem key={p.id} p={p} x={57 + (k % 2) * 76} y={84 + Math.floor(k / 2) * 92} st={partState(p, live)} L={live} sel={sel === p.id} onPick={setSel} inom={ev.elec.inom} />
          ))}
        </svg>
      </div>
      {hl.size > 0 && <p className="small cab-warn">Composants concernés par la panne en cours : {cfg.parts.filter((p) => hl.has(p.id)).map((p) => p.tag).join(', ')}</p>}
      {print ? (
        <table className="tbl cab-table">
          <thead><tr><th>Repère</th><th>Désignation</th><th>Réglage / calibre</th></tr></thead>
          <tbody>{cfg.parts.map((p) => <tr key={p.id}><td><b>{p.tag}</b></td><td>{p.label}</td><td>{p.setting ?? '—'}</td></tr>)}</tbody>
        </table>
      ) : cur ? (
        <div className="cab-card">
          <div className="cab-card-h"><b>{cur.tag} — {cur.label}</b><button type="button" className="icon-btn sm" onClick={() => setSel(null)} aria-label="Fermer"><X size={16} /></button></div>
          <p>{cur.role}</p>
          {cur.setting && <p><b>Réglage / calibre :</b> {cur.setting}</p>}
          {cur.panne && <p><b>En cas de panne :</b> {cur.panne}</p>}
          {live && <p className="small muted">État : {({ on: 'en service', off: 'au repos / hors tension', trip: 'déclenché', fault: 'en défaut' } as Record<string, string>)[partState(cur, live)]}</p>}
        </div>
      ) : (
        <ul className="cab-legend">
          {cfg.parts.map((p) => <li key={p.id}><button type="button" className={hl.has(p.id) ? 'hl' : ''} onClick={() => setSel(p.id)}><b>{p.tag}</b> {p.label}</button></li>)}
        </ul>
      )}
    </div>
  );
}

/* ============================ Schéma électrique ============================ */
// Symboles normalisés (IEC 60617, simplifiés). Conducteur vertical dans le circuit de puissance.

function VContact({ x, y, closed, breaker, disc, live }: { x: number; y: number; closed: boolean; breaker?: boolean; disc?: boolean; live?: boolean }) {
  // borne haute y, borne basse y+44
  return (
    <g className={live ? 'w live' : 'w'}>
      <path d={`M${x} ${y} V${y + 12} M${x} ${y + 32} V${y + 44}`} />
      <path d={closed ? `M${x} ${y + 32} L${x - 2} ${y + 12}` : `M${x} ${y + 32} L${x - 12} ${y + 14}`} className="blade" />
      {breaker && <path d={`M${x - 4} ${y + 8} l8 8 m0 -8 l-8 8`} className="sym" />}
      {disc && <path d={`M${x - 5} ${y + 12} H${x + 5}`} className="sym" />}
    </g>
  );
}
function HContact({ x, y, closed, nc, live, label }: { x: number; y: number; closed: boolean; nc?: boolean; live?: boolean; label?: string }) {
  // borne gauche x, borne droite x+44
  return (
    <g className={live ? 'w live' : 'w'}>
      <path d={`M${x} ${y} H${x + 13} M${x + 31} ${y} H${x + 44}`} />
      {nc && <path d={`M${x + 31} ${y} V${y + 7}`} className="sym" />}
      <path d={closed ? (nc ? `M${x + 13} ${y} L${x + 33} ${y + 6}` : `M${x + 13} ${y} L${x + 31} ${y + 1}`) : `M${x + 13} ${y} L${x + 30} ${y - 10}`} className="blade" />
      {label && <text x={x + 22} y={y - 14} textAnchor="middle" className="e-tag">{label}</text>}
    </g>
  );
}
function Coil({ x, y, on, label, sub }: { x: number; y: number; on: boolean; label: string; sub?: string }) {
  return (
    <g>
      <rect x={x} y={y - 9} width={34} height={18} className={`e-coil ${on ? 'on' : ''}`} />
      <text x={x + 17} y={y - 14} textAnchor="middle" className="e-tag">{label}</text>
      {sub && <text x={x + 17} y={y + 22} textAnchor="middle" className="e-sub">{sub}</text>}
    </g>
  );
}
function Lamp({ x, y, on, cls, label, sub }: { x: number; y: number; on: boolean; cls: string; label: string; sub: string }) {
  return (
    <g>
      <circle cx={x + 11} cy={y} r={10} className={`e-lamp ${cls} ${on ? 'on' : ''}`} />
      <path d={`M${x + 4} ${y - 7} l14 14 m0 -14 l-14 14`} className="sym" />
      <text x={x + 11} y={y - 15} textAnchor="middle" className="e-tag">{label}</text>
      <text x={x + 11} y={y + 23} textAnchor="middle" className="e-sub">{sub}</text>
    </g>
  );
}

/** Plusieurs pompes : schéma unifilaire (un trait = toutes les phases), un départ par pompe. */
function PowerMulti({ i, ev, cfg, L }: { i: Installation; ev: Evaluation; cfg: ECfg; L?: ELive }) {
  const powered = L ? L.powered : false;
  const tripQ2 = L?.tripKind === 'decl_diff';
  const run = L?.running ?? [];
  const faulty = L?.isolated ? 1 : run[0] ?? 1;
  const ticks = (x: number, y: number) => <path d={Array.from({ length: cfg.mono ? 2 : 3 }, (_, k) => `M${x - 6} ${y + 4 + k * 5} l12 -6`).join(' ')} className="sym" />;
  const els: ReactNode[] = [];
  const X = 60;
  let y = 40;
  els.push(<text key="src" x={X} y={28} textAnchor="middle" className="e-tag">{cfg.solar ? 'Champ PV' : cfg.mono ? 'L N 230 V' : 'L1 L2 L3 400 V'}</text>);
  let lv = powered;
  els.push(<VContact key="q0" x={X} y={y} closed={powered || !L} disc live={lv} />, <text key="q0t" x={X + 20} y={y + 26} className="e-tag">Q0</text>, ticks(X, y + 48));
  y += 64;
  if (!cfg.solar) {
    els.push(<VContact key="q2" x={X} y={y} closed={!tripQ2} breaker live={lv} />, <text key="q2t" x={X + 20} y={y + 20} className="e-tag">Q2</text>, <text key="q2s" x={X + 20} y={y + 34} className="e-sub">différentiel 30 mA{tripQ2 ? ' — déclenché' : ''}</text>);
    y += 44; lv = lv && !tripQ2;
  }
  const n = cfg.pumps;
  const sp = Math.min(140, 470 / n);
  const xs = Array.from({ length: n }, (_, k) => 70 + sp / 2 + k * sp);
  const busY = y + 20;
  els.push(<path key="d" d={`M${X} ${y} V${busY}`} className={lv ? 'w live' : 'w'} />, <path key="bus" d={`M${Math.min(X, xs[0])} ${busY} H${xs[n - 1]}`} className={lv ? 'w live bus' : 'w bus'} />, <text key="bt" x={xs[n - 1] + 8} y={busY + 4} className="e-sub">jeu de barres</text>);
  xs.forEach((x, k0) => {
    const k = k0 + 1;
    const sb = k > n - cfg.standby;
    const isF = k === faulty;
    const trip1 = isF && L?.tripKind === 'decl_thermique' && (!!L?.trip || !!L?.isolated);
    const tripV = isF && L?.tripKind === 'decl_variateur' && (!!L?.trip || !!L?.isolated);
    let yy = busY;
    let f = lv;
    const on = run.includes(k);
    els.push(<path key={`a${k}`} d={`M${x} ${yy} V${yy + 14}`} className={f ? 'w live' : 'w'} />); yy += 14;
    if (!cfg.solar) {
      els.push(<VContact key={`q1${k}`} x={x} y={yy} closed={!trip1} breaker live={f} />, <text key={`q1t${k}`} x={x + 14} y={yy + 24} className="e-tag">Q1.{k}</text>);
      if (trip1) els.push(<text key={`q1x${k}`} x={x + 14} y={yy + 38} className="e-trip">déclenché</text>);
      yy += 48; f = f && !trip1;
    }
    if (cfg.vfd) {
      els.push(<rect key={`u${k}`} x={x - 22} y={yy} width={44} height={34} rx={4} className={`e-block ${f ? 'energ' : ''}`} />, <text key={`ut${k}`} x={x} y={yy + 21} textAnchor="middle" className="e-tag">U1.{k}</text>);
      if (tripV) els.push(<text key={`ux${k}`} x={x + 26} y={yy + 21} className="e-trip">défaut</text>);
      yy += 34; f = f && on && !tripV;
    } else {
      const closed = on || (isF && !!L?.faults.includes('contacteur_colle') && !!L?.on);
      els.push(<VContact key={`km${k}`} x={x} y={yy} closed={closed} live={f} />, <text key={`kmt${k}`} x={x + 14} y={yy + 24} className="e-tag">KM1.{k}</text>);
      yy += 44; f = f && closed;
    }
    els.push(<path key={`c${k}`} d={`M${x} ${yy} V${yy + 30}`} className={f ? 'w live' : 'w'} />, ticks(x, yy + 8));
    yy += 30;
    els.push(<circle key={`m${k}`} cx={x} cy={yy + 24} r={24} className={`e-motor ${f && !(isF && L?.hum) ? 'run' : ''} ${isF && L?.hum ? 'hum' : ''}`} />, <text key={`mt${k}`} x={x} y={yy + 24} textAnchor="middle" className="e-tag">M{k}</text>, <text key={`ms${k}`} x={x} y={yy + 37} textAnchor="middle" className="e-sub">{cfg.mono ? '1~' : '3~'}</text>);
    els.push(<text key={`ml${k}`} x={x} y={yy + 64} textAnchor="middle" className="e-sub">{sb ? 'secours' : 'service'}</text>);
  });
  const H = busY + 14 + (cfg.solar ? 0 : 48) + (cfg.vfd ? 34 : 44) + 30 + 80;
  els.push(<text key="leg" x={20} y={H - 6} className="e-sub">Unifilaire : un trait = {cfg.mono ? '2' : '3'} conducteurs · chaque départ : câble {ev.elec.cores} {String(i.elec.cableSec).replace('.', ',')} mm², moteur {fmt(i.pump.motorKw, 1)} kW / {fmt(ev.elec.inom, 1)} A</text>);
  return <svg viewBox={`0 0 560 ${H + 4}`} className="elec-svg" role="img" aria-label="Schéma unifilaire de puissance">{els}</svg>;
}

function PowerCircuit({ i, ev, cfg, L }: { i: Installation; ev: Evaluation; cfg: ECfg; L?: ELive }) {
  if (cfg.pumps > 1) return <PowerMulti i={i} ev={ev} cfg={cfg} L={L} />;
  const n = cfg.solar ? 2 : cfg.mono ? 2 : 3;
  const xs = Array.from({ length: n }, (_, k) => 150 + k * 46);
  const names = cfg.solar ? ['+', '−'] : cfg.mono ? ['L', 'N'] : ['L1', 'L2', 'L3'];
  const powered = L ? L.powered : false;
  const tripQ1 = L?.tripKind === 'decl_thermique';
  const tripQ2 = L?.tripKind === 'decl_diff';
  const kmClosed = !!L?.on || !!L?.faults.includes('contacteur_colle') && !!L?.on;
  const els: ReactNode[] = [];
  let y = 46;
  const liveAt = { v: powered };
  const seg = (y1: number, y2: number) => xs.map((x) => <path key={`s${x}-${y1}`} d={`M${x} ${y1} V${y2}`} className={liveAt.v ? 'w live' : 'w'} />);
  const label = (t: string, sub: string, yy: number) => <g key={`l${t}${yy}`}><text x={xs[n - 1] + 26} y={yy + 20} className="e-tag">{t}</text><text x={xs[n - 1] + 26} y={yy + 35} className="e-sub">{sub}</text></g>;
  const link = (yy: number) => <path key={`k${yy}`} d={`M${xs[0] - 6} ${yy + 22} H${xs[n - 1] - 6}`} className="mech" />;
  const block = (t: string, sub: string, h = 64) => {
    els.push(...seg(y, y + 12));
    const xr = cfg.solar ? 242 : xs[n - 1];
    els.push(<rect key={`b${t}`} x={xs[0] - 24} y={y + 12} width={xr - xs[0] + 48} height={h} rx={4} className={`e-block ${liveAt.v ? 'energ' : ''}`} />, <text key={`bt${t}`} x={(xs[0] + xr) / 2} y={y + 12 + h / 2 + 4} textAnchor="middle" className="e-tag">{t}</text>, <text key={`bs${t}`} x={(xs[0] + xr) / 2} y={y + 12 + h / 2 + 20} textAnchor="middle" className="e-sub">{sub}</text>);
    y += 12 + h;
  };
  // Source
  if (cfg.solar) {
    els.push(<g key="pv"><rect x={xs[0] - 40} y={8} width={xs[n - 1] - xs[0] + 80} height={30} rx={3} className="e-pv" /><path d={`M${xs[0] - 30} 30 l12 -16 M${xs[0] - 14} 30 l12 -16`} className="sym" /><text x={xs[n - 1] + 50} y={28} className="e-tag">Champ PV {ev.elec.solar ? `${ev.elec.solar.ns} × ${ev.elec.solar.np}` : ''}</text></g>);
  } else {
    xs.forEach((x, k) => els.push(<text key={`n${k}`} x={x} y={30} textAnchor="middle" className="e-tag">{names[k]}</text>));
    els.push(<text key="pe" x={xs[n - 1] + 46} y={30} className="e-tag pe">PE</text>, <path key="pel" d={`M${xs[n - 1] + 52} 36 V600`} className="w pe" />);
    els.push(<text key="src" x={xs[0] - 30} y={30} textAnchor="end" className="e-sub">{cfg.mono ? '230 V' : '400 V'} {i.elec.supply === 'groupe' ? 'groupe' : 'réseau'}</text>);
  }
  // Q0 sectionneur
  xs.forEach((x) => els.push(<VContact key={`q0${x}`} x={x} y={y} closed={powered || !L} disc live={liveAt.v} />));
  els.push(link(y), label('Q0', cfg.solar ? 'sectionneur DC' : 'interrupteur-sectionneur', y));
  y += 44;
  if (cfg.solar) {
    els.push(...seg(y, y + 14)); y += 14;
    els.push(<g key="spd"><path d={`M${xs[0]} ${y} H${xs[0] - 50} V${y + 12}`} className="w" /><rect x={xs[0] - 58} y={y + 12} width={16} height={26} className="e-block" /><path d={`M${xs[0] - 50} ${y + 38} V${y + 50} M${xs[0] - 58} ${y + 50} h16`} className="w" /><text x={xs[0] - 66} y={y + 30} textAnchor="end" className="e-tag">F0</text></g>);
  } else {
    // Q2 différentiel
    xs.forEach((x) => els.push(<VContact key={`q2${x}`} x={x} y={y} closed={!tripQ2} breaker live={liveAt.v} />));
    els.push(link(y), label('Q2', 'différentiel 30 mA', y), <ellipse key="tore" cx={(xs[0] + xs[n - 1]) / 2} cy={y + 40} rx={(xs[n - 1] - xs[0]) / 2 + 16} ry={6} className="sym" />);
    if (tripQ2) els.push(<text key="t2" x={xs[0] - 30} y={y + 26} textAnchor="end" className="e-trip">déclenché</text>);
    y += 44; liveAt.v = liveAt.v && !tripQ2;
    // Q1 disjoncteur moteur
    els.push(...seg(y, y + 10)); y += 10;
    xs.forEach((x) => els.push(<VContact key={`q1${x}`} x={x} y={y} closed={!tripQ1} breaker live={liveAt.v} />, <rect key={`th${x}`} x={x - 6} y={y + 46} width={12} height={10} className="e-therm" />));
    els.push(link(y), label('Q1', `disjoncteur moteur ${fmt(ev.elec.inom, 1)} A`, y));
    if (tripQ1) els.push(<text key="t1" x={xs[0] - 30} y={y + 26} textAnchor="end" className="e-trip">déclenché</text>);
    y += 56; liveAt.v = liveAt.v && !tripQ1;
  }
  els.push(...seg(y, y + 14)); y += 14;
  // Étoile-triangle complet : KM1 ligne → U1 V1 W1 ; KM2 triangle → W2 U2 V2 ; KM3 étoile court-circuite U2 V2 W2
  if (cfg.start === 'etoile') {
    const rx = xs.map((_, k) => 330 + k * 46);
    const yb = y - 8;
    const lv0 = liveAt.v;
    const run = !!L?.on; // en service : triangle (KM1 + KM2 fermés, KM3 ouvert)
    xs.forEach((x, k) => els.push(<path key={`br${k}`} d={`M${x} ${yb} H${rx[k]} V${y}`} className={lv0 ? 'w live' : 'w'} />, <circle key={`bd${k}`} cx={x} cy={yb} r={3} className="e-dot" />));
    xs.forEach((x) => els.push(<VContact key={`km1${x}`} x={x} y={y} closed={run} live={lv0} />));
    rx.forEach((x) => els.push(<VContact key={`km2${x}`} x={x} y={y} closed={run} live={lv0} />));
    els.push(link(y), <path key="lk2" d={`M${rx[0] - 6} ${y + 22} H${rx[2] - 6}`} className="mech" />, label('KM1', 'ligne', y));
    els.push(<text key="km2t" x={rx[2] + 22} y={y + 20} className="e-tag">KM2</text>, <text key="km2s" x={rx[2] + 22} y={y + 35} className="e-sub">triangle</text>);
    y += 44;
    const lvL = lv0 && run;
    // Bornier 6 fils
    const yT = y + 26;
    xs.forEach((x, k) => els.push(<path key={`l1${k}`} d={`M${x} ${y} V${yT}`} className={lvL ? 'w live' : 'w'} />, <circle key={`t1${k}`} cx={x} cy={yT} r={4} className="e-term" />, <text key={`tt1${k}`} x={x + 7} y={yT - 5} className="e-sub">{['U1', 'V1', 'W1'][k]}</text>));
    rx.forEach((x, k) => els.push(<path key={`l2${k}`} d={`M${x} ${y} V${yT}`} className={lvL ? 'w live' : 'w'} />, <circle key={`t2${k}`} cx={x} cy={yT} r={4} className="e-term" />, <text key={`tt2${k}`} x={x + 7} y={yT - 5} className="e-sub">{['W2', 'U2', 'V2'][k]}</text>));
    // KM3 étoile : à partir des bornes U2 V2 W2, vers le point étoile
    const yS = yT + 14;
    rx.forEach((x, k) => els.push(<path key={`s${k}`} d={`M${x} ${yT} V${yS + k * 0}`} className="w" />));
    const kx = [470, 492, 514];
    kx.forEach((x, k) => els.push(<path key={`sk${k}`} d={`M${rx[k]} ${yS + k * 6} H${x} V${yS + 24}`} className="w" />, <circle key={`skd${k}`} cx={rx[k]} cy={yS + k * 6} r={3} className="e-dot" />, <VContact key={`km3${k}`} x={x} y={yS + 24} closed={false} live={false} />));
    els.push(<path key="star" d={`M${kx[0]} ${yS + 68} H${kx[2]}`} className="w" />, <text key="km3t" x={kx[2] + 10} y={yS + 44} className="e-tag">KM3</text>, <text key="km3s" x={kx[0] - 10} y={yS + 86} className="e-sub">étoile (démarrage)</text>, <path key="lk3" d={`M${kx[0] - 6} ${yS + 46} H${kx[2] - 6}`} className="mech" />);
    // Câble 6 conducteurs vers le moteur
    y = yT;
    const cxm = (xs[0] + rx[2]) / 2 - 40;
    const yM = yS + 150;
    [...xs, ...rx].forEach((x, k) => els.push(<path key={`mc${k}`} d={`M${x} ${y} V${yM - 40} L${cxm + (k - 2.5) * 9} ${yM - 30}`} className={lvL ? 'w live' : 'w'} />));
    els.push(<text key="cab6" x={xs[0] - 30} y={yM - 50} textAnchor="end" className="e-sub">câble 7G {String(i.elec.cableSec).replace('.', ',')} mm² · {i.elec.cableLen} m</text>);
    els.push(<circle key="mot" cx={cxm} cy={yM} r={32} className={`e-motor ${run && !L?.hum ? 'run' : ''} ${L?.hum ? 'hum' : ''}`} />, <text key="mt" x={cxm} y={yM - 2} textAnchor="middle" className="e-motor-t">M</text>, <text key="mt2" x={cxm} y={yM + 14} textAnchor="middle" className="e-sub">3~ Δ/Y</text>);
    els.push(<text key="mp" x={cxm} y={yM + 50} textAnchor="middle" className="e-tag">{fmt(i.pump.motorKw, 1)} kW · {fmt(ev.elec.inom, 1)} A</text>, <path key="pem" d={`M${cxm + 30} ${yM + 12} H${xs[n - 1] + 52}`} className="w pe" />);
    els.push(<text key="seq" x={20} y={yM + 76} className="e-sub"><tspan x={20}>Démarrage : KM1 + KM3 (étoile, courant ÷ 3) pendant 3 à 8 s (KT1),</tspan><tspan x={20} dy={14}>puis KM3 s'ouvre et KM2 se ferme (triangle). KM2 et KM3 ne sont jamais fermés ensemble.</tspan></text>);
    return <svg viewBox={`0 0 560 ${yM + 104}`} className="elec-svg" role="img" aria-label="Schéma de puissance étoile-triangle">{els}</svg>;
  }
  // Organe de commande du moteur
  if (cfg.start === 'direct' || cfg.start === 'progressif') {
    xs.forEach((x) => els.push(<VContact key={`km${x}`} x={x} y={y} closed={kmClosed} live={liveAt.v} />));
    els.push(link(y), label('KM1', 'contacteur', y));
    y += 44; liveAt.v = liveAt.v && kmClosed;
    if (cfg.start === 'progressif') block('U1', 'démarreur progressif');
  } else {
    block('U1', cfg.solar ? 'contrôleur solaire MPPT' : `variateur ${fmt(ev.elec.vfdKw, 1)} kW`, 70);
    liveAt.v = liveAt.v && !!L?.on;
    if (ev.elec.filter && !cfg.solar) block('Z1', ev.elec.filter, 40);
  }
  // Câble et moteur
  const motorN = cfg.solar || cfg.mono ? (cfg.solar ? 3 : 2) : 3;
  const mxs = Array.from({ length: motorN }, (_, k) => 150 + k * 46);
  if (cfg.solar) { mxs.forEach((x) => els.push(<path key={`o${x}`} d={`M${x} ${y} V${y + 30}`} className={liveAt.v ? 'w live' : 'w'} />)); }
  else els.push(...seg(y, y + 30));
  y += 30;
  // bornier X1
  mxs.forEach((x, k) => els.push(<circle key={`x${x}`} cx={x} cy={y} r={4} className="e-term" />, <text key={`xt${x}`} x={x + 7} y={y - 5} className="e-sub">{cfg.mono ? ['L', 'N'][k] : ['U', 'V', 'W'][k]}</text>));
  els.push(<text key="x1" x={mxs[motorN - 1] + 26} y={y + 4} className="e-tag">X1</text>);
  { mxs.forEach((x) => els.push(<path key={`mc${x}`} d={`M${x} ${y} V${y + 40}`} className={liveAt.v ? 'w live' : 'w'} />)); y += 40; }
  els.push(<text key="cab" x={mxs[0] - 30} y={y - 16} textAnchor="end" className="e-sub">câble {ev.elec.cores} {String(i.elec.cableSec).replace('.', ',')} mm² · {i.elec.cableLen} m</text>);
  // moteur
  const cx = (mxs[0] + mxs[motorN - 1]) / 2;
  mxs.forEach((x) => els.push(<path key={`mm${x}`} d={`M${x} ${y} L${cx + (x - cx) * 0.4} ${y + 22}`} className={liveAt.v ? 'w live' : 'w'} />));
  els.push(<circle key="mot" cx={cx} cy={y + 52} r={32} className={`e-motor ${L?.on && !L.hum ? 'run' : ''} ${L?.hum ? 'hum' : ''}`} />, <text key="mt" x={cx} y={y + 50} textAnchor="middle" className="e-motor-t">M</text>, <text key="mt2" x={cx} y={y + 66} textAnchor="middle" className="e-sub">{cfg.mono ? '1~' : '3~'}</text>);
  els.push(<text key="mp" x={cx} y={y + 100} textAnchor="middle" className="e-tag">{fmt(i.pump.motorKw, 1)} kW · {fmt(ev.elec.inom, 1)} A</text>);
  if (cfg.mono) els.push(<g key="cap"><path d={`M${cx + 32} ${y + 62} H${cx + 60}`} className="w" /><path d={`M${cx + 60} ${y + 50} V${y + 74} M${cx + 66} ${y + 50} V${y + 74}`} className={`sym ${L?.faults.includes('condensateur') ? 'bad' : ''}`} /><text x={cx + 74} y={y + 70} className="e-tag">C1</text></g>);
  if (!cfg.solar) els.push(<path key="pem" d={`M${cx + 30} ${y + 74} H${xs[n - 1] + 52}`} className="w pe" />);
  if (L?.hum) els.push(<text key="hum" x={cx} y={y + 118} textAnchor="middle" className="e-trip">rotor bloqué : le moteur ronfle</text>);
  const H = y + 130;
  return <svg viewBox={`0 0 560 ${H}`} className="elec-svg" role="img" aria-label="Schéma du circuit de puissance">{els}</svg>;
}

function ControlCircuit({ i, cfg, L }: { i: Installation; cfg: ECfg; L?: ELive }) {
  const powered = L ? L.powered : false;
  const trip = !!L?.trip || !!L?.isolated;
  const coil = !!L?.coilOn;
  const dryOk = L?.tripKind !== 'decl_manque_eau' && L?.tripKind !== 'decl_sous_charge';
  const phOk = !(L?.faults.includes('perte_phase') || L?.faults.includes('rotation'));
  const left = 40, right = cfg.start === 'etoile' && cfg.pumps === 1 && !cfg.vfd ? 700 : 520;
  const els: ReactNode[] = [];
  els.push(<path key="rl" d={`M${left} 40 V${cfg.vfd ? 330 : 400}`} className={powered ? 'w live' : 'w'} />, <path key="rr" d={`M${right} 40 V${cfg.vfd ? 330 : 400}`} className="w" />);
  els.push(<text key="tl" x={left} y={26} textAnchor="middle" className="e-tag">{cfg.mono ? 'L 230 V' : cfg.solar ? '24 V DC' : '24 V (T1)'}</text>, <text key="tr" x={right} y={26} textAnchor="middle" className="e-tag">{cfg.mono ? 'N' : '0 V'}</text>);
  if (cfg.vfd) {
    // Commande par les entrées du variateur / contrôleur
    let x = left;
    const y = 90;
    const chain: { lab: string; ok: boolean; nc?: boolean }[] = [{ lab: 'S0', ok: true, nc: true }, { lab: 'S1 Auto', ok: true }];
    if (cfg.dryRelay) chain.push({ lab: 'KA2', ok: dryOk });
    if (cfg.auto === 'flotteurs') chain.push({ lab: 'flotteurs', ok: coil });
    if (cfg.auto === 'flotteur_res') chain.push({ lab: 'B1 réservoir', ok: coil, nc: true });
    let lv = powered;
    for (const c of chain) {
      els.push(<HContact key={c.lab} x={x} y={y} closed={c.ok} nc={c.nc} live={lv} label={c.lab} />);
      lv = lv && c.ok; x += 64;
      els.push(<path key={`w${c.lab}`} d={`M${x - 20} ${y} H${x}`} className={lv ? 'w live' : 'w'} />);
    }
    els.push(<rect key="vfdb" x={340} y={60} width={150} height={220} rx={6} className={`e-block ${powered ? 'energ' : ''}`} />, <text key="vt" x={415} y={84} textAnchor="middle" className="e-tag">U1 {cfg.solar ? 'contrôleur' : 'variateur'}</text>);
    els.push(<path key="di1" d={`M${x} ${y} H340`} className={lv ? 'w live' : 'w'} />, <text key="di1t" x={346} y={y + 4} className="e-sub">DI1 marche</text>);
    if (cfg.auto === 'capteur') {
      els.push(<g key="ptx"><circle cx={120} cy={170} r={16} className="e-sensor" /><text x={120} y={174} textAnchor="middle" className="e-tag">PT</text><path d="M136 166 H340 M136 176 H340" className={L?.faults.includes('capteur_hs') ? 'w bad' : powered ? 'w live' : 'w'} /><text x={346} y={170} className="e-sub">AI1 4-20 mA</text><text x={346} y={186} className="e-sub">+24 V</text><text x={150} y={200} className="e-sub">capteur de pression{L?.faults.includes('capteur_hs') ? ' — signal 0 mA !' : ''}</text></g>);
    }
    els.push(<g key="ro"><text x={346} y={250} className="e-sub">RL1 défaut</text><path d={`M340 246 H300`} className="w" /><Lamp x={268} y={246} on={trip} cls="r" label="H3" sub="défaut" /><path d="M268 246 H40" className="w" /></g>);
    els.push(<text key="vn" x={415} y={300} textAnchor="middle" className="e-sub">{cfg.solar ? 'démarre si le soleil suffit' : 'rampe, consigne, défauts'}</text>);
    return <svg viewBox="0 0 560 340" className="elec-svg" role="img" aria-label="Schéma de commande">{els}</svg>;
  }
  // Ladder classique
  const r1 = 100;
  let x = left;
  let lv = powered;
  const add = (lab: string, ok: boolean, nc = false) => {
    els.push(<HContact key={`c${lab}`} x={x} y={r1} closed={ok} nc={nc} live={lv} label={lab} />);
    lv = lv && ok; x += 44;
    els.push(<path key={`cw${lab}`} d={`M${x} ${r1} H${x + 12}`} className={lv ? 'w live' : 'w'} />); x += 12;
  };
  els.push(<g key="f3"><rect x={x + 6} y={r1 - 6} width={26} height={12} className="e-fuse" /><text x={x + 19} y={r1 - 14} textAnchor="middle" className="e-tag">F3</text><path d={`M${x} ${r1} H${x + 44}`} className={lv ? 'w live' : 'w'} /></g>); x += 44;
  add('S0', true, true);
  add('Q1', !L || L.tripKind !== 'decl_thermique');
  if (cfg.phaseRelay) add('KA1', phOk);
  if (cfg.dryRelay) add('KA2', dryOk);
  // Sélecteur et automatisme (branches parallèles)
  const bx = x;
  const autoLab = cfg.auto === 'pressostat' ? 'B1 pressostat' : cfg.auto === 'flotteur_res' ? 'B1 flotteur réservoir' : cfg.auto === 'flotteurs' ? 'B1 marche / B2 arrêt' : 'horloge / commande';
  const autoOk = coil;
  els.push(<HContact key="sa" x={bx} y={r1} closed={true} live={lv} label="S1 Auto" />);
  els.push(<path key="saw" d={`M${bx + 44} ${r1} H${bx + 60}`} className={lv ? 'w live' : 'w'} />);
  els.push(<HContact key="au" x={bx + 60} y={r1} closed={autoOk} nc={cfg.auto === 'pressostat' || cfg.auto === 'flotteur_res'} live={lv} label="" />, <text key="aut" x={bx + 82} y={r1 + 24} textAnchor="middle" className="e-sub">{autoLab}</text>);
  const lv2 = lv && autoOk;
  els.push(<path key="auw" d={`M${bx + 104} ${r1} H${bx + 150}`} className={lv2 ? 'w live' : 'w'} />);
  // branche Manu
  els.push(<path key="mb" d={`M${bx - 6} ${r1} V${r1 + 46} H${bx}`} className="w" />, <HContact key="sm" x={bx} y={r1 + 46} closed={false} live={false} label="S1 Manu" />, <path key="mbw" d={`M${bx + 44} ${r1 + 46} H${bx + 150} V${r1}`} className="w" />);
  if (cfg.auto === 'flotteurs') els.push(<g key="sh"><path d={`M${bx + 54} ${r1} V${r1 - 40} H${bx + 60}`} className="w" /><HContact x={bx + 60} y={r1 - 40} closed={coil} live={lv && coil} label="KM1 (auto-maintien)" /><path d={`M${bx + 104} ${r1 - 40} H${bx + 116} V${r1}`} className="w" /></g>);
  if (cfg.pumps > 1) {
    // Relais d'alternance / cascade : il répartit l'ordre de marche entre les pompes
    const run = L?.running ?? [];
    els.push(<path key="toc" d={`M${bx + 150} ${r1} H${bx + 170}`} className={lv2 ? 'w live' : 'w'} />, <rect key="ka3" x={bx + 170} y={r1 - 16} width={58} height={32} rx={3} className={`e-block ${lv2 ? 'energ' : ''}`} />, <text key="ka3t" x={bx + 199} y={r1 + 4} textAnchor="middle" className="e-tag">KA3</text>, <text key="ka3s" x={bx + 199} y={r1 + 30} textAnchor="middle" className="e-sub">{i.pump.alternate ? 'alternance' : 'cascade'}</text>);
    const n = Math.min(cfg.pumps, 4);
    for (let k = 1; k <= n; k++) {
      const yk = r1 - 24 + (k - 1) * 22;
      const onk = lv2 && run.includes(k);
      els.push(<path key={`o${k}`} d={`M${bx + 228} ${r1} L${right - 70} ${yk} H${right - 50}`} className={onk ? 'w live' : 'w'} />, <rect key={`cl${k}`} x={right - 50} y={yk - 7} width={30} height={14} className={`e-coil ${onk ? 'on' : ''}`} />, <text key={`ct${k}`} x={right - 54} y={yk + 4} textAnchor="end" className="e-sub">KM1.{k}</text>, <path key={`cr${k}`} d={`M${right - 20} ${yk} H${right}`} className="w" />);
    }
  } else if (cfg.start === 'etoile') {
    // Étoile-triangle : KM1 et KT1 alimentés ensemble ; KM3 (étoile) puis KM2 (triangle) après la temporisation, verrouillés entre eux
    const bus = bx + 180, ys = [r1 - 34, r1 - 4, r1 + 26, r1 + 56];
    const run = coil; // régime établi : triangle
    els.push(<path key="toc" d={`M${bx + 150} ${r1} H${bus}`} className={lv2 ? 'w live' : 'w'} />, <path key="ebus" d={`M${bus} ${ys[0]} V${ys[3]}`} className={lv2 ? 'w live' : 'w'} />);
    const coilAt = (k: number, lab: string, sub: string, on: boolean) => els.push(<Coil key={`ec${k}`} x={right - 50} y={ys[k]} on={on} label="" sub="" />, <text key={`et${k}`} x={right - 54} y={ys[k] + 4} textAnchor="end" className="e-tag">{lab}</text>, <text key={`es${k}`} x={right - 33} y={ys[k] + 4} textAnchor="middle" className="e-sub">{sub}</text>, <path key={`er${k}`} d={`M${right - 16} ${ys[k]} H${right}`} className="w" />);
    els.push(<path key="e0" d={`M${bus} ${ys[0]} H${right - 70}`} className={lv2 ? 'w live' : 'w'} />); coilAt(0, 'KM1', 'ligne', run);
    els.push(<path key="e1" d={`M${bus} ${ys[1]} H${right - 70}`} className={lv2 ? 'w live' : 'w'} />); coilAt(1, 'KT1', 'tempo', run);
    els.push(<HContact key="e2a" x={bus} y={ys[2]} closed={!run} nc live={lv2} />, <HContact key="e2b" x={bus + 50} y={ys[2]} closed nc live={lv2 && !run} />, <path key="e2w" d={`M${bus + 94} ${ys[2]} H${right - 70}`} className="w" />, <text key="e2t" x={bus + 47} y={ys[2] + 18} textAnchor="middle" className="e-sub">KT1 · KM2</text>); coilAt(2, 'KM3', 'étoile', false);
    els.push(<HContact key="e3a" x={bus} y={ys[3]} closed={run} live={lv2} />, <HContact key="e3b" x={bus + 50} y={ys[3]} closed nc live={lv2 && run} />, <path key="e3w" d={`M${bus + 94} ${ys[3]} H${right - 70}`} className={lv2 && run ? 'w live' : 'w'} />, <text key="e3t" x={bus + 47} y={ys[3] + 18} textAnchor="middle" className="e-sub">KT1 · KM3</text>); coilAt(3, 'KM2', 'triangle', run);
  } else {
    els.push(<path key="toc" d={`M${bx + 150} ${r1} H${right - 50}`} className={lv2 ? 'w live' : 'w'} />);
    els.push(<Coil key="km1" x={right - 50} y={r1} on={coil} label="KM1" sub="bobine" />, <path key="kmr" d={`M${right - 16} ${r1} H${right}`} className="w" />);
  }
  if (L?.faults.includes('contacteur_colle')) els.push(<text key="kmc" x={right - 33} y={r1 + 40} textAnchor="middle" className="e-trip">contacts soudés</text>);
  // Voyants
  const lr = (yy: number, lab: string, on: boolean, cls: string, sub: string, contact?: { lab: string; ok: boolean; nc?: boolean }) => {
    els.push(<path key={`lw${lab}`} d={`M${left} ${yy} H${left + 40}`} className={powered ? 'w live' : 'w'} />);
    let xx = left + 40;
    if (contact) { els.push(<HContact key={`lc${lab}`} x={xx} y={yy} closed={contact.ok} nc={contact.nc} live={powered} label={contact.lab} />); xx += 44; }
    els.push(<path key={`lw2${lab}`} d={`M${xx} ${yy} H${right - 40}`} className={on ? 'w live' : 'w'} />, <Lamp key={`l${lab}`} x={right - 40} y={yy} on={on} cls={cls} label={lab} sub={sub} />, <path key={`lw3${lab}`} d={`M${right - 18} ${yy} H${right}`} className="w" />);
  };
  lr(200, 'H1', powered, 'w', 'sous tension');
  lr(260, 'H2', !!L?.on, 'g', 'marche', { lab: 'KM1', ok: !!L?.on });
  lr(320, 'H3', trip, 'r', 'défaut', { lab: 'Q1 / KA', ok: trip });
  if (cfg.auto === 'flotteurs' && i.acc.flotteur_alarme?.on) lr(380, 'H4', false, 'o', 'alarme niveau haut', { lab: 'B3', ok: false });
  return <svg viewBox={`0 0 ${right + 40} 410`} className="elec-svg" role="img" aria-label="Schéma de commande">{els}</svg>;
}

export function WiringView({ i, ev, live }: { i: Installation; ev: Evaluation; live?: ELive }) {
  const cfg = elecConfig(i, ev);
  const startTxt = cfg.solar ? 'pompage solaire' : { direct: 'démarrage direct', etoile: 'démarrage étoile-triangle', progressif: 'démarreur progressif', variateur: 'variateur de fréquence' }[cfg.start];
  return (
    <div className="wiring">
      <p className="small muted">Schéma de principe ({cfg.mono ? 'monophasé' : cfg.solar ? 'solaire' : 'triphasé'}, {startTxt}{cfg.pumps > 1 ? ` · ${cfg.pumps} pompes, un départ par pompe${cfg.standby ? `, dont ${cfg.standby} de secours` : ''}` : ''}). {live ? 'En orange : conducteurs sous tension en ce moment.' : 'Lancez la simulation pour voir les conducteurs sous tension.'}</p>
      <div className="wiring-grid">
        <figure><figcaption>Circuit de puissance</figcaption><PowerCircuit i={i} ev={ev} cfg={cfg} L={live} /></figure>
        <figure><figcaption>Circuit de commande</figcaption><ControlCircuit i={i} cfg={cfg} L={live} /></figure>
      </div>
      <ul className="wiring-legend small">
        <li><b>Q0</b> sectionneur · <b>Q2</b> différentiel · <b>Q1</b> disjoncteur moteur · <b>KM</b> contacteur · <b>U1</b> variateur / démarreur · <b>KA</b> relais · <b>S0</b> arrêt d'urgence · <b>S1</b> sélecteur · <b>B</b> capteurs (pressostat, flotteurs) · <b>H</b> voyants · <b>X1</b> bornier · <b>PE</b> terre.</li>
        <li>Contact dessiné fermé = le courant passe. Le schéma réel du constructeur reste la référence pour le câblage.</li>
      </ul>
    </div>
  );
}
