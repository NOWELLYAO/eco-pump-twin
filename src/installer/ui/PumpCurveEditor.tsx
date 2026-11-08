import { useEffect, useRef, useState } from 'react';
import { LineChart, Plus, Trash2, Wand2 } from 'lucide-react';
import { fitCurve, ptsFromNominal, validPts, type PPt } from '../pumpcurve';
import type { Installation } from '../types';
import { Toggle } from './Fields';

const show = (v: number | undefined) => (v == null || !Number.isFinite(v) ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
const fx = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

function Cell({ value, onChange, ph }: { value: number | undefined; onChange: (v: number | undefined) => void; ph?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [t, setT] = useState(show(value));
  useEffect(() => { if (document.activeElement !== ref.current) setT(show(value)); }, [value]);
  return (
    <input ref={ref} inputMode="decimal" value={t} placeholder={ph}
      onChange={(e) => {
        setT(e.target.value);
        const s = e.target.value.replace(',', '.').trim();
        if (s === '') onChange(undefined);
        else { const v = Number(s); if (Number.isFinite(v) && v >= 0) onChange(v); }
      }}
      onBlur={() => setT(show(value))} />
  );
}

/** Mise à jour du point nominal (meilleur rendement) à partir de la courbe saisie, pour que tous les calculs restent cohérents. */
export function syncNominal(p: Installation['pump']): Installation['pump'] {
  const f = fitCurve(p.pts);
  if (!p.usePts || !f) return p;
  const r = (v: number, d = 10) => Math.round(v * d) / d;
  if (f.bep && f.bep.q > 0) {
    const hn = f.H(f.bep.q);
    return { ...p, qn: r(f.bep.q), hn: r(hn), eta: Math.round(f.bep.eta * 100) / 100, shutoff: Math.max(1.02, r(f.H(0) / hn, 100)), npshr: f.N ? r(f.N(f.bep.q)) : p.npshr };
  }
  const hn = f.H(p.qn);
  return hn > 0 ? { ...p, hn: r(hn), shutoff: Math.max(1.02, r(f.H(0) / hn, 100)), npshr: f.N ? r(f.N(p.qn)) : p.npshr } : p;
}

export function PumpCurveEditor({ pump, onChange }: { pump: Installation['pump']; onChange: (p: Installation['pump']) => void }) {
  const pts = pump.pts ?? [];
  const f = fitCurve(pts);
  const valid = validPts(pts);
  const set = (np: PPt[], use = pump.usePts) => onChange(syncNominal({ ...pump, pts: np, usePts: use }));
  const upd = (k: number, patch: Partial<PPt>) => set(pts.map((p, n) => (n === k ? { ...p, ...patch } : p)));
  // Contrôle de forme : la hauteur doit baisser quand le débit augmente
  const rising = valid.some((p, n) => n > 0 && p.h > valid[n - 1].h * 1.05);

  // Mini-graphe : points saisis et courbe ajustée
  const W = 300, Hh = 130, pad = 26;
  const qMax = Math.max(1, ...(f ? [f.qZero] : []), ...valid.map((p) => p.q)) * 1.05;
  const hMax = Math.max(1, ...valid.map((p) => p.h), ...(f ? [f.H(0)] : [])) * 1.1;
  const X = (q: number) => pad + (q / qMax) * (W - pad - 8);
  const Y = (h: number) => Hh - 18 - (Math.max(0, h) / hMax) * (Hh - 28);
  const path = f ? Array.from({ length: 41 }, (_, k) => { const q = (f.qZero * k) / 40; return `${k ? 'L' : 'M'}${X(q).toFixed(1)} ${Y(f.H(q)).toFixed(1)}`; }).join(' ') : '';
  const epath = f?.E ? Array.from({ length: 41 }, (_, k) => { const q = (Math.min(f.qZero, f.q1 * 1.15) * k) / 40; return `${k ? 'L' : 'M'}${X(q).toFixed(1)} ${(Hh - 18 - f.E!(q) * (Hh - 28)).toFixed(1)}`; }).join(' ') : '';

  return (
    <div className="pce">
      <h4 className="isub"><LineChart size={15} aria-hidden /> Courbe du fabricant</h4>
      <p className="ihint">Relevez 3 à 8 points sur la courbe de la fiche technique (débit, hauteur ; rendement et NPSH requis si disponibles). Plus il y a de points, plus les calculs sont justes, surtout loin du point nominal.</p>
      <Toggle label="Utiliser cette courbe pour tous les calculs" checked={!!pump.usePts} onChange={(v) => set(pts.length ? pts : ptsFromNominal(pump.qn, pump.hn, pump.shutoff, pump.eta, pump.npshr), v)} />
      {(pump.usePts || pts.length > 0) && (
        <>
          <div className="pce-table" role="table">
            <div className="pce-row head" role="row"><span>Débit m³/h</span><span>Hauteur m</span><span>Rendement %</span><span>NPSHr m</span><span /></div>
            {pts.map((p, k) => (
              <div className="pce-row" role="row" key={k}>
                <Cell value={p.q} onChange={(v) => upd(k, { q: v ?? NaN })} />
                <Cell value={p.h} onChange={(v) => upd(k, { h: v ?? NaN })} />
                <Cell value={p.eta} onChange={(v) => upd(k, { eta: v })} ph="—" />
                <Cell value={p.npshr} onChange={(v) => upd(k, { npshr: v })} ph="—" />
                <button type="button" className="icon-btn sm" aria-label="Supprimer ce point" onClick={() => set(pts.filter((_, n) => n !== k))}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          <div className="row">
            <button type="button" className="btn sm" disabled={pts.length >= 8} onClick={() => { const last = pts[pts.length - 1]; set([...pts, { q: last ? Math.round(last.q * 1.2 * 10) / 10 : 0, h: NaN }]); }}><Plus size={14} aria-hidden /> Ajouter un point</button>
            <button type="button" className="btn sm" onClick={() => set(ptsFromNominal(pump.qn, pump.hn, pump.shutoff, pump.eta, pump.npshr))}><Wand2 size={14} aria-hidden /> Repartir du point nominal</button>
          </div>
          <svg viewBox={`0 0 ${W} ${Hh}`} className="pce-plot" role="img" aria-label="Courbe saisie">
            <path d={`M${pad} 6 V${Hh - 18} H${W - 6}`} className="pce-axis" />
            <text x={pad - 4} y={12} textAnchor="end" className="pce-t">{fx(hMax, 0)}</text>
            <text x={W - 6} y={Hh - 4} textAnchor="end" className="pce-t">{fx(qMax, 0)} m³/h</text>
            {epath && <path d={epath} className="pce-eta" />}
            {path && <path d={path} className="pce-fit" />}
            {valid.map((p, k) => <circle key={k} cx={X(p.q)} cy={Y(p.h)} r={3.5} className="pce-pt" />)}
            {f?.bep && <circle cx={X(f.bep.q)} cy={Y(f.bep.h)} r={5} className="pce-bep" />}
          </svg>
          {valid.length < 3 && <p className="ihint warn">Il faut au moins 3 points valides (débit et hauteur) : en attendant, le modèle à un point est utilisé.</p>}
          {rising && <p className="ihint warn">Vérifiez les points : sur une pompe centrifuge, la hauteur baisse quand le débit augmente.</p>}
          {f && (
            <p className="ihint ok">
              Courbe ajustée sur {valid.length} points (écart maxi {fx(f.maxErr, 2)} m) · {fx(f.H(0), 1)} m à débit nul · débit maxi ≈ {fx(f.qZero, 1)} m³/h
              {f.bep ? <> · meilleur rendement {fx(f.bep.eta * 100, 0)} % à {fx(f.bep.q, 1)} m³/h et {fx(f.bep.h, 1)} m (point nominal mis à jour)</> : <> · sans rendements saisis, le rendement reste estimé à partir du point nominal</>}.
              {!pump.usePts && <b> Activez l'interrupteur pour l'utiliser.</b>}
            </p>
          )}
        </>
      )}
    </div>
  );
}
