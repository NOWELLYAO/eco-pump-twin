import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, MapPin, Wand2, X } from 'lucide-react';
import { ACCESSORIES, APPS, DN_LIST, FLUIDS, MODES, NEED_LABEL, PIPE_MATS, PUMP_TYPES } from '../catalog';
import { evaluate, withPipe } from '../evaluate';
import { ensureElec, SUPPLY_LABEL, START_LABEL } from '../electrical';
import { fluidAt, staticHead, systemHeadAt, vel } from '../hydraulics';
import { posAdvice } from '../positions';
import { autoEquip, empty, makeFluid, sanitizeAcc } from '../presets';
import type { AccState, AppId, FluidId, Installation, ModeId, Need, PipeMatId, PumpMatId, PumpTypeId, StartId, SupplyId } from '../types';
import { HealthRing, LevelIcon } from '../../ui/Status';
import { touch, trackedFields } from '../defaults';
import { NumField, SelField, TextField } from './Fields';

const fx = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
const MOTORS = [0.37, 0.55, 0.75, 1.1, 1.5, 2.2, 3, 4, 5.5, 7.5, 11, 15, 18.5, 22, 30, 37, 45, 55, 75, 90, 110, 132, 160];

/** Besoin type par application, pour pré-remplir. */
const DUTY0: Record<AppId, { q: number; p: number; h: number; hRef: number }> = {
  forage: { q: 5, p: 0, h: 10, hRef: 12 },
  surpression: { q: 6, p: 2, h: 14, hRef: 15 },
  irrigation: { q: 10, p: 2.5, h: 8, hRef: 5 },
  relevage: { q: 15, p: 0, h: 6, hRef: 5 },
  drainage: { q: 20, p: 0, h: 6, hRef: 4 },
  transfert: { q: 10, p: 0, h: 8, hRef: 15 },
  incendie: { q: 30, p: 4, h: 1, hRef: 10 },
  carburant: { q: 5, p: 0.5, h: 2, hRef: 3 },
  piscine: { q: 12, p: 0.8, h: 8, hRef: 1.5 },
};

/** Disposition des pompes conseillée par application (secours là où l'arrêt n'est pas acceptable). */
const PUMPS0: Record<AppId, { count: number; standby: number; alternate: boolean }> = {
  forage: { count: 1, standby: 0, alternate: false }, surpression: { count: 2, standby: 1, alternate: true }, irrigation: { count: 1, standby: 0, alternate: false },
  relevage: { count: 2, standby: 1, alternate: true }, drainage: { count: 1, standby: 0, alternate: false }, transfert: { count: 1, standby: 0, alternate: false },
  incendie: { count: 2, standby: 1, alternate: false }, carburant: { count: 1, standby: 0, alternate: false }, piscine: { count: 1, standby: 0, alternate: false },
};
const ARR: { v: string; l: string; d: string; count: number; standby: number; alternate: boolean }[] = [
  { v: '1', l: '1 pompe', d: 'Le plus simple et le moins cher ; arrêt total en cas de panne.', count: 1, standby: 0, alternate: false },
  { v: '1+1', l: '2 pompes : 1 en service + 1 de secours', d: 'Permutation automatique : usure partagée, la secours prend le relais en cas de panne.', count: 2, standby: 1, alternate: true },
  { v: '2', l: '2 pompes en parallèle', d: 'Débit partagé : chacune fait la moitié ; en cas de panne, demi-débit.', count: 2, standby: 0, alternate: true },
  { v: '2+1', l: '3 pompes : 2 en service + 1 de secours', d: 'Gros débits variables (immeubles, réseaux) ; aucune perte de débit en cas de panne.', count: 3, standby: 1, alternate: true },
];

/** Plus petit DN qui respecte la vitesse visée. */
export function dnFor(q: number, vmax: number) {
  return DN_LIST.find((d) => d >= 25 && vel(q, d) <= vmax) ?? DN_LIST[DN_LIST.length - 1];
}

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
  const q = Math.max(0.1, d.duty.qReq / nr);
  const hReq = Math.max(2, systemHeadAt(d, d.duty.qReq));
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

type StepId = 'projet' | 'pompe' | 'fluide' | 'besoin' | 'site' | 'tuyaux' | 'acc' | 'choix' | 'elec' | 'fin';
const STEPS: { id: StepId; t: string; q: string }[] = [
  { id: 'projet', t: 'Projet', q: 'Que voulez-vous faire ?' },
  { id: 'pompe', t: 'Type de pompe', q: 'Quelle pompe et comment est-elle posée ?' },
  { id: 'fluide', t: 'Liquide', q: 'Quel liquide allez-vous pomper ?' },
  { id: 'besoin', t: 'Besoin', q: 'Combien d\'eau, à quelle pression ?' },
  { id: 'site', t: 'Hauteurs', q: 'Où est l\'eau, où doit-elle arriver ?' },
  { id: 'tuyaux', t: 'Tuyaux', q: 'Quelles conduites ?' },
  { id: 'acc', t: 'Accessoires', q: 'Quels accessoires monter ?' },
  { id: 'choix', t: 'Pompe', q: 'La pompe qu\'il vous faut' },
  { id: 'elec', t: 'Électricité', q: 'Comment la pompe est-elle alimentée ?' },
  { id: 'fin', t: 'Résultat', q: 'Votre installation est prête' },
];

