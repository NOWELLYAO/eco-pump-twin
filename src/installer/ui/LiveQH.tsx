import { X as XIcon } from 'lucide-react';
import { cavZones, isForage, losses, npshMarginAt, nRun, pressZ, pumpEta, pumpHead, systemHeadAt, viscCorr } from '../hydraulics';
import { liveReadings } from '../sim';
import type { SimCtx, SimState } from '../sim';

const G = 9.81;
const fr = (x: number, d = 1) => x.toLocaleString('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

/** Courbe Q/H en direct : courbe de la pompe à sa vitesse du moment, courbe du réseau à cet instant (pression du
 *  réservoir, niveau d'eau réel) et point de fonctionnement qui se déplace avec la simulation. */
export function LiveQH({ ctx, st, onClose }: { ctx: SimCtx; st: SimState; onClose: () => void }) {
  const i = ctx.i, rhoG = i.fluid.rho * G;
  const s = ctx.kind === 'vfd' || ctx.kind === 'solar' ? Math.max(0.2, st.s || 1) : 1;
  const dL = isForage(i) ? i.geo.staticLevel + (st.aqS ?? 0) + st.dd - i.geo.dynamicLevel : 0;
  const press = ctx.kind === 'vessel' || ctx.kind === 'vfd';
  // Pompe à la vitesse s (lois de similitude) ; réseau : ce que la pompe doit fournir maintenant
  const pump = (q: number) => (ctx.fx.decoupled ? 0 : s * s * pumpHead(i, q / s));
  const net = (q: number) => (press ? (st.x * 1e5) / rhoG - pressZ(i) + dL + losses(i, q).total : systemHeadAt(i, q) + dL);
  let qMax = Math.max(0.5, i.pump.qn * 1.1 * Math.max(1, ctx.h.n || 1));
  for (let k = 0; k < 40 && pump(qMax) > 0; k++) qMax *= 1.15;
  qMax = Math.max(qMax, (i.duty.qReq || 0) * 1.3, st.q * 1.3);
  const N = 48, qs = Array.from({ length: N + 1 }, (_, k) => (qMax * k) / N);
  const hp = qs.map(pump), hn = qs.map(net);
  const hMax = Math.max(1, ...hp, Math.min(Math.max(...hn), Math.max(...hp) * 1.6)) * 1.1;
  const hMin = Math.min(0, ...hn.filter((h) => h < 0));
  // Repère SVG
  const W = 300, H = 198, L = 34, R = 30, T = 18, B = 26;
  const X = (q: number) => L + (q / qMax) * (W - L - R);
  const Y = (h: number) => T + (1 - (h - hMin) / (hMax - hMin)) * (H - T - B);
  const line = (hs: number[]) => hs.map((h, k) => `${k ? 'L' : 'M'}${X(qs[k]).toFixed(1)},${Y(Math.max(hMin, Math.min(hMax, h))).toFixed(1)}`).join('');
  const pumpPts = hp.map((h, k) => ({ h, k })).filter((p) => p.h >= 0);
  const pumpD = pumpPts.map((p, j) => `${j ? 'L' : 'M'}${X(qs[p.k]).toFixed(1)},${Y(p.h).toFixed(1)}`).join('');
  const running = st.on && !st.hum && !st.noFlow;
  const qOp = running ? st.q : 0, hOp = running ? pump(qOp) : 0;
  const ticks = (max: number, n = 4) => { const step = niceStep(max / n); return Array.from({ length: Math.floor(max / step) + 1 }, (_, k) => k * step); };
  const qReq = i.duty.qReq;
  // Rendement de la pompe (axe de droite, %) : à vitesse réduite, la courbe se décale avec le débit (similitude)
  const nP = nRun(i), ce = viscCorr(i.fluid.nu).ceta;
  const eta = (q: number) => (ctx.fx.decoupled ? 0 : Math.max(0, Math.min(1, pumpEta(i, q / nP / s) * ce)));
  const et = qs.map(eta);
  const YE = (e: number) => T + (1 - e) * (H - T - B);
  const etaD = et.map((e, k) => ({ e, k })).filter((p) => hp[p.k] > 0 && p.e > 0.005).map((p, j) => `${j ? 'L' : 'M'}${X(qs[p.k]).toFixed(1)},${YE(p.e).toFixed(1)}`).join('');
  const kBep = et.reduce((b, e, k) => (hp[k] > 0 && e > et[b] ? k : b), 0);
  // Cavitation (pompe de surface) : plages de débit où le NPSH disponible ne couvre plus le NPSH requis, à la vitesse
  // et au niveau d'eau du moment
  const dz = i.mode === 'aspiration' || i.mode === 'charge' ? st.dd ?? 0 : 0;
  const cz = cavZones(i, qMax, s, dz);
  const mOp = running && i.mode !== 'immergee' ? npshMarginAt(i, Math.max(qOp, 1e-3), s, dz) : null;
  const seg = (a: number, b: number) => { const ks = qs.map((q, k) => ({ q, k })).filter((p) => p.q >= a - 1e-9 && p.q <= b + 1e-9 && hp[p.k] >= 0); return ks.map((p, j) => `${j ? 'L' : 'M'}${X(p.q).toFixed(1)},${Y(hp[p.k]).toFixed(1)}`).join(''); };
  return (
    <div className="lqh" role="dialog" aria-label="Courbe Q/H en direct">
      <div className="lqh-h">
        <b>Courbe Q/H en direct</b>
        <button type="button" className="fold" onClick={onClose} aria-label="Fermer la courbe"><XIcon size={14} aria-hidden /></button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="lqh-svg">
        {ticks(hMax).map((h) => <g key={`h${h}`}><line x1={L} x2={W - R} y1={Y(h)} y2={Y(h)} className="lqh-grid" /><text x={L - 4} y={Y(h) + 3} textAnchor="end" className="lqh-t">{fr(h, 0)}</text></g>)}
        {ticks(qMax).map((q) => <g key={`q${q}`}><line x1={X(q)} x2={X(q)} y1={T} y2={H - B} className="lqh-grid" /><text x={X(q)} y={H - B + 12} textAnchor="middle" className="lqh-t">{fr(q, q < 10 ? 1 : 0)}</text></g>)}
        <text x={W - R} y={H - 3} textAnchor="end" className="lqh-t">Q (m³/h)</text>
        <text x={L - 30} y={T - 8} className="lqh-t">H (m)</text>
        {cz.risk.map(([a, b], k) => <rect key={`r${k}`} x={X(a)} y={T} width={Math.max(1, X(b) - X(a))} height={H - T - B} className="lqh-risk" />)}
        {cz.cav.map(([a, b], k) => <rect key={`c${k}`} x={X(a)} y={T} width={Math.max(1, X(b) - X(a))} height={H - T - B} className="lqh-cav" />)}
        <path d={line(hn)} className="lqh-net" />
        {[0.25, 0.5, 0.75, 1].map((e) => <text key={`e${e}`} x={W - R + 3} y={YE(e) + 3} className="lqh-t lqh-te">{Math.round(e * 100)}</text>)}
        <text x={W - 2} y={T - 8} textAnchor="end" className="lqh-t lqh-te">η (%)</text>
        <path d={etaD} className="lqh-eta" />
        {et[kBep] > 0 && <g className="lqh-bep"><circle cx={X(qs[kBep])} cy={YE(et[kBep])} r={3} /><text x={X(qs[kBep])} y={YE(et[kBep]) - 5} textAnchor="middle" className="lqh-t lqh-te">η max</text></g>}
        {running && <circle cx={X(qOp)} cy={YE(eta(qOp))} r={3.5} className="lqh-eop" />}
        <path d={pumpD} className="lqh-pump" />
        {cz.cav.map(([a, b], k) => <path key={`cp${k}`} d={seg(a, b)} className="lqh-pcav" />)}
        {qReq > 0 && <g className="lqh-req"><line x1={X(qReq)} x2={X(qReq)} y1={T} y2={H - B} /><text x={X(qReq) + 3} y={T + 9} className="lqh-t">besoin</text></g>}
        {running && <g className="lqh-op"><line x1={X(qOp)} x2={X(qOp)} y1={Y(hOp)} y2={H - B} /><line x1={L} x2={X(qOp)} y1={Y(hOp)} y2={Y(hOp)} /><circle cx={X(qOp)} cy={Y(hOp)} r={5} /></g>}
      </svg>
      <ul className="lqh-leg">
        <li><i className="lqh-k pump" />Pompe{s < 0.995 ? ` à ${fr(s * 50, 1)} Hz` : ''}{(ctx.h.n || 1) > 1 ? ` (${ctx.h.n} en parallèle)` : ''}</li>
        <li><i className="lqh-k net" />Réseau maintenant{press ? ` (${fr(st.x, 2)} bar)` : ''}</li>
        <li><i className="lqh-k op" />{running ? <span>Point de fonctionnement : <b>{fr(qOp, 1)} m³/h</b> à <b>{fr(hOp, 1)} m</b></span> : <span className="muted">{st.on ? 'La pompe tourne sans débiter' : 'Pompe à l\'arrêt'}</span>}</li>
        <li><i className="lqh-k eta" /><span>Rendement de la pompe (axe de droite) : maxi <b>{fr(et[kBep] * 100, 0)} %</b> à {fr(qs[kBep], 1)} m³/h</span></li>
        {running && (() => { const r = liveReadings(ctx, st); const ph = (i.fluid.rho * G * (qOp / 3600) * hOp) / 1000; const g = r.kw > 0 ? ph / r.kw : 0;
          return <li className="lqh-etaop"><span>Rendement au point : pompe <b>{fr(eta(qOp) * 100, 0)} %</b> · global (pompe + moteur) <b>{fr(g * 100, 0)} %</b> · {fr(ph, 2)} kW utiles pour {fr(r.kw, 2)} kW absorbés</span></li>; })()}
        {cz.cav.length > 0 && <li><i className="lqh-k zone" />Zone de cavitation (NPSH disponible &lt; requis)</li>}
        {cz.risk.length > 0 && <li><i className="lqh-k zone risk" />Zone limite (marge NPSH &lt; 1 m)</li>}
        {mOp != null && <li className={mOp < 0 ? 'lqh-bad' : mOp < 1 ? 'lqh-warn' : ''}><span>Marge NPSH au point : <b>{fr(mOp, 1)} m</b>{mOp < 0 ? ' — la pompe cavite' : mOp < 1 ? ' — à la limite' : ''}</span></li>}
      </ul>
    </div>
  );
}

function niceStep(x: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(1e-6, x))), m = x / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}
