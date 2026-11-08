import type { Evaluation } from './evaluate';
import type { Installation } from './types';
import type { Readings, SimKind } from './sim';

export type TermTag = 'ok' | 'warn' | 'crit' | 'info' | 'cmd';
export interface TermLine { tag: TermTag; text: string }
export interface TermLive { phys?: { tm: number; tl: number; relay: number; pPeak?: number; burst: string | null; burnt: boolean; sealGone: boolean }; on: boolean; r: Readings; kind: SimKind; x: number; clock?: string; events?: { sev: string; text: string }[]; starts?: number; vol?: number; kwh?: number; hz?: number }

const f = (v: number, d = 1) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

/** Lignes de la console : informations capitales de l'installation, en direct en simulation. */
export function termLines(i: Installation, ev: Evaluation, live?: TermLive): TermLine[] {
  const h = ev.hydro;
  const e = ev.elec;
  const L: TermLine[] = [];
  const nC = ev.issues.filter((x) => x.sev === 'critical').length;
  const nW = ev.issues.filter((x) => x.sev === 'warning').length;
  const tag = (bad: boolean, worse = false): TermTag => (worse ? 'crit' : bad ? 'warn' : 'ok');

  if (live) {
    L.push({ tag: 'cmd', text: `ecopump> simulate --live   ${live.clock ?? ''}` });
    L.push({ tag: live.on ? 'ok' : 'warn', text: `${pad('POMPE', 8)}${live.on ? 'EN MARCHE' : 'ARRÊT'}  Q=${f(live.r.q)} m³/h  HMT=${f(live.r.hmt)} m${live.on && live.hz != null ? `  F=${f(live.hz)} Hz` : ''}` });
    if (live.kind === 'vfd' && live.on) L.push({ tag: 'info', text: `${pad('RÉGUL.', 8)}pression constante : la vitesse varie, la HMT reste stable` });
    L.push({ tag: 'info', text: `${pad('PRESS.', 8)}refoul. ${f(live.kind === 'vessel' || live.kind === 'vfd' ? live.x : live.r.pRef, 2)} bar  aspi. ${f(live.r.pAsp, 2)} bar` });
    L.push({ tag: tag(live.r.amps > e.inom * 1.05), text: `${pad('MOTEUR', 8)}${f(live.r.amps)} A / In ${f(e.inom)} A  ${f(live.r.kw, 2)} kW` });
    if (live.kind === 'pit') L.push({ tag: tag(live.x > 0.8, live.x > 1.1), text: `${pad('FOSSE', 8)}niveau ${f(live.x * 100, 0)} cm (marche 50 · arrêt 0)` });
    if (live.kind === 'tank') L.push({ tag: tag(live.x > 1), text: `${pad('RÉSERV.', 8)}${f(Math.min(100, live.x * 100), 0)} % plein` });
    L.push({ tag: tag(h.margin < 1, h.margin < 0.5), text: `${pad('NPSH', 8)}marge ${f(h.margin)} m` });
    if (live.phys) {
      const P = live.phys;
      L.push({ tag: tag(P.tm > 120 || P.tl > 60, P.tm > 140 || P.burnt || P.sealGone), text: `${pad('THERM.', 8)}moteur ${f(P.tm, 0)} °C${P.burnt ? ' GRILLÉ' : ''}  liquide ${f(P.tl, 0)} °C${P.sealGone ? ' garniture HS' : ''}` });
      if (P.pPeak != null || P.burst) L.push({ tag: tag((P.pPeak ?? 0) > i.ref.pn * 0.8, (P.pPeak ?? 0) > i.ref.pn || !!P.burst), text: `${pad('TUYAU', 8)}pointe ${f(P.pPeak ?? 0)} bar / PN${i.ref.pn}${P.burst ? (P.burst === 'rupture' ? '  ROMPUE' : '  FUITE') : ''}` });
    }
    L.push({ tag: tag((live.starts ?? 0) > 0 && false), text: `${pad('CUMUL', 8)}${f(live.vol ?? 0)} m³  ${f(live.kwh ?? 0)} kWh  ${live.starts ?? 0} démarrage(s)` });
    for (const x of (live.events ?? []).slice(0, 3)) L.push({ tag: x.sev === 'critical' ? 'crit' : x.sev === 'warning' ? 'warn' : x.sev === 'ok' ? 'ok' : 'info', text: `${pad('EVT', 8)}${x.text}` });
  } else {
    L.push({ tag: 'cmd', text: `ecopump> analyse "${i.name}"` });
    L.push(h.ok
      ? { tag: tag(h.x < 0.7 || h.x > 1.2, h.x < 0.5 || h.x > 1.3), text: `${pad('POINT', 8)}Q=${f(h.q)} m³/h  HMT=${f(h.h)} m  (${f(h.x * 100, 0)} % BEP)` }
      : { tag: 'crit', text: `${pad('POINT', 8)}AUCUN DÉBIT — hauteur inatteignable` });
    L.push({ tag: tag(h.q < i.duty.qReq * 0.97, h.q < i.duty.qReq * 0.9), text: `${pad('BESOIN', 8)}${f(i.duty.qReq)} m³/h à ${f(i.duty.pRes)} bar → ${f((h.q / i.duty.qReq) * 100, 0)} %` });
    L.push({ tag: tag(h.margin < Math.max(1, 0.2 * h.npshr), h.margin < 0.5), text: `${pad('NPSH', 8)}dispo ${f(h.npsha)} / requis ${f(h.npshr)} → marge ${f(h.margin)} m` });
    if (h.ok) L.push({ tag: tag(h.vAsp > 1.5 || h.vRef > 2.5, h.vAsp > 2.2 || h.vRef > 3.5), text: `${pad('VITESSE', 8)}${i.mode === 'immergee' ? '' : `aspi ${f(h.vAsp, 2)} · `}refoul ${f(h.vRef, 2)} m/s` });
    if (h.ok) L.push({ tag: tag(h.hLoss / Math.max(1, h.h) > 0.3), text: `${pad('PERTES', 8)}${f(h.hLoss, 2)} m (${f((h.hLoss / Math.max(1, h.h)) * 100, 0)} % de la HMT)` });
    L.push({ tag: tag(h.pMaxBar > i.ref.pn * 0.9, h.pMaxBar > i.ref.pn), text: `${pad('PRESS.', 8)}maxi ${f(h.pMaxBar)} bar / PN${i.ref.pn}  bélier ${f(h.surge, 0)} m` });
    L.push({ tag: tag(e.dropRun > 5 || i.elec.cableSec < e.secRec, e.inom * 1.25 > 0 && e.dropRun > 8), text: `${pad('ÉLEC', 8)}In ${f(e.inom)} A  ΔU ${f(e.dropRun)} %  ${e.cores} ${String(i.elec.cableSec).replace('.', ',')} mm²` });
    if (h.ok) L.push({ tag: tag(h.pShaft > i.pump.motorKw * 0.95, h.pShaft > i.pump.motorKw), text: `${pad('MOTEUR', 8)}${f(h.pShaft, 2)} / ${f(i.pump.motorKw, 1)} kW  η=${f(h.eta * 100, 0)} %` });
    if (e.solar) L.push({ tag: 'info', text: `${pad('SOLAIRE', 8)}${e.solar.n}×${i.elec.solar.panelWc} Wc (${e.solar.ns}S×${e.solar.np}P) ≈ ${f(e.solar.dailyM3, 0)} m³/j` });
    if (e.vessel) L.push({ tag: 'info', text: `${pad('VESSIE', 8)}${e.vessel.vol} L PN${e.vessel.pn}  ${f(e.vessel.pOn, 1)}/${f(e.vessel.pOff, 1)} bar  pré ${f(e.vessel.pre, 1)}` });
    L.push({ tag: 'info', text: `${pad('ÉNERGIE', 8)}${f(h.se * 1000, 0)} Wh/m³  ${f(h.costYear / 1000, 0)} k${i.duty.currency}/an` });
    L.push({ tag: nC ? 'crit' : nW ? 'warn' : 'ok', text: `${pad('NOTE', 8)}${ev.score}/100 — ${nC} critique(s), ${nW} alerte(s)` });
    const top = ev.issues.filter((x) => x.sev !== 'info').slice(0, 3);
    for (const x of top) L.push({ tag: x.sev === 'critical' ? 'crit' : 'warn', text: `${pad(x.sev === 'critical' ? 'ERREUR' : 'ALERTE', 8)}${x.title}` });
  }
  return L;
}
