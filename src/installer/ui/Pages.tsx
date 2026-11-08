import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertOctagon, Droplets, Gauge, Pause, Play, Power, RotateCcw, Timer, Zap } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Evaluation } from '../evaluate';
import { evaluate } from '../evaluate';
import { KIND_LABEL, NO_MODS, SERIES_LABEL, applyMods, clock, initSim, makeCtx, readings, simKind, stepSim, type Mods, type SimState } from '../sim';
import type { Installation, Issue } from '../types';
import { LevelIcon } from '../../ui/Status';
import { fmt, money, useChartColors } from '../../ui/util';
import { DiagramPanel } from './DiagramPanel';
import { InstallerForm } from './InstallerForm';
import { Alerts, Bom, ElecCard, Goods, InstCurve, KeyFigures, LossTable, MountOrder, PartsAtRisk, Recommendations, ScoreCard } from './Report';

export interface Shared {
  inst: Installation;
  set: (fn: (i: Installation) => Installation) => void;
  ev: Evaluation;
  highlight: string[];
  selected: string | null;
  activeIssue: Issue | null;
  pick: (t: string | null) => void;
  selectIssue: (x: Issue) => void;
  fix: (x: Issue) => void;
  clearIssue: () => void;
}

function Diagram({ s, live }: { s: Shared; live?: Parameters<typeof DiagramPanel>[0]['live'] }) {
  return (
    <DiagramPanel i={s.inst} ev={s.ev} highlight={s.highlight} selected={s.selected} onPick={s.pick} onIssue={s.selectIssue} onSet={s.set}
      live={live} banner={s.activeIssue} onCloseBanner={s.clearIssue} />
  );
}

