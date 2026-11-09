import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertOctagon, Droplets, Gauge, Pause, Play, Power, RotateCcw, Thermometer, Timer, Zap } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { evaluate } from '../evaluate';
import { KIND_LABEL, NO_MODS, SERIES_LABEL, applyMods, clock, initSim, liveReadings, makeCtx, observe, progressiveWear, pumpReason, relaySetting, simKind, stepSim, type Mods, type SimState } from '../sim';
import { FAULTS, SYM_LABEL, SYM_WEIGHT, faultById } from '../faults';
import { FaultPanel, type Mystery } from './Faults';
import { LevelIcon } from '../../ui/Status';
import { fmt, money, useChartColors } from '../../ui/util';
import { DiagramPanel } from './DiagramPanel';
import type { Shared } from './Pages';
import type { AccState, Installation } from '../types';
import type { Evaluation } from '../evaluate';

/* ============================ Simulation ============================ */
function Slider({ label, value, min, max, step = 1, unit, onChange, disabled, hint }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void; disabled?: boolean; hint?: string }) {
  return (
    <label className={`slider${disabled ? ' dis' : ''}`}>
      <span className="sl-top"><span>{label}</span><b>{fmt(value, step < 1 ? 1 : 0)} {unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

/** Ce que la simulation partage avec la page Conception (vue réelle en direct). */
export interface LiveShare { live: NonNullable<Parameters<typeof DiagramPanel>[0]['live']>; i: Installation; ev: Evaluation; playing: boolean; setPlaying: (b: boolean) => void; clock: string; rate: number }

export function SimPage({ s, visible = true, onLive }: { s: Shared; visible?: boolean; onLive?: (x: LiveShare) => void }) {
  const c = useChartColors();
  // Variateur à fréquence fixe : la simulation démarre à la consigne calculée. En régulation automatique
  // (capteur de pression, solaire), c'est la régulation qui fixe la vitesse : on part de 100 %.
  const autoReg = ['vfd', 'solar'].includes(simKind(s.inst));
  const baseSpeed = !autoReg && s.ev.elec.vfdSpeed ? Math.round(s.ev.elec.vfdSpeed.s * 100) : 100;
  // Réseau incendie : aucune consommation tant qu'on n'ouvre pas une lance
  const fire = s.inst.app === 'incendie';
  const [mods, setMods] = useState<Mods>(() => ({ ...NO_MODS, speed: baseSpeed, draw: fire ? 0 : -1 }));
  // Pompe isolée après un défaut : la secours prend le relais, ou l'installation tourne avec une pompe de moins
  const [iso, setIso] = useState(false);
  // Pannes qui s'aggravent (usure, ensablement) : usure ajoutée par paliers de 5 %
  const [faultT, setFaultT] = useState<Record<string, number>>({});
  const [simT, setSimT] = useState(0);
  const prog = Math.round(progressiveWear(mods.faults, faultT, simT) / 5) * 5;
  const iView = useMemo(() => applyMods(s.inst, prog ? { ...mods, wear: Math.min(90, mods.wear + prog) } : mods), [s.inst, mods, prog]); // affichage : toutes les pompes
  const iSim = useMemo(() => {
    const x = iView;
    if (!iso) return x;
    const c = Math.max(1, x.pump.count ?? 1), sb = Math.max(0, x.pump.standby ?? 0);
    return { ...x, pump: { ...x.pump, ...(sb > 0 ? { standby: sb - 1, count: c - 1 } : { count: Math.max(1, c - 1) }) } };
  }, [iView, iso]);
  const ctx = useMemo(() => makeCtx(iSim, mods.draw, mods.faults), [iSim, mods.draw, mods.faults]);
  // Même installation sans panne : référence pour reconnaître les symptômes
  const nctx = useMemo(() => makeCtx(applyMods(s.inst, { ...mods, faults: [] }), mods.draw), [s.inst, mods]);
  const [mystery, setMystery] = useState<Mystery | null>(null);
  const evSim = useMemo(() => evaluate(iSim), [iSim]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [sim, setSim] = useState<SimState>(() => initSim(ctx));
  const simHour = Math.floor(sim.t / 900);
  useEffect(() => { setSimT(simHour * 900); }, [simHour]);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(600);
  useEffect(() => { setIso(!!sim.isolated); }, [sim.isolated]);

  // Avec un variateur réglé sur le besoin, la simulation démarre à sa fréquence de consigne, pas à 50 Hz.
  const base: Mods = { ...NO_MODS, speed: baseSpeed, draw: fire ? 0 : -1 };
  useEffect(() => { setSim(initSim(makeCtx(applyMods(s.inst, base)))); setMods(base); setMystery(null); }, [s.inst]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setSim((st) => stepSim(ctxRef.current, st, rate * 0.5)), 500);
    return () => window.clearInterval(id);
  }, [playing, rate]);

  const kind = ctx.kind;
  // Cycles courts (fosse, pressostat) : vitesse lente par défaut pour voir l'eau et les flotteurs bouger
  useEffect(() => { setRate(kind === 'pit' || kind === 'vessel' ? 60 : 600); }, [kind]);
  const r = liveReadings(ctx, sim);
  const obs = observe(ctx, nctx, sim);
  const note = (sev: 'info' | 'warning' | 'critical' | 'ok', text: string, target?: string) => (st: SimState): SimState => ({ ...st, events: [{ t: st.t, sev, text, target }, ...st.events].slice(0, 80) });
  const cleared = (st: SimState): SimState => ({ ...st, burnt: false, sealGone: false, burst: null, fatigue: 0, cavT: 0, relay: 0, tm: undefined, tl: undefined, flags: {}, isolated: null, trip: null, tripKind: null, bkLatch: null, bkLowT: 0, recent: {}, primed: true, dd: 0, runaway: false, blocked: false, hum: false, noFlow: false, aqDry: false, on: false });
  // La panne apparaît : chrono de déclenchement remis à zéro ; un moteur qui ne peut plus démarrer
  // s'arrête (micro-coupure) et retente aussitôt de démarrer.
  const inject = (st: SimState, e: NonNullable<ReturnType<typeof faultById>>['effect']): SimState => ({
    ...st, runT: 0, outageUntil: e.outage ? st.t + e.outage : st.outageUntil,
    on: e.noStart || e.tripAtStart ? false : st.on, hum: false,
  });
  const toggleFault = (id: string) => {
    const f = faultById(id);
    if (!f) return;
    if (mods.faults.includes(id)) { repair(id); return; }
    setMods((m) => ({ ...m, faults: [...m.faults, id] }));
    setFaultT((ft) => ({ ...ft, [id]: sim.t }));
    setSim((st) => note('warning', `Panne provoquée : ${f.label}`, f.target)(inject({ ...st, faultT: { ...(st.faultT ?? {}), [id]: st.t } }, f.effect)));
  };
  const repair = (id: string) => {
    const f = faultById(id);
    setMods((m) => ({ ...m, faults: m.faults.filter((x) => x !== id) }));
    setFaultT((ft) => { const n = { ...ft }; delete n[id]; return n; });
    setSim((st) => note('ok', `Réparé : ${f?.label ?? id} — installation réarmée`)(cleared({ ...st, outageUntil: f?.effect.outage ? 0 : st.outageUntil })));
  };
  const repairAll = () => {
    setMods((m) => ({ ...m, faults: [] }));
    setMystery(null);
    setFaultT({});
    setSim((st) => note('ok', 'Toutes les pannes réparées, protections réarmées')(cleared({ ...st, outageUntil: 0 })));
  };
  const rearm = () => setSim((st) => note('info', 'Protection réarmée par l\'opérateur', 'cable')({ ...st, isolated: null, trip: null, tripKind: null, bkLatch: null, bkLowT: 0, recent: { ...st.recent, decl_thermique: undefined, decl_diff: undefined, decl_manque_eau: undefined, decl_sous_charge: undefined, decl_variateur: undefined } }));
  const startMystery = () => {
    const cands = FAULTS.filter((f) => f.applies(iSim, kind) && !mods.faults.includes(f.id));
    if (!cands.length) return;
    const f = cands[Math.floor(Math.random() * cands.length)];
    // Leurres : de préférence des pannes aux symptômes voisins
    const others = cands.filter((x) => x.id !== f.id).map((x) => ({ x, k: x.sig.filter((y) => f.sig.includes(y)).length + Math.random() })).sort((a, b) => b.k - a.k).slice(0, 3).map((o) => o.x.id);
    const options = [f.id, ...others].sort(() => Math.random() - 0.5);
    setMystery({ id: f.id, answer: null, options });
    setMods((m) => ({ ...m, faults: [...m.faults, f.id] }));
    setFaultT((ft) => ({ ...ft, [f.id]: sim.t }));
    setSim((st) => note('warning', 'Anomalie signalée par l\'exploitant : une panne s\'est produite. À vous de la diagnostiquer.')(inject({ ...st, faultT: { ...(st.faultT ?? {}), [f.id]: st.t } }, f.effect)));
    setPlaying(true);
  };
  const hasVfd = s.inst.acc.variateur?.on || s.inst.elec.supply === 'solaire';
  const vRes = ctx.er.vessel;
  const vf = vRes && (kind === 'vessel' || kind === 'vfd') ? Math.max(0, 1 - (vRes.pre + 1) / (Math.max(sim.x, vRes.pre) + 1)) : undefined;
  const vesFill = vf == null ? undefined : ctx.fx.vesselK ? 1 - (1 - vf) * ctx.fx.vesselK : vf;
  const cNow = sim.series.at(-1)?.c ?? 0;
  const useRel = kind === 'vessel' || kind === 'vfd' ? cNow / Math.max(0.1, s.inst.duty.qReq) : kind === 'tank' ? cNow / Math.max(0.1, s.inst.duty.qReq * 0.55) : sim.on ? 0.6 : 0;
  const phys = { tmCause: sim.tmCause, relaySet: relaySetting(ctx), tm: sim.tm ?? s.inst.fluid.temp, tl: sim.tl ?? s.inst.fluid.temp, relay: sim.relay ?? 0, pPeak: sim.pPeak, peakAge: sim.pPeakT != null ? sim.t - sim.pPeakT : undefined, burst: sim.burst ?? null, burnt: !!sim.burnt, sealGone: !!sim.sealGone };
  const why = sim.master ? pumpReason(ctx, sim) : null;
  const live = { why, bk: sim.bk, bkFeed: !!sim.bkFeed, bkFill: !!sim.bkFill, bkOpen: !!sim.bkOpen, circOnly: !!sim.circOnly, jk: !!sim.jk, clog: sim.clog ?? 0, lvl: ctx.i.pumpType === 'immergee_forage' ? ctx.i.geo.staticLevel + (sim.aqS ?? 0) + sim.dd : undefined, bkQ: sim.bkQ ?? 0, bkLatch: sim.bkLatch ?? null, lowLevel: !!sim.lowLevel, phys, overflow: sim.overflow, backDrop: sim.backDrop, syms: obs, runTot: sim.runTot ?? 0, startLog: sim.startLog, simT: sim.t, use: useRel, inflow: kind === 'pit' ? cNow : 0, isolated: !!sim.isolated, faults: mods.faults, powered: sim.t >= sim.outageUntil, runaway: sim.runaway, dd: sim.dd, trip: sim.trip, tripKind: sim.tripKind, hum: sim.hum, noFlow: sim.noFlow, vesFill, floatPit: ctx.fx.floatPit, floatRes: ctx.fx.floatRes, on: sim.on, r, kind, x: sim.x, pv: kind === 'solar' ? sim.pv : undefined, clock: clock(sim.t), events: sim.events, starts: sim.starts, vol: sim.vol, kwh: sim.kwh, hz: kind === 'vfd' || kind === 'solar' ? sim.s * 50 : hasVfd ? (mods.speed / 100) * 50 : undefined };
  // Vue réelle de la page Conception : la même simulation, en direct
  useEffect(() => { onLive?.({ live, i: iView, ev: evSim, playing, setPlaying, clock: clock(sim.t), rate }); }, [sim, iView, evSim, playing, rate]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => setSim((st) => stepSim(ctx, { ...st, master: !st.master }, 5));
  const reset = () => { setFaultT({}); setMods(base); setMystery(null); setSim(initSim(makeCtx(applyMods(s.inst, base)))); };
  const hours = Math.max(0.01, (sim.t - 6 * 3600) / 3600);
  const sl = SERIES_LABEL[kind];
  const data = sim.series.map((p) => ({ ...p, label: clock(p.t).slice(3) }));
  const hasFilter = ['clapet_pied', 'crepine', 'filtre_asp', 'prefiltre'].some((k) => s.inst.acc[k]?.on);
  const v = ctx.er.vessel;
  const liveIssues = evSim.issues.filter((x) => x.sev !== 'info');
  // Note en service : la note de l'installation dans les conditions simulées, moins les symptômes de panne en cours
  const penalty = Math.min(90, obs.reduce((a, x) => a + SYM_WEIGHT[x], 0));
  const liveScore = Math.max(0, Math.round(evSim.score - penalty));
  const liveLvl = liveScore >= 75 ? 'ok' : liveScore >= 50 ? 'warning' : 'critical';
  const scen: { l: string; m: Partial<Mods>; stop?: boolean }[] = [
    { l: 'Vanne presque fermée', m: { valve: 15 } }, { l: 'Filtre colmaté', m: { clog: 85 } }, { l: 'Niveau très bas', m: { level: -2.5 } },
    { l: 'Pompe usée', m: { wear: 70 } },
  ];

  if (!visible) return null; // la simulation continue de tourner pour la vue réelle de la page Conception
  return (
    <div className="page-sim">
      <aside className="sim-side">
        <section className="card simctl">
          <button className={`power ${sim.trip ? 'fault' : sim.master ? 'on' : 'off'}`} onClick={toggle} aria-pressed={sim.master}>
            <Power size={26} aria-hidden />
            <span><b>{sim.master ? 'EN MARCHE' : 'À L\'ARRÊT'}</b><small>{sim.trip ? 'DÉFAUT — protection déclenchée' : sim.t < sim.outageUntil ? 'coupure secteur' : sim.master ? (sim.on ? (sim.hum ? 'moteur bloqué !' : sim.noFlow ? 'tourne sans débit !' : 'la pompe tourne') : 'arrêtée par l\'automatisme') : 'cliquez pour démarrer'}</small></span>
          </button>
          {why && <p className={`why-run${/ANORMALE/.test(why) ? ' bad' : ''}`}><b>Pourquoi ?</b> {why.charAt(0).toUpperCase() + why.slice(1)}</p>}
          {fire && (
            <button type="button" className={`btn full firebtn ${mods.draw > 0 ? 'on' : ''}`} onClick={() => setMods({ ...mods, draw: mods.draw > 0 ? 0 : 100 })}>
              {mods.draw > 0 ? '🧯 Fermer la lance (fin de l\'incendie)' : '🔥 Déclencher un incendie (ouvrir la lance)'}
            </button>
          )}
          <p className="muted small">{KIND_LABEL[kind]}</p>
          <div className="timebar">
            <button className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Lecture'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
            <span className="clockbig"><Timer size={15} aria-hidden /> {clock(sim.t)}</span>
            <div className="seg">{[60, 600, 3600].map((x) => <button key={x} aria-pressed={rate === x} onClick={() => setRate(x)}>{x === 60 ? '1 min/s' : x === 600 ? '10 min/s' : '1 h/s'}</button>)}</div>
          </div>
        </section>

        <section className="card">
          <h3>Réglages en direct</h3>
          {(kind === 'vessel' || kind === 'vfd' || kind === 'tank' || kind === 'pit') && (
            <div className="drawctl">
              <Slider label={kind === 'pit' ? 'Arrivée d\'effluents' : fire ? 'Lances incendie ouvertes (débit)' : 'Consommation (robinets ouverts)'} value={mods.draw < 0 ? Math.round((sim.series.at(-1)?.c ?? 0) / Math.max(0.01, kind === 'pit' ? ctx.h.q * 0.55 : kind === 'tank' ? s.inst.duty.qReq * 0.55 : s.inst.duty.qReq) * 100) : mods.draw} min={0} max={150} unit="%"
                onChange={(x) => setMods({ ...mods, draw: x })}
                hint={mods.draw < 0
                  ? `Automatique : suit l'heure de la journée (pointes à 7 h et 19 h30, très faible la nuit)${kind === 'vessel' || kind === 'vfd' ? ` — ${fmt(sim.series.at(-1)?.c ?? 0, 1)} m³/h en ce moment` : ''}`
                  : `Imposée : ${fmt((mods.draw / 100) * s.inst.duty.qReq, 1)} m³/h (${mods.draw} % du besoin)`} />
              <button type="button" className={`chip ${mods.draw < 0 ? 'on' : ''}`} onClick={() => setMods({ ...mods, draw: -1 })}>Profil automatique</button>
            </div>
          )}
          {(kind === 'vessel' || kind === 'vfd') && <p className="small muted simnote">En surpression, c'est la <b>consommation</b> qui fixe le débit, pas la vanne : la pompe ne fournit que ce que les robinets prélèvent. Ouvrir la vanne ne fait pas couler plus d'eau.</p>}
          <Slider label="Ouverture vanne de refoulement" value={mods.valve} min={5} max={100} unit="%" onChange={(x) => setMods({ ...mods, valve: x })} />
          {mods.faults.includes('vanne_fermee') && <p className="small cfg-warn">Panne en cours : la vanne de refoulement est fermée (0 %), ce réglage est sans effet tant que la panne n'est pas réparée.</p>}
          {kind === 'vfd' || kind === 'solar'
            ? <Slider label="Vitesse (variateur)" value={sim.on ? Math.round(sim.s * 100) : 0} min={0} max={100} unit="%" disabled onChange={() => undefined}
                hint={kind === 'vfd' ? `Automatique : réglée par le capteur de pression — ${sim.on ? `${fmt(sim.s * 50, 1)} Hz en ce moment` : 'pompe en veille'}` : `Automatique : suit le soleil — ${fmt(sim.s * 50, 1)} Hz`} />
            : <Slider label="Vitesse (variateur)" value={mods.speed} min={50} max={110} unit="%" disabled={!hasVfd} onChange={(x) => setMods({ ...mods, speed: x })}
                hint={!hasVfd ? 'Pas de variateur sur cette installation' : `${fmt((mods.speed / 100) * 50, 1)} Hz${mods.speed === baseSpeed && baseSpeed < 100 ? ' — consigne calculée pour le besoin' : ''}${mods.speed > 100 ? ' — SURVITESSE : à éviter (moteur et pompe hors limites)' : ''}`} />}
          <Slider label="Niveau d'eau à la source" value={mods.level} min={-5} max={3} step={0.1} unit="m" onChange={(x) => setMods({ ...mods, level: x })} hint="Négatif : le niveau baisse" />
          <Slider label="Colmatage crépine / filtre" value={mods.clog} min={0} max={100} unit="%" disabled={!hasFilter} onChange={(x) => setMods({ ...mods, clog: x })} hint={hasFilter ? undefined : 'Aucun filtre ni crépine'} />
          <Slider label="Usure de la pompe" value={mods.wear} min={0} max={100} unit="%" onChange={(x) => setMods({ ...mods, wear: x })} />
          <div className="scen">
            {scen.map((x) => <button key={x.l} className="chip" onClick={() => { if (x.stop) setSim((st) => stepSim(ctx, { ...st, master: false }, 5)); else setMods({ ...base, faults: mods.faults, ...x.m }); }}>{x.l}</button>)}
            <button className="chip" onClick={reset}><RotateCcw size={13} aria-hidden /> Réinitialiser</button>
          </div>
        </section>

        <section className="card">
          <h3><AlertOctagon size={16} aria-hidden /> Alertes en direct</h3>
          {obs.length > 0 && (
            <ul className="quick">
              {[...obs].sort((a, b) => SYM_WEIGHT[b] - SYM_WEIGHT[a]).slice(0, 5).map((x) => <li key={x}><span className={`relbtn lv-${SYM_WEIGHT[x] >= 15 ? 'critical' : 'warning'} static`}><LevelIcon level={SYM_WEIGHT[x] >= 15 ? 'critical' : 'warning'} size={15} /> {SYM_LABEL[x]}</span></li>)}
            </ul>
          )}
          {liveIssues.length === 0 && obs.length === 0 ? <p className="muted ok-line">Aucune alerte dans ces conditions.</p> : liveIssues.length === 0 ? null : (
            <ul className="quick">
              {liveIssues.slice(0, 7).map((x) => (
                <li key={x.id}><button className={`relbtn lv-${x.sev}${s.activeIssue?.id === x.id ? ' on' : ''}`} onClick={() => s.selectIssue(x)}><LevelIcon level={x.sev === 'critical' ? 'critical' : 'warning'} size={15} /> {x.title}</button></li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <div className="sim-main">
        <div className="mpower">
          <button className={`power ${sim.trip ? 'fault' : sim.master ? 'on' : 'off'}`} onClick={toggle} aria-pressed={sim.master}>
            <Power size={22} aria-hidden /><span><b>{sim.master ? 'EN MARCHE' : 'À L\'ARRÊT'}</b><small>{clock(sim.t)} · {sim.trip ? 'DÉFAUT' : sim.t < sim.outageUntil ? 'coupure secteur' : sim.on ? (sim.hum ? 'moteur bloqué' : sim.noFlow ? 'sans débit' : 'la pompe tourne') : 'pompe arrêtée'}</small></span>
          </button>
          <button className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Lecture'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        </div>
        {/* Téléphone : pourquoi la pompe tourne / attend, et déclenchement d'un incendie, sous le bouton marche */}
        <div className="mwhy">
          {why && <p className={`why-run${/ANORMALE/.test(why) ? ' bad' : ''}`}><b>Pourquoi ?</b> {why.charAt(0).toUpperCase() + why.slice(1)}</p>}
          {fire && <button type="button" className={`btn full firebtn ${mods.draw > 0 ? 'on' : ''}`} onClick={() => setMods({ ...mods, draw: mods.draw > 0 ? 0 : 100 })}>{mods.draw > 0 ? '🧯 Fermer la lance (fin de l\'incendie)' : '🔥 Déclencher un incendie (ouvrir la lance)'}</button>}
        </div>
        <div className={`livescore lv-${liveLvl}`}>
          <b>{liveScore}<small>/100</small></b>
          <span><strong>Note en service</strong><small>Conception {s.ev.score}/100{evSim.score !== s.ev.score ? ` · conditions simulées ${evSim.score}` : ''}{penalty ? ` · symptômes −${penalty}` : ''}</small></span>
        </div>
        <div className="livekpis">
          <div className={sim.on ? 'on' : ''}><small><Droplets size={13} aria-hidden /> Débit</small><b>{fmt(r.q, 1)}<span>m³/h</span></b></div>
          <div><small><Gauge size={13} aria-hidden /> Refoulement</small><b>{fmt(kind === 'vessel' || kind === 'vfd' ? sim.x : r.pRef, 2)}<span>bar</span></b></div>
          {s.inst.mode !== 'immergee' ? <div><small>Aspiration</small><b>{fmt(r.pAsp, 2)}<span>bar</span></b></div>
            : s.inst.pumpType === 'immergee_forage' ? (() => { const lv = ctx.i.geo.staticLevel + (sim.aqS ?? 0) + sim.dd; const ab = ctx.i.geo.pumpDepth - lv; return <div className={sim.noFlow || ab < 2 ? 'bad' : ''}><small>Eau au-dessus de la pompe</small><b>{fmt(Math.max(0, ab), 1)}<span>m</span></b><em>niveau {fmt(lv, 1)} m {sim.on ? '↓' : (sim.aqS ?? 0) > 0.2 ? '↑' : ''} · statique {fmt(ctx.i.geo.staticLevel, 0)} · pompe à {fmt(ctx.i.geo.pumpDepth, 0)} m</em></div>; })()
            : kind === 'pit' ? <div><small>Niveau dans la fosse</small><b>{fmt(sim.x * 100, 0)}<span>cm</span></b><em>marche à 50 cm · arrêt à 0</em></div> : null}
          <div><small><Zap size={13} aria-hidden /> Courant</small><b>{fmt(r.amps, 1)}<span>A</span></b></div>
          <div><small>Puissance</small><b>{fmt(r.kw, 2)}<span>kW</span></b></div>
          <div className={sim.on && ctx.h.margin < 1 ? 'bad' : ''}><small>Marge NPSH</small><b>{fmt(ctx.h.margin, 1)}<span>m</span></b></div>
          <div><small>Volume pompé</small><b>{fmt(sim.vol, 1)}<span>m³</span></b></div>
          <div><small>Énergie</small><b>{fmt(sim.kwh, 1)}<span>kWh</span></b><em>{money(sim.kwh * s.inst.duty.pricePerKwh, s.inst.duty.currency)}</em></div>
          <div className={sim.starts / hours > s.inst.pump.maxStarts ? 'bad' : ''}><small>Démarrages</small><b>{sim.starts}</b><em>{fmt(sim.starts / hours, 1)} /h (maxi {s.inst.pump.maxStarts})</em></div>
          <div className={phys.tm > 140 ? 'bad' : phys.tm > 120 ? 'warn' : ''} title={phys.tmCause ? `Cause : ${phys.tmCause}` : 'Température du bobinage (normale en charge : 70 à 110 °C)'}><small><Thermometer size={13} aria-hidden /> Moteur</small><b>{fmt(phys.tm, 0)}<span>°C</span></b><em>{phys.burnt ? 'GRILLÉ' : phys.tm > 120 && phys.tmCause ? phys.tmCause.split(' : ')[0] : `bobinage · relais ${fmt(Math.min(100, (phys.relay / 1.44) * 100), 0)} %`}</em></div>
          {(phys.tl > s.inst.fluid.temp + 4 || phys.sealGone) && <div className={phys.sealGone ? 'bad' : phys.tl > 60 ? 'warn' : ''}><small><Thermometer size={13} aria-hidden /> Liquide dans la pompe</small><b>{fmt(phys.tl, 0)}<span>°C</span></b><em>{phys.sealGone ? 'garniture détruite' : 'débit nul : il chauffe'}</em></div>}
          {phys.pPeak != null && <div className={phys.pPeak > s.inst.ref.pn ? 'bad' : phys.pPeak > s.inst.ref.pn * 0.8 ? 'warn' : ''}><small>Pointe de pression</small><b>{fmt(phys.pPeak, 1)}<span>bar</span></b><em>PN{s.inst.ref.pn}{phys.burst ? ` · ${phys.burst === 'rupture' ? 'CONDUITE ROMPUE' : 'fuite à un raccord'}` : ''}</em></div>}
          {(kind === 'solar' || kind === 'vfd' || mods.speed !== 100) && <div><small>Vitesse</small><b>{fmt((kind === 'solar' || kind === 'vfd' ? sim.s : mods.speed / 100) * 50, 1)}<span>Hz</span></b></div>}
        </div>

        {/* Durée d'animation des niveaux d'eau selon la vitesse de simulation : fluide à 1 min/s, sans retard à 1 h/s */}
        <div style={{ ['--lvl-t' as string]: rate <= 60 ? '1.4s' : rate <= 600 ? '0.8s' : '0.45s' }}>
          <DiagramPanel i={iView} ev={evSim} highlight={s.highlight} selected={s.selected} onPick={s.pick} onIssue={s.selectIssue} onSet={s.set} live={live} banner={s.activeIssue} onCloseBanner={s.clearIssue} />
        </div>

        {kind === 'pit' && (!s.inst.acc.flotteur_marche?.on || !s.inst.acc.flotteur_arret?.on) && (
          <div className="cfg-block">
            <b>La pompe ne peut pas fonctionner en automatique</b>
            <span>{!s.inst.acc.flotteur_marche?.on ? 'Aucun flotteur de marche : la pompe ne démarre jamais et la fosse déborde.' : 'Aucun flotteur d\'arrêt : la pompe vide la fosse puis tourne à sec.'} Ce n'est pas une panne : il manque un équipement.</span>
            <button type="button" className="btn primary sm" onClick={() => s.set((x) => ({ ...x, acc: { ...x.acc, flotteur_marche: { ...((x.acc.flotteur_marche as AccState | undefined) ?? { dn: 0, qty: 1 }), on: true }, flotteur_arret: { ...((x.acc.flotteur_arret as AccState | undefined) ?? { dn: 0, qty: 1 }), on: true }, flotteur_alarme: { ...((x.acc.flotteur_alarme as AccState | undefined) ?? { dn: 0, qty: 1 }), on: true } } }))}>Ajouter les flotteurs (marche, arrêt, alarme)</button>
          </div>
        )}
        <FaultPanel inst={iSim} kind={kind} active={mods.faults} obs={obs} trip={sim.trip} isolated={sim.isolated} spare={(s.inst.pump.standby ?? 0) > 0} outageLeft={Math.max(0, sim.outageUntil - sim.t)} mystery={mystery}
          onToggle={toggleFault} onMystery={startMystery} onAnswer={(id) => setMystery((m) => (m ? { ...m, answer: id } : m))}
          onRepair={(id) => { repair(id); if (mystery?.id === id) setMystery(null); }} onRepairAll={repairAll} onRearm={rearm}
          onShow={(t) => { s.pick(t); document.getElementById('diagram')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} />

        <div className="sim-charts">
          <section className="card">
            <figure>
              <figcaption>{sl.a} <span>({sl.unit})</span></figcaption>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={c.axis} fontSize={11} tickLine={false} minTickGap={40} />
                  <YAxis stroke={c.axis} fontSize={11} tickLine={false} width={44} domain={['auto', 'auto']} tickFormatter={(x) => fmt(x, 1)} />
                  <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 10, color: c.ink, fontSize: 13 }} formatter={(x) => [`${fmt(Number(x), 2)} ${sl.unit}`, sl.a]} />
                  {kind === 'vessel' && v && <ReferenceLine y={v.pOn} stroke={c.axis} strokeDasharray="4 4" label={{ value: 'Marche', position: 'insideBottomRight', fontSize: 11, fill: c.axis }} />}
                  {kind === 'vessel' && v && <ReferenceLine y={v.pOff} stroke={c.axis} strokeDasharray="4 4" label={{ value: 'Arrêt', position: 'insideTopRight', fontSize: 11, fill: c.axis }} />}
                  {kind === 'pit' && <ReferenceLine y={50} stroke={c.axis} strokeDasharray="4 4" label={{ value: 'Flotteur marche', position: 'insideTopRight', fontSize: 11, fill: c.axis }} />}
                  {kind === 'pit' && <ReferenceLine y={0} stroke={c.axis} strokeDasharray="4 4" label={{ value: 'Flotteur arrêt', position: 'insideBottomRight', fontSize: 11, fill: c.axis }} />}
                  <Line dataKey="a" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </figure>
          </section>
          <section className="card">
            <figure>
              <figcaption>Débits <span>(m³/h)</span></figcaption>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
                  <CartesianGrid stroke={c.grid} vertical={false} />
                  <XAxis dataKey="label" stroke={c.axis} fontSize={11} tickLine={false} minTickGap={40} />
                  <YAxis stroke={c.axis} fontSize={11} tickLine={false} width={44} tickFormatter={(x) => fmt(x, 0)} />
                  <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 10, color: c.ink, fontSize: 13 }} formatter={(x, n) => [`${fmt(Number(x), 1)} m³/h`, n]} />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} />
                  <Line name="Pompe" dataKey="b" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} type="stepAfter" />
                  {sl.c && <Line name={sl.c} dataKey="c" stroke={c.s2} strokeWidth={2} dot={false} isAnimationActive={false} />}
                </LineChart>
              </ResponsiveContainer>
            </figure>
          </section>
        </div>

        <section className="card">
          <h3><Timer size={16} aria-hidden /> Journal des événements <small>cliquez pour voir l'élément concerné</small></h3>
          {sim.events.length === 0 ? <p className="muted">Lancez la simulation : démarrages, arrêts, coups de bélier, cavitation, marche à sec… s'afficheront ici.</p> : (
            <ul className="events">
              {sim.events.slice(0, 30).map((e, n) => (
                <li key={`${e.t}-${n}`} className={`lv-${e.sev}`}>
                  <button onClick={() => e.target && s.pick(e.target)} disabled={!e.target}>
                    <span className="ev-t">{clock(e.t)}</span>
                    <LevelIcon level={e.sev === 'ok' ? 'ok' : e.sev} size={14} />
                    <span>{e.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