/** Croquis coté, adapté au montage : montre exactement à quoi correspond chaque hauteur saisie. */
function SiteSketch({ d }: { d: Installation }) {
  const g = d.geo;
  const forage = d.pumpType === 'immergee_forage';
  const T = ({ x, y, c, a = 'start' }: { x: number; y: number; c: string; a?: 'start' | 'end' | 'middle' }) => <text x={x} y={y} textAnchor={a} className="sk-t">{c}</text>;
  const Dim = ({ x, y1, y2, label, side = 'r' }: { x: number; y1: number; y2: number; label: string; side?: 'l' | 'r' }) => (
    <g className="sk-dim">
      <line x1={x} y1={y1} x2={x} y2={y2} markerStart="url(#skA)" markerEnd="url(#skA)" />
      <line x1={x - 5} y1={y1} x2={x + 5} y2={y1} /><line x1={x - 5} y1={y2} x2={x + 5} y2={y2} />
      <text x={side === 'r' ? x + 7 : x - 7} y={(y1 + y2) / 2 + 4} textAnchor={side === 'r' ? 'start' : 'end'} className="sk-v">{label}</text>
    </g>
  );
  const Pump = ({ x, y }: { x: number; y: number }) => <g><circle cx={x} cy={y} r={11} className="sk-pump" /><text x={x} y={y + 4} textAnchor="middle" className="sk-p">P</text></g>;
  let body;
  if (forage) {
    body = (
      <>
        <line x1={0} y1={62} x2={340} y2={62} className="sk-ground" />
        <rect x={130} y={62} width={26} height={146} className="sk-bore" />
        <rect x={131} y={112} width={24} height={96} className="sk-water" />
        <line x1={14} y1={92} x2={164} y2={92} className="sk-lvl" />
        <line x1={14} y1={112} x2={164} y2={112} className="sk-lvl" />
        <text x={14} y={88} className="sk-v">statique {fx(g.staticLevel)} m</text>
        <text x={14} y={108} className="sk-v">dynamique {fx(g.dynamicLevel)} m</text>
        <rect x={136} y={170} width={14} height={26} rx={3} className="sk-pump" />
        <path d="M143 170 V 52 H 252 V 38" className="sk-pipe" />
        <rect x={228} y={14} width={50} height={24} rx={3} className="sk-tank" />
        <path d="M236 38 L 232 62 M270 38 L 274 62" className="sk-pipe thin" />
        <Dim x={176} y1={62} y2={183} label={`pompe à ${fx(g.pumpDepth)} m`} />
        <Dim x={294} y1={62} y2={14} label={`${fx(g.hRef)} m`} />
        <T x={14} y={56} c="Sol (tête de forage)" />
        <T x={14} y={140} c="Profondeurs mesurées" />
        <T x={14} y={152} c="depuis le sol" />
      </>
    );
  } else if (d.mode === 'aspiration') {
    body = (
      <>
        <line x1={120} y1={124} x2={340} y2={124} className="sk-ground" />
        <rect x={14} y={150} width={96} height={56} className="sk-basin" />
        <rect x={15} y={166} width={94} height={39} className="sk-water" />
        <path d="M60 196 V 112 H 166" className="sk-pipe" />
        <path d="M184 112 H 296 V 28" className="sk-pipe" />
        <Pump x={175} y={112} />
        <Dim x={132} y1={166} y2={112} label={`aspiration ${fx(g.suctionLift)} m`} />
        <Dim x={318} y1={112} y2={28} label={`${fx(g.hRef)} m`} />
        <T x={226} y={20} c="Point de sortie" />
        <T x={18} y={144} c="Niveau le plus bas" />
      </>
    );
  } else if (d.mode === 'charge') {
    body = (
      <>
        <line x1={0} y1={184} x2={340} y2={184} className="sk-ground" />
        <rect x={14} y={40} width={96} height={80} className="sk-basin" />
        <rect x={15} y={70} width={94} height={49} className="sk-water" />
        <path d="M60 120 V 172 H 166" className="sk-pipe" />
        <path d="M184 172 H 296 V 28" className="sk-pipe" />
        <Pump x={175} y={172} />
        <Dim x={132} y1={70} y2={172} label={`charge ${fx(g.chargeHead)} m`} />
        <Dim x={318} y1={172} y2={28} label={`${fx(g.hRef)} m`} />
        <T x={226} y={20} c="Point de sortie" />
        <T x={16} y={34} c="Bâche (niveau le plus bas)" />
      </>
    );
  } else {
    body = (
      <>
        <line x1={0} y1={90} x2={340} y2={90} className="sk-ground" />
        <rect x={30} y={90} width={110} height={114} className="sk-basin" />
        <rect x={31} y={150} width={108} height={53} className="sk-water" />
        <rect x={74} y={180} width={22} height={22} rx={4} className="sk-pump" />
        <path d="M85 180 V 76 H 296 V 28" className="sk-pipe" />
        <Dim x={156} y1={150} y2={191} label={`eau ${fx(g.wetLevel)} m`} />
        <Dim x={318} y1={191} y2={28} label={`${fx(g.hRef)} m`} />
        <T x={226} y={20} c="Point de sortie" />
        <T x={34} y={84} c="Fosse / puisard" />
      </>
    );
  }
  return (
    <figure className="sketch">
      <svg viewBox="0 0 340 212" role="img" aria-label="Croquis des hauteurs">
        <defs><marker id="skA" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" className="sk-arrow" /></marker></defs>
        {body}
      </svg>
      <figcaption>Hauteur que la pompe doit vaincre : <b>{fx(staticHead(d))} m</b>{d.duty.pRes > 0 && <> + {fx(d.duty.pRes)} bar de pression à la sortie</>} (sans les frottements). Croquis non à l'échelle.</figcaption>
    </figure>
  );
}