/* ============================ Conception ============================ */
export function DesignPage({ s, goDiag }: { s: Shared; goDiag: (x?: Issue) => void }) {
  const crit = s.ev.issues.filter((x) => x.sev !== 'info');
  return (
    <div className="page-design">
      <aside className="inst-form">
        <InstallerForm inst={s.inst} set={s.set} needs={s.ev.needs} er={s.ev.elec} />
      </aside>
      <div className="design-main">
        <MiniScore ev={s.ev} onClick={() => goDiag()} />
        <Diagram s={s} />
        <KeyFigures i={s.inst} ev={s.ev} />
        <section className="card">
          <h3><AlertOctagon size={16} aria-hidden /> Alertes principales <small>cliquez pour les voir sur le schéma</small></h3>
          {crit.length === 0 ? <p className="muted">Aucune alerte : l'installation respecte les règles de l'art.</p> : (
            <ul className="quick">
              {crit.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <button className={`relbtn lv-${x.sev}${s.activeIssue?.id === x.id ? ' on' : ''}`} onClick={() => s.selectIssue(x)}>
                    <LevelIcon level={x.sev === 'critical' ? 'critical' : 'warning'} size={15} /> {x.title}
                  </button>
                </li>
              ))}
              {crit.length > 6 && <li><button className="link" onClick={() => goDiag()}>Voir les {crit.length} alertes →</button></li>}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniScore({ ev, onClick }: { ev: Evaluation; onClick: () => void }) {
  const lvl = ev.verdict.level === 'excellent' || ev.verdict.level === 'good' ? 'ok' : ev.verdict.level === 'fair' ? 'warning' : 'critical';
  const nC = ev.issues.filter((x) => x.sev === 'critical').length;
  const nW = ev.issues.filter((x) => x.sev === 'warning').length;
  return (
    <button className={`miniscore lv-${lvl}`} onClick={onClick}>
      <span className="ms-num">{ev.score}<small>/100</small></span>
      <span className="ms-txt"><b>{ev.verdict.label}</b><small>{nC} critique{nC > 1 ? 's' : ''} · {nW} alerte{nW > 1 ? 's' : ''} — voir le diagnostic →</small></span>
    </button>
  );
}

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

export function SimPage({ s }: { s: Shared }) {
  const c = useChartColors();
  // Variateur à fréquence fixe : la simulation démarre à la consigne calculée. En régulation automatique
  // (capteur de pression, solaire), c'est la régulation qui fixe la vitesse : on part de 100 %.
  const autoReg = ['vfd', 'solar'].includes(simKind(s.inst));
  const baseSpeed = !autoReg && s.ev.elec.vfdSpeed ? Math.round(s.ev.elec.vfdSpeed.s * 100) : 100;
  const [mods, setMods] = useState<Mods>(() => ({ ...NO_MODS, speed: baseSpeed }));
  const iSim = useMemo(() => applyMods(s.inst, mods), [s.inst, mods]);
  const ctx = useMemo(() => makeCtx(iSim, mods.draw), [iSim, mods.draw]);
  const evSim = useMemo(() => evaluate(iSim), [iSim]);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [sim, setSim] = useState<SimState>(() => initSim(ctx));
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(600);

  // Avec un variateur réglé sur le besoin, la simulation démarre à sa fréquence de consigne, pas à 50 Hz.
  const base: Mods = { ...NO_MODS, speed: baseSpeed };
  useEffect(() => { setSim(initSim(makeCtx(applyMods(s.inst, base)))); setMods(base); }, [s.inst]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => setSim((st) => stepSim(ctxRef.current, st, rate * 0.5)), 500);
    return () => window.clearInterval(id);
  }, [playing, rate]);

  const kind = ctx.kind;
  const r = readings(iSim, ctx.h, sim.on, ctx.er, sim.on ? sim.q : undefined, kind === 'vfd' && sim.on ? sim.s : 1);
  const live = { on: sim.on, r, kind, x: sim.x, pv: kind === 'solar' ? sim.pv : undefined, clock: clock(sim.t), events: sim.events, starts: sim.starts, vol: sim.vol, kwh: sim.kwh };
  const toggle = () => setSim((st) => stepSim(ctx, { ...st, master: !st.master }, 5));
  const reset = () => { setMods(base); setSim(initSim(makeCtx(applyMods(s.inst, base)))); };
  const hours = Math.max(0.01, (sim.t - 6 * 3600) / 3600);
  const sl = SERIES_LABEL[kind];
  const data = sim.series.map((p) => ({ ...p, label: clock(p.t).slice(3) }));
  const hasVfd = s.inst.acc.variateur?.on || s.inst.elec.supply === 'solaire';
  const hasFilter = ['clapet_pied', 'crepine', 'filtre_asp', 'prefiltre'].some((k) => s.inst.acc[k]?.on);
  const v = ctx.er.vessel;
  const liveIssues = evSim.issues.filter((x) => x.sev !== 'info');
  const scen: { l: string; m: Partial<Mods>; stop?: boolean }[] = [
    { l: 'Vanne presque fermée', m: { valve: 15 } }, { l: 'Filtre colmaté', m: { clog: 85 } }, { l: 'Niveau très bas', m: { level: -2.5 } },
    { l: 'Pompe usée', m: { wear: 70 } }, { l: 'Coupure de courant', m: {}, stop: true },
  ];

  return (
    <div className="page-sim">
      <aside className="sim-side">
        <section className="card simctl">
          <button className={`power ${sim.master ? 'on' : 'off'}`} onClick={toggle} aria-pressed={sim.master}>
            <Power size={26} aria-hidden />
            <span><b>{sim.master ? 'EN MARCHE' : 'À L\'ARRÊT'}</b><small>{sim.master ? (sim.on ? 'la pompe tourne' : 'en attente de l\'automatisme') : 'cliquez pour démarrer'}</small></span>
          </button>
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
              <Slider label={kind === 'pit' ? 'Arrivée d\'effluents' : 'Consommation (robinets ouverts)'} value={mods.draw < 0 ? Math.round((sim.series.at(-1)?.c ?? 0) / Math.max(0.01, kind === 'pit' ? ctx.h.q * 0.55 : kind === 'tank' ? s.inst.duty.qReq * 0.55 : s.inst.duty.qReq) * 100) : mods.draw} min={0} max={150} unit="%"
                onChange={(x) => setMods({ ...mods, draw: x })}
                hint={mods.draw < 0
                  ? `Automatique : suit l'heure de la journée (pointes à 7 h et 19 h30, très faible la nuit)${kind === 'vessel' || kind === 'vfd' ? ` — ${fmt(sim.series.at(-1)?.c ?? 0, 1)} m³/h en ce moment` : ''}`
                  : `Imposée : ${fmt((mods.draw / 100) * s.inst.duty.qReq, 1)} m³/h (${mods.draw} % du besoin)`} />
              <button type="button" className={`chip ${mods.draw < 0 ? 'on' : ''}`} onClick={() => setMods({ ...mods, draw: -1 })}>Profil automatique</button>
            </div>
          )}
          {(kind === 'vessel' || kind === 'vfd') && <p className="small muted simnote">En surpression, c'est la <b>consommation</b> qui fixe le débit, pas la vanne : la pompe ne fournit que ce que les robinets prélèvent. Ouvrir la vanne ne fait pas couler plus d'eau.</p>}
          <Slider label="Ouverture vanne de refoulement" value={mods.valve} min={5} max={100} unit="%" onChange={(x) => setMods({ ...mods, valve: x })} />
          {kind === 'vfd' || kind === 'solar'
            ? <Slider label="Vitesse (variateur)" value={sim.on ? Math.round(sim.s * 100) : 0} min={0} max={100} unit="%" disabled onChange={() => undefined}
                hint={kind === 'vfd' ? `Automatique : réglée par le capteur de pression — ${sim.on ? `${fmt(sim.s * 50, 1)} Hz en ce moment` : 'pompe en veille'}` : `Automatique : suit le soleil — ${fmt(sim.s * 50, 1)} Hz`} />
            : <Slider label="Vitesse (variateur)" value={mods.speed} min={50} max={110} unit="%" disabled={!hasVfd} onChange={(x) => setMods({ ...mods, speed: x })}
                hint={!hasVfd ? 'Pas de variateur sur cette installation' : `${fmt((mods.speed / 100) * 50, 1)} Hz${mods.speed === baseSpeed && baseSpeed < 100 ? ' — consigne calculée pour le besoin' : ''}${mods.speed > 100 ? ' — SURVITESSE : à éviter (moteur et pompe hors limites)' : ''}`} />}
          <Slider label="Niveau d'eau à la source" value={mods.level} min={-5} max={3} step={0.1} unit="m" onChange={(x) => setMods({ ...mods, level: x })} hint="Négatif : le niveau baisse" />
          <Slider label="Colmatage crépine / filtre" value={mods.clog} min={0} max={100} unit="%" disabled={!hasFilter} onChange={(x) => setMods({ ...mods, clog: x })} hint={hasFilter ? undefined : 'Aucun filtre ni crépine'} />
          <Slider label="Usure de la pompe" value={mods.wear} min={0} max={100} unit="%" onChange={(x) => setMods({ ...mods, wear: x })} />
          <div className="scen">
            {scen.map((x) => <button key={x.l} className="chip" onClick={() => { if (x.stop) setSim((st) => stepSim(ctx, { ...st, master: false }, 5)); else setMods({ ...base, ...x.m }); }}>{x.l}</button>)}
            <button className="chip" onClick={reset}><RotateCcw size={13} aria-hidden /> Réinitialiser</button>
          </div>
        </section>

        <section className="card">
          <h3><AlertOctagon size={16} aria-hidden /> Alertes en direct</h3>
          {liveIssues.length === 0 ? <p className="muted ok-line">Aucune alerte dans ces conditions.</p> : (
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
          <button className={`power ${sim.master ? 'on' : 'off'}`} onClick={toggle} aria-pressed={sim.master}>
            <Power size={22} aria-hidden /><span><b>{sim.master ? 'EN MARCHE' : 'À L\'ARRÊT'}</b><small>{clock(sim.t)} · {sim.on ? 'la pompe tourne' : 'pompe arrêtée'}</small></span>
          </button>
          <button className="icon-btn" onClick={() => setPlaying(!playing)} aria-label={playing ? 'Pause' : 'Lecture'}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
        </div>
        <div className="livekpis">
          <div className={sim.on ? 'on' : ''}><small><Droplets size={13} aria-hidden /> Débit</small><b>{fmt(r.q, 1)}<span>m³/h</span></b></div>
          <div><small><Gauge size={13} aria-hidden /> Refoulement</small><b>{fmt(kind === 'vessel' || kind === 'vfd' ? sim.x : r.pRef, 2)}<span>bar</span></b></div>
          <div><small>Aspiration</small><b>{fmt(r.pAsp, 2)}<span>bar</span></b></div>
          <div><small><Zap size={13} aria-hidden /> Courant</small><b>{fmt(r.amps, 1)}<span>A</span></b></div>
          <div><small>Puissance</small><b>{fmt(r.kw, 2)}<span>kW</span></b></div>
          <div className={sim.on && ctx.h.margin < 1 ? 'bad' : ''}><small>Marge NPSH</small><b>{fmt(ctx.h.margin, 1)}<span>m</span></b></div>
          <div><small>Volume pompé</small><b>{fmt(sim.vol, 1)}<span>m³</span></b></div>
          <div><small>Énergie</small><b>{fmt(sim.kwh, 1)}<span>kWh</span></b><em>{money(sim.kwh * s.inst.duty.pricePerKwh, s.inst.duty.currency)}</em></div>
          <div className={sim.starts / hours > s.inst.pump.maxStarts ? 'bad' : ''}><small>Démarrages</small><b>{sim.starts}</b><em>{fmt(sim.starts / hours, 1)} /h (maxi {s.inst.pump.maxStarts})</em></div>
          {(kind === 'solar' || kind === 'vfd' || mods.speed !== 100) && <div><small>Vitesse</small><b>{fmt((kind === 'solar' || kind === 'vfd' ? sim.s : mods.speed / 100) * 50, 1)}<span>Hz</span></b></div>}
        </div>

        <DiagramPanel i={iSim} ev={evSim} highlight={s.highlight} selected={s.selected} onPick={s.pick} onIssue={s.selectIssue} onSet={s.set} live={live} banner={s.activeIssue} onCloseBanner={s.clearIssue} />

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

/* ============================ Diagnostic ============================ */
export function DiagPage({ s }: { s: Shared }) {
  return (
    <div className="page-diag">
      <div className="diag-list">
        <ScoreCard ev={s.ev} />
        <Alerts ev={s.ev} onFix={s.fix} onSelect={s.selectIssue} activeId={s.activeIssue?.id} />
        <Recommendations ev={s.ev} />
        <PartsAtRisk ev={s.ev} />
        <Goods ev={s.ev} />
      </div>
      <div className="diag-side">
        <Diagram s={s} />
      </div>
    </div>
  );
}

/* ============================ Matériel & rapport ============================ */
export function MaterialPage({ s }: { s: Shared }) {
  return (
    <div className="page-mat">
      <KeyFigures i={s.inst} ev={s.ev} />
      <div className="mat-cols">
        <div className="stack"><MountOrder i={s.inst} ev={s.ev} onFix={s.fix} /><Bom i={s.inst} ev={s.ev} onFix={s.fix} /><LossTable ev={s.ev} /></div>
        <div className="stack"><ElecCard i={s.inst} ev={s.ev} /><section className="card"><InstCurve i={s.inst} ev={s.ev} /></section></div>
      </div>
    </div>
  );
}