function Cards<T extends string>({ items, value, onPick }: { items: { v: T; l: string; d?: string; dim?: boolean }[]; value: T; onPick: (v: T) => void }) {
  return (
    <div className="wz-cards">
      {items.map((it) => (
        <button key={it.v} type="button" className={`wz-card ${value === it.v ? 'on' : ''} ${it.dim ? 'dim' : ''}`} onClick={() => onPick(it.v)} aria-pressed={value === it.v}>
          <b>{it.l}</b>{it.d && <small>{it.d}</small>}
          {value === it.v && <Check size={18} className="wz-ok" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

const NEED_ORDER: Record<Need, number> = { required: 0, recommended: 1, avoid: 2, optional: 3, na: 9 };

export function Wizard({ onClose, onDone }: { onClose: () => void; onDone: (i: Installation) => void }) {
  const [k, setK] = useState(0);
  const [d, setD] = useState<Installation>(() => {
    const i = empty('forage');
    const z = DUTY0.forage;
    return { ...i, name: '', duty: { ...i.duty, qReq: z.q, pRes: z.p, hoursPerDay: z.h }, geo: { ...i.geo, hRef: z.hRef } };
  });
  const [floors, setFloors] = useState(5);
  const [poolM3, setPoolM3] = useState(50);
  const [dnManual, setDnManual] = useState(false);
  const [equipped, setEquipped] = useState(false);
  const [ownPump, setOwnPump] = useState(false);
  const [secManual, setSecManual] = useState(false);
  const set = (fn: (x: Installation) => Installation) => setD((x) => ensureElec(sanitizeAcc(fn(x))));
  const geo = (p: Partial<Installation['geo']>) => set((x) => ({ ...x, geo: { ...x.geo, ...p } }));
  const duty = (p: Partial<Installation['duty']>) => set((x) => ({ ...x, duty: { ...x.duty, ...p } }));
  const pump = (p: Partial<Installation['pump']>) => set((x) => ({ ...x, pump: { ...x.pump, ...p } }));
  const elec = (p: Partial<Installation['elec']>) => set((x) => ({ ...x, elec: { ...x.elec, ...p } }));
  const step = STEPS[k];
  const ev = useMemo(() => evaluate(d), [d]);
  const forage = d.pumpType === 'immergee_forage';
  const imm = d.mode === 'immergee';

  // DN conseillés : aspiration ≤ 1,2 m/s, refoulement ≤ 1,8 m/s
  const dnAsp = dnFor(d.duty.qReq, 1.2);
  const dnRef = dnFor(d.duty.qReq, forage ? 2 : 1.5);
  useEffect(() => {
    if (dnManual || step.id !== 'tuyaux') return;
    if (d.asp.dn !== dnAsp || d.ref.dn !== dnRef) set((x) => withPipe(withPipe(x, 'asp', dnAsp), 'ref', dnRef));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, dnAsp, dnRef, dnManual]);
  // Section de câble recalculée tant qu'on ne l'a pas forcée
  useEffect(() => {
    if (secManual || (step.id !== 'elec' && step.id !== 'fin')) return;
    if (ev.elec.secRec !== d.elec.cableSec) elec({ cableSec: ev.elec.secRec });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, ev.elec.secRec, secManual]);

  const pickApp = (a: AppId) => { setEquipped(false); setDnManual(false); set((x) => {
    const pt = APPS[a].pumps[0];
    const z = DUTY0[a];
    const base = empty(a);
    const mat: PipeMatId = a === 'carburant' ? 'acier' : a === 'forage' || a === 'relevage' ? 'pehd' : 'pvc';
    return { ...base, name: x.name, pumpType: pt, asp: { ...base.asp, material: mat === 'pehd' ? 'pvc' : mat, pn: mat === 'acier' ? 16 : 10 }, ref: { ...base.ref, material: mat, pn: mat === 'acier' ? 16 : 10 }, mode: PUMP_TYPES[pt].modes[0], fluid: makeFluid(APPS[a].fluid), duty: { ...base.duty, qReq: z.q, pRes: z.p, hoursPerDay: z.h }, geo: { ...base.geo, hRef: z.hRef }, pump: { ...base.pump, ...PUMPS0[a] } };
  }); };
  const pickPump = (pt: PumpTypeId) => { setEquipped(false); set((x) => ({ ...x, pumpType: pt, mode: PUMP_TYPES[pt].modes.includes(x.mode) ? x.mode : PUMP_TYPES[pt].modes[0] })); };
  const setStart = (st: StartId) => set((x) => ({ ...x, elec: { ...x.elec, start: st }, acc: { ...x.acc, variateur: { ...((x.acc.variateur as AccState | undefined) ?? { dn: 0, qty: 1 }), on: st === 'variateur' } } }));
  const setSupply = (v: SupplyId) => set((x) => ({
    ...x,
    elec: { ...x.elec, supply: v, voltage: v === 'mono' ? 230 : 400, start: v === 'solaire' ? 'variateur' : x.elec.start === 'variateur' && !x.acc.variateur?.on ? 'direct' : x.elec.start, solar: { ...x.elec.solar, dailyM3: Math.round(x.duty.qReq * x.duty.hoursPerDay), panels: 0 } },
    acc: v === 'solaire' ? { ...x.acc, variateur: { ...((x.acc.variateur as AccState | undefined) ?? { dn: 0, qty: 1 }), on: false } } : x.acc,
  }));

  const go = (n: number) => {
    const to = Math.max(0, Math.min(STEPS.length - 1, n));
    const id = STEPS[to].id;
    if (id === 'acc' && !equipped) {
      set((x) => {
        const e = autoEquip(x);
        // Variateur + capteur de pression remplacent le pressostat
        return e.acc.variateur?.on && e.acc.pressostat?.on ? { ...e, acc: { ...e.acc, pressostat: { ...e.acc.pressostat, on: false } } } : e;
      });
      setEquipped(true);
    }
    if (id === 'choix' && !ownPump) set((x) => proposePump(x));
    if (id === 'fin') set((x) => {
      // Les choix faits ensuite (variateur, plusieurs pompes…) peuvent rendre d'autres accessoires obligatoires
      const e = autoEquip(x, false);
      return e.acc.variateur?.on && e.acc.capteur_p?.on && e.acc.pressostat?.on ? { ...e, acc: { ...e.acc, pressostat: { ...e.acc.pressostat, on: false } } } : e;
    });
    if (id === 'elec' && to > k) {
      set((x) => {
        const len = forage ? Math.round(x.geo.pumpDepth + 15) : imm ? 20 : x.elec.cableLen;
        const sup: SupplyId = x.elec.supply === 'solaire' || x.elec.supply === 'groupe' ? x.elec.supply : x.pump.motorKw <= 2.2 && !forage ? 'mono' : 'tri';
        return { ...x, elec: { ...x.elec, cableLen: len, supply: sup, voltage: sup === 'mono' ? 230 : 400 } };
      });
    }
    setK(to);
    document.querySelector('.wz-body')?.scrollTo({ top: 0 });
  };

  const hReq = systemHeadAt(d, d.duty.qReq);
  const lvl = ev.verdict.level === 'excellent' || ev.verdict.level === 'good' ? 'ok' : ev.verdict.level === 'fair' ? 'warning' : 'critical';
  const h = ev.hydro;

  let content;
  switch (step.id) {
    case 'projet':
      content = (
        <>
          <TextField label="Nom du projet (facultatif)" value={d.name} onChange={(v) => setD((x) => ({ ...x, name: v }))} wide />
          <p className="wz-lead">Choisissez l'application. Tout le reste sera proposé en fonction de ce choix.</p>
          <Cards value={d.app} onPick={pickApp} items={(Object.keys(APPS) as AppId[]).map((a) => ({ v: a, l: APPS[a].label, d: APPS[a].desc }))} />
        </>
      );
      break;
    case 'pompe':
      content = (
        <>
          <p className="wz-lead">Pompes adaptées à « {APPS[d.app].label} » :</p>
          <Cards value={d.pumpType} onPick={pickPump} items={APPS[d.app].pumps.map((p) => ({ v: p, l: PUMP_TYPES[p].label, d: PUMP_TYPES[p].desc }))} />
          {PUMP_TYPES[d.pumpType].modes.length > 1 && (
            <>
              <p className="wz-lead">Où se trouve le liquide par rapport à la pompe ?</p>
              <Cards value={d.mode} onPick={(m: ModeId) => { setEquipped(false); set((x) => ({ ...x, mode: m })); }} items={PUMP_TYPES[d.pumpType].modes.map((m) => ({ v: m, l: MODES[m].label, d: MODES[m].desc }))} />
            </>
          )}
          {PUMP_TYPES[d.pumpType].modes.length === 1 && <p className="ihint">Montage : <b>{MODES[d.mode].label}</b> — {MODES[d.mode].desc}</p>}
        </>
      );
      break;
    case 'fluide': {
      const order = [APPS[d.app].fluid, ...(Object.keys(FLUIDS) as FluidId[]).filter((f) => f !== APPS[d.app].fluid)];
      content = (
        <>
          <Cards value={d.fluid.type} onPick={(f: FluidId) => { setEquipped(false); set((x) => ({ ...x, fluid: makeFluid(f) })); }} items={order.map((f) => ({ v: f, l: FLUIDS[f].label, d: FLUIDS[f].note }))} />
          <div className="igrid">
            <NumField label="Température du liquide" unit="°C" min={-10} value={d.fluid.temp} onChange={(t) => set((x) => ({ ...x, fluid: { ...x.fluid, temp: t, ...fluidAt(x.fluid.type, t) } }))} />
            {(forage || d.fluid.type === 'eau_brute') && <NumField label="Sable (si connu)" unit="g/m³" value={d.fluid.sandGm3} onChange={(v) => set((x) => ({ ...x, fluid: { ...x.fluid, sandGm3: v } }))} hint="Laissez la valeur si inconnue" />}
          </div>
        </>
      );
      break;
    }
    case 'besoin':
      content = (
        <>
          {d.app === 'piscine' && (
            <div className="wz-help">
              <NumField label="Volume du bassin" unit="m³" value={poolM3} onChange={(v) => { setPoolM3(v); duty({ qReq: Math.round((v / 4) * 10) / 10 }); }} hint="Débit = volume brassé en 4 heures" />
            </div>
          )}
          <div className="igrid">
            <NumField label="Débit nécessaire" unit="m³/h" value={d.duty.qReq} onChange={(v) => v > 0 && duty({ qReq: v })} hint={`= ${fx(d.duty.qReq / 3.6)} L/s · ${fx(d.duty.qReq * 1000 / 60, 0)} L/min`} />
            <NumField label="Pression voulue à la sortie" unit="bar" value={d.duty.pRes} onChange={(v) => duty({ pRes: v })}
              hint={d.app === 'irrigation' ? 'Asperseur 2,5–3,5 bar · goutte-à-goutte 1–1,5 bar' : d.app === 'surpression' ? 'Au robinet le plus haut : 1,5 à 2 bar' : d.app === 'incendie' ? 'RIA : 2,5 à 4 bar au plus défavorisé' : 'Écoulement libre dans un réservoir : 0 bar'} />
            <NumField label="Heures de marche par jour" unit="h/j" value={d.duty.hoursPerDay} onChange={(v) => duty({ hoursPerDay: Math.min(24, v) })} hint={`≈ ${fx(d.duty.qReq * d.duty.hoursPerDay, 0)} m³ par jour`} />
            <NumField label="Prix du kWh" unit={d.duty.currency} value={d.duty.pricePerKwh} onChange={(v) => duty({ pricePerKwh: v })} />
          </div>
          <p className="ihint">1 bar ≈ 10 m de hauteur d'eau. Le débit est celui que vous voulez obtenir réellement, pas celui de la plaque de la pompe.</p>
        </>
      );
      break;
    case 'site':
      content = (
        <>
          <SiteSketch d={d} />
          <div className="igrid">
            {d.app === 'surpression' && (
              <NumField label="Nombre d'étages au-dessus de la pompe" value={floors} onChange={(v) => { const f = Math.round(v); setFloors(f); geo({ hRef: f * 3 + 1.5 }); }} hint="≈ 3 m par étage + 1,5 m de robinet" wide />
            )}
            {forage && (
              <>
                <NumField label="Niveau statique (eau au repos)" unit="m" value={d.geo.staticLevel} onChange={(v) => geo({ staticLevel: v })} hint="Profondeur sous le sol" />
                <NumField label="Niveau dynamique (en pompage)" unit="m" value={d.geo.dynamicLevel} onChange={(v) => geo({ dynamicLevel: Math.max(v, d.geo.staticLevel) })} hint="Donné par l'essai de pompage" />
                <NumField label="Profondeur de pose de la pompe" unit="m" value={d.geo.pumpDepth} onChange={(v) => geo({ pumpDepth: v })} hint={`Conseillé : ${fx(d.geo.dynamicLevel + 10, 0)} m (dynamique + 10 m)`} />
                <NumField label="Profondeur du forage" unit="m" value={d.geo.boreDepth} onChange={(v) => geo({ boreDepth: v })} />
                <NumField label="Diamètre intérieur du forage" unit="mm" value={d.geo.boreDia} onChange={(v) => geo({ boreDia: v })} />
              </>
            )}
            {d.mode === 'aspiration' && <NumField label="Hauteur d'aspiration" unit="m" value={d.geo.suctionLift} onChange={(v) => geo({ suctionLift: v })} hint="Du niveau d'eau le plus bas jusqu'à l'axe de la pompe" wide />}
            {d.mode === 'charge' && <NumField label="Charge à l'aspiration" unit="m" value={d.geo.chargeHead} onChange={(v) => geo({ chargeHead: v })} hint="Du niveau le plus bas dans la bâche jusqu'à l'axe de la pompe (au-dessus)" wide />}
            {imm && !forage && (
              <>
                <NumField label="Eau au-dessus de la pompe à l'arrêt" unit="m" value={d.geo.wetLevel} onChange={(v) => geo({ wetLevel: v })} />
                <NumField label="Volume utile de la fosse" unit="L" value={d.geo.tankVolume} onChange={(v) => geo({ tankVolume: v })} />
              </>
            )}
            {d.app !== 'surpression' && (
              <NumField label={forage ? 'Hauteur de sortie au-dessus du sol' : 'Hauteur de sortie au-dessus de la pompe'} unit="m" min={-50} value={d.geo.hRef} onChange={(v) => geo({ hRef: v })}
                hint={forage ? 'Ex. : entrée du château d\'eau' : 'Point le plus haut où l\'eau doit arriver'} wide />
            )}
            <NumField label="Altitude du site" unit="m" value={d.geo.altitude} onChange={(v) => geo({ altitude: v })} hint="Influe sur l'aspiration" />
          </div>
        </>
      );
      break;
    case 'tuyaux': {
      const mats = (Object.keys(PIPE_MATS) as PipeMatId[]).map((m) => ({ v: m, l: PIPE_MATS[m].label }));
      const dnOpts = DN_LIST.map((x) => ({ v: x, l: `DN${x}` }));
      const run = (side: 'asp' | 'ref') => (
        <div className="wz-pipe">
          <h4>{side === 'asp' ? 'Aspiration (de l\'eau à la pompe)' : forage ? 'Refoulement (de la tête de forage à la sortie)' : 'Refoulement (de la pompe à la sortie)'}</h4>
          <div className="igrid">
            <SelField label="Matériau" value={d[side].material} options={mats} wide onChange={(v) => set((x) => ({ ...x, [side]: { ...x[side], material: v } }))} />
            <NumField label="Longueur" unit="m" value={d[side].length} onChange={(v) => set((x) => ({ ...x, [side]: { ...x[side], length: v } }))} hint={forage && side === 'ref' ? `+ ${fx(d.geo.pumpDepth)} m de colonne ajoutés` : undefined} />
            <NumField label="Coudes à 90°" value={d[side].elbows} onChange={(v) => set((x) => ({ ...x, [side]: { ...x[side], elbows: Math.round(v) } }))} />
            <SelField label="Diamètre" value={d[side].dn} options={dnOpts} onChange={(v) => { setDnManual(true); set((x) => withPipe(x, side, v)); }} />
            <SelField label="Pression nominale" value={d[side].pn} options={[6, 10, 16, 25].map((p) => ({ v: p, l: `PN${p}` }))} onChange={(v) => set((x) => ({ ...x, [side]: { ...x[side], pn: v } }))} />
          </div>
          <p className="ihint">Vitesse : <b>{fx(vel(d.duty.qReq, d[side].dn), 2)} m/s</b> · conseillé DN{side === 'asp' ? dnAsp : dnRef} ({side === 'asp' ? '≤ 1,2' : forage ? '≤ 2' : '≤ 1,5'} m/s)</p>
        </div>
      );
      content = (
        <>
          <p className="wz-lead">Les diamètres sont calculés automatiquement à partir du débit ({fx(d.duty.qReq)} m³/h). Vous pouvez les changer.</p>
          {!imm && run('asp')}
          {run('ref')}
          {dnManual && <button type="button" className="btn" onClick={() => setDnManual(false)}><Wand2 size={15} aria-hidden /> Revenir aux diamètres conseillés</button>}
        </>
      );
      break;
    }
    case 'acc': {
      const groups: { side: 'asp' | 'ref' | 'ctrl'; title: string }[] = [
        ...(imm ? [] : [{ side: 'asp' as const, title: 'Côté aspiration' }]),
        { side: 'ref', title: 'Côté refoulement' },
        { side: 'ctrl', title: 'Commande et protection' },
      ];
      content = (
        <>
          <p className="wz-lead">Les accessoires <b>requis</b> et <b>conseillés</b> sont déjà cochés, au bon diamètre. Décochez ce que vous ne voulez pas.</p>
          {groups.map((g) => (
            <div key={g.side} className="iacc-group">
              <h4>{g.title}</h4>
              {ACCESSORIES.filter((a) => a.side === g.side && ev.needs[a.id] !== 'na')
                .sort((a, b) => NEED_ORDER[ev.needs[a.id]] - NEED_ORDER[ev.needs[b.id]])
                .map((a) => {
                  const on = !!d.acc[a.id]?.on;
                  const n = ev.needs[a.id];
                  return (
                    <div key={a.id} className={`iacc ${on ? 'on' : ''} need-${n} ${n === 'required' && !on ? 'missing' : ''}`}>
                      <label className="iacc-main">
                        <input type="checkbox" checked={on} onChange={(e) => set((x) => ({ ...x, acc: { ...x.acc, [a.id]: { dn: a.inline ? (a.side === 'asp' ? x.asp.dn : x.ref.dn) : 0, qty: 1, ...((x.acc[a.id] as AccState | undefined) ?? {}), on: e.target.checked } } }))} />
                        <span><b>{a.label}</b><small>{a.desc}</small></span>
                        {NEED_LABEL[n] && <em className={`need ${n}`}>{NEED_LABEL[n]}</em>}
                      </label>
                      {on && <p className="iacc-pos"><MapPin size={13} aria-hidden /> <span>{posAdvice(a.id, d)}</span></p>}
                    </div>
                  );
                })}
            </div>
          ))}
        </>
      );
      break;
    }
    case 'choix':
      content = (
        <>
          <div className="wz-need">
            <div><small>Débit voulu</small><b>{fx(d.duty.qReq)} m³/h</b></div>
            <div><small>Hauteur totale à fournir</small><b>{fx(hReq)} m</b></div>
          </div>
          <p className="ihint">Hauteur totale = {fx(staticHead(d))} m à monter + {fx(d.duty.pRes * 10.2)} m de pression + {fx(hReq - staticHead(d) - d.duty.pRes * 1e5 / (d.fluid.rho * 9.81))} m de frottements (tuyaux et accessoires).</p>
          {!forage && (
            <>
              <p className="wz-lead">Combien de pompes ?</p>
              <Cards value={ARR.find((a) => a.count === (d.pump.count ?? 1) && a.standby === (d.pump.standby ?? 0))?.v ?? '1'}
                onPick={(v: string) => { const a = ARR.find((x) => x.v === v)!; set((x) => { const y = { ...x, pump: { ...x.pump, count: a.count, standby: a.standby, alternate: a.alternate } }; return ownPump ? y : proposePump(y); }); }}
                items={ARR.map((a) => ({ v: a.v, l: a.l, d: a.d }))} />
            </>
          )}
          <div className="wz-seg">
            <button type="button" aria-pressed={!ownPump} onClick={() => { setOwnPump(false); set((x) => proposePump(x)); }}>Proposez-moi une pompe</button>
            <button type="button" aria-pressed={ownPump} onClick={() => setOwnPump(true)}>J'ai déjà ma pompe</button>
          </div>
          {!ownPump && (
            <div className="wz-prop">
              <b>{(d.pump.count ?? 1) > 1 ? `${d.pump.count} pompes identiques à rechercher (caractéristiques d'une pompe)` : 'Pompe à rechercher'}</b>
              <span>{PUMP_TYPES[d.pumpType].label}</span>
              <span className="big">{fx(d.pump.qn)} m³/h à {fx(d.pump.hn, 0)} m</span>
              <span>Moteur {fx(d.pump.motorKw, 2)} kW · rendement visé ≈ {Math.round(d.pump.eta * 100)} %{forage ? ` · ${d.pump.diameterMm <= 100 ? '4"' : '6"'}` : ''}</span>
              <small>Choisissez une pompe dont la courbe passe par ce point (ou légèrement au-dessus), le plus près possible de son meilleur rendement.</small>
            </div>
          )}
          {ownPump && (
            <div className="igrid">
              <p className="ihint wide">Recopiez la plaque ou la fiche constructeur (point de meilleur rendement).</p>
              <NumField label="Débit nominal" unit="m³/h" value={d.pump.qn} onChange={(v) => v > 0 && pump({ qn: v })} />
              <NumField label="Hauteur nominale" unit="m" value={d.pump.hn} onChange={(v) => v > 0 && pump({ hn: v })} />
              <NumField label="Puissance moteur" unit="kW" value={d.pump.motorKw} onChange={(v) => v > 0 && pump({ motorKw: v })} />
              <NumField label="Rendement" unit="%" value={Math.round(d.pump.eta * 100)} onChange={(v) => v > 0 && pump({ eta: Math.min(0.92, v / 100) })} />
            </div>
          )}
          <div className={`wz-op lv-${h.ok && Math.abs(h.x - 1) < 0.25 ? 'ok' : 'warning'}`}>
            <b>Point de fonctionnement prévu</b>
            {h.ok ? <span>{fx(h.q)} m³/h à {fx(h.h)} m — {fx((h.q / d.duty.qReq) * 100, 0)} % du besoin, {fx(h.x * 100, 0)} % du débit nominal de la pompe.</span> : <span>La pompe n'atteint pas la hauteur nécessaire : elle ne débitera pas.</span>}
          </div>
        </>
      );
      break;
    case 'elec': {
      const solar = d.elec.supply === 'solaire';
      content = (
        <>
          <Cards value={d.elec.supply} onPick={setSupply} items={(Object.keys(SUPPLY_LABEL) as SupplyId[]).map((s) => ({ v: s, l: SUPPLY_LABEL[s], dim: s === 'mono' && d.pump.motorKw > 2.2, d: s === 'mono' && d.pump.motorKw > 2.2 ? 'Déconseillé au-delà de 2,2 kW' : undefined }))} />
          <div className="igrid">
            {!solar && (
              <div className="wide">
                <p className="wz-lead">Comment la pompe démarre-t-elle ?</p>
                <Cards value={(d.acc.variateur?.on ? 'variateur' : d.elec.start === 'variateur' ? 'direct' : d.elec.start) as StartId} onPick={setStart}
                  items={(['direct', 'progressif', 'variateur', 'etoile'] as StartId[]).filter((st) => st !== 'etoile' || (d.elec.supply !== 'mono' && d.pump.motorKw >= 5.5)).map((st) => ({
                    v: st, l: START_LABEL[st],
                    d: st === 'direct' ? (d.pump.motorKw > 7.5 ? 'Déconseillé au-delà de 7,5 kW (pointe de courant, coups de bélier)' : 'Simple et économique pour les petits moteurs')
                      : st === 'progressif' ? 'Démarrage et arrêt doux : moins de coups de bélier'
                        : st === 'variateur' ? (d.app === 'surpression' || d.app === 'irrigation' ? 'Conseillé ici : pression constante, économies d\'énergie' : 'Vitesse réglable, démarrage doux, économies')
                          : 'Pour les gros moteurs triphasés (≥ 5,5 kW)',
                    dim: st === 'direct' && d.pump.motorKw > 7.5,
                  }))} />
              </div>
            )}
            <NumField label="Longueur de câble coffret → moteur" unit="m" value={d.elec.cableLen} onChange={(v) => elec({ cableLen: v })} wide hint={forage ? 'Profondeur de pose + trajet jusqu\'au coffret' : undefined} />
            {d.elec.supply === 'groupe' && <NumField label="Groupe électrogène installé" unit="kVA" value={d.elec.genKva} onChange={(v) => elec({ genKva: v })} hint={`Conseillé : ${ev.elec.genKva} kVA`} wide />}
            {solar && (
              <>
                <NumField label="Eau nécessaire par jour" unit="m³/j" value={d.elec.solar.dailyM3} onChange={(v) => v > 0 && set((x) => ({ ...x, elec: { ...x.elec, solar: { ...x.elec.solar, dailyM3: v } } }))} />
                <NumField label="Ensoleillement" unit="kWh/m²/j" value={d.elec.solar.psh} onChange={(v) => v > 0 && set((x) => ({ ...x, elec: { ...x.elec, solar: { ...x.elec.solar, psh: v } } }))} hint="Afrique de l'Ouest : 5 à 6" />
                <NumField label="Puissance d'un panneau" unit="Wc" value={d.elec.solar.panelWc} onChange={(v) => v > 0 && set((x) => ({ ...x, elec: { ...x.elec, solar: { ...x.elec.solar, panelWc: v } } }))} />
              </>
            )}
          </div>
          <div className="wz-calc">
            <span>Courant moteur <b>{fx(ev.elec.inom)} A</b> · au démarrage ≈ <b>{fx(ev.elec.istart, 0)} A</b></span>
            <span>Câble : <b>{ev.elec.cores} {fx(d.elec.cableSec)} mm²</b> ({secManual ? 'choisi' : 'calculé'}) · chute de tension {fx(ev.elec.dropRun)} %</span>
            <span>{ev.elec.breaker}</span>
            {solar && ev.elec.solar && <span>Solaire : <b>{ev.elec.solar.n} panneaux</b> ({ev.elec.solar.ns} en série × {ev.elec.solar.np}) = {fx(ev.elec.solar.wc / 1000, 2)} kWc</span>}
            {d.acc.variateur?.on && <span>Variateur {fx(ev.elec.vfdKw)} kW{ev.elec.filter ? ` + ${ev.elec.filter}` : ''}</span>}
            <div className="row">
              <SelField label="Changer la section" value={d.elec.cableSec} options={[1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120].map((x) => ({ v: x, l: `${fx(x)} mm²${x === ev.elec.secRec ? ' (conseillé)' : ''}` }))} onChange={(v) => { setSecManual(v !== ev.elec.secRec); elec({ cableSec: v }); }} />
            </div>
          </div>
          {solar && <p className="ihint">Vous pourrez ensuite charger l'ensoleillement réel de votre site, mois par mois (bouton GPS), dans Conception → Électricité.</p>}
        </>
      );
      break;
    }
    case 'fin': {
      const top = ev.issues.filter((x) => x.sev !== 'info').sort((a, b) => (a.sev === b.sev ? 0 : a.sev === 'critical' ? -1 : 1)).slice(0, 6);
      content = (
        <>
          <div className="wz-score">
            <HealthRing score={ev.score} level={lvl} size={84} />
            <div><b className={`lv-${lvl}`}>{ev.verdict.label}</b><p className="small muted">{ev.verdict.text}</p></div>
          </div>
          <div className="wz-need four">
            <div><small>Débit obtenu</small><b>{h.ok ? `${fx(h.q)} m³/h` : '—'}</b></div>
            <div><small>Hauteur</small><b>{h.ok ? `${fx(h.h, 0)} m` : '—'}</b></div>
            <div><small>Puissance absorbée</small><b>{fx(h.pElec, 2)} kW</b></div>
            {d.elec.supply === 'solaire' && ev.elec.solar
              ? <div><small>Panneaux solaires</small><b>{ev.elec.solar.n} × {d.elec.solar.panelWc} Wc</b></div>
              : <div><small>Électricité / an</small><b>{fx(h.costYear / 1000, 0)} k {d.duty.currency}</b></div>}
          </div>
          {top.length > 0 ? (
            <>
              <h4 className="isub">À corriger avant de valider</h4>
              <ul className="wz-issues">
                {top.map((x) => (
                  <li key={x.id} className={`lv-${x.sev}`}>
                    <LevelIcon level={x.sev} />
                    <span><b>{x.title}</b><small>{x.solutions[0]}</small></span>
                    {x.fix && <button type="button" className="btn sm primary" onClick={() => set((i) => x.fix!.apply(i))}>{x.fix.label}</button>}
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="wz-good"><Check size={18} aria-hidden /> Aucune alerte importante.</p>}
          <p className="ihint">En validant, vous retrouvez l'installation dans Conception (vue réelle, P&ID), et pouvez la simuler, l'éditer et l'imprimer.</p>
        </>
      );
      break;
    }
  }

  return (
    <div className="wz" role="dialog" aria-modal aria-label="Conception guidée">
      <header className="wz-head">
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Quitter l'assistant"><X size={20} /></button>
        <div className="wz-title"><small>Étape {k + 1} sur {STEPS.length} · {step.t}</small><h2>{step.q}</h2></div>
        {k >= 6 && <span className={`scorechip lv-${lvl}`}>{ev.score}<small>/100</small></span>}
      </header>
      <div className="wz-bar" aria-hidden><i style={{ width: `${((k + 1) / STEPS.length) * 100}%` }} /></div>
      <nav className="wz-steps" aria-label="Étapes">
        {STEPS.map((s, n) => (
          <button key={s.id} type="button" className={n === k ? 'on' : n < k ? 'done' : ''} disabled={n > k} onClick={() => go(n)}>{n < k ? <Check size={12} aria-hidden /> : n + 1} {s.t}</button>
        ))}
      </nav>
      <div className="wz-body">{content}</div>
      <footer className="wz-foot">
        <button type="button" className="btn wz-btn" disabled={k === 0} onClick={() => go(k - 1)}><ArrowLeft size={18} aria-hidden /> Précédent</button>
        {step.id !== 'fin'
          ? <button type="button" className="btn primary wz-btn" onClick={() => go(k + 1)}>Suivant <ArrowRight size={18} aria-hidden /></button>
          : <button type="button" className="btn primary wz-btn" onClick={() => onDone(touch({ ...d, name: d.name.trim() || `${APPS[d.app].label} — ${fx(d.duty.qReq)} m³/h` }, trackedFields(d).map((x) => x.key)))}><Check size={18} aria-hidden /> Valider l'installation</button>}
      </footer>
    </div>
  );
}
