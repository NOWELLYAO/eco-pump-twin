import { useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Analysis } from '../engine/types';
import { LIMITS } from '../engine/twin';
import { fmt, simClock, useChartColors } from './util';

interface Ind {
  key: string;
  label: string;
  unit: string;
  d: number;
  get: (a: Analysis) => number;
  exp?: (a: Analysis) => number;
  warn?: number;
  crit?: number;
}

const INDS: Ind[] = [
  { key: 'h', label: 'Hauteur', unit: 'm', d: 1, get: (a) => a.h, exp: (a) => a.hExp },
  { key: 'devH', label: 'Écart hauteur', unit: '%', d: 1, get: (a) => a.devH, warn: LIMITS.devHWarn, crit: LIMITS.devHCrit },
  { key: 'q', label: 'Débit', unit: 'm³/h', d: 1, get: (a) => a.m.q },
  { key: 'p', label: 'Puissance', unit: 'kW', d: 2, get: (a) => a.m.pElec, exp: (a) => a.pExp },
  { key: 'eta', label: 'Rendement', unit: '%', d: 1, get: (a) => a.eta, exp: (a) => a.etaExp },
  { key: 'vib', label: 'Vibrations', unit: 'mm/s', d: 2, get: (a) => a.m.vib, warn: LIMITS.vibWarn, crit: LIMITS.vibCrit },
  { key: 'temp', label: 'Température', unit: '°C', d: 1, get: (a) => a.m.temp, warn: LIMITS.tempWarn, crit: LIMITS.tempCrit },
  { key: 'npsh', label: 'Marge NPSH', unit: 'm', d: 2, get: (a) => a.margin, warn: LIMITS.marginWarn, crit: LIMITS.marginCrit },
];

export function TrendChart({ hist, initial = 'h', height = 280 }: { hist: Analysis[]; initial?: string; height?: number }) {
  const c = useChartColors();
  const [key, setKey] = useState(initial);
  const ind = INDS.find((i) => i.key === key) ?? INDS[0];
  const data = hist.map((a) => ({
    t: a.m.label ?? simClock(a.m.t),
    v: a.m.q > 0.01 || ind.key === 'temp' || ind.key === 'vib' ? ind.get(a) : null,
    e: ind.exp && a.m.q > 0.01 ? ind.exp(a) : null,
  }));
  const axis = { stroke: c.axis, fontSize: 12, tickLine: false };

  return (
    <div>
      <div className="chips" role="tablist" aria-label="Indicateur affiché">
        {INDS.map((i) => (
          <button key={i.key} role="tab" aria-selected={i.key === key} className={i.key === key ? 'chip on' : 'chip'} onClick={() => setKey(i.key)}>
            {i.label}
          </button>
        ))}
      </div>
      <figure>
        <figcaption>{ind.label} <span>({ind.unit})</span></figcaption>
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="t" {...axis} minTickGap={48} />
            <YAxis {...axis} width={48} domain={['auto', 'auto']} tickFormatter={(v) => fmt(v, Number.isInteger(v) ? 0 : 1)} />
            <Tooltip
              contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 10, color: c.ink, fontSize: 13 }}
              formatter={(v, n) => [`${fmt(Number(v), ind.d)} ${ind.unit}`, n]}
            />
            {ind.exp && <Legend iconType="plainline" wrapperStyle={{ fontSize: 12.5 }} />}
            {ind.warn != null && <ReferenceLine y={ind.warn} stroke={c.warn} strokeDasharray="4 4" label={{ value: 'Alerte', position: 'insideTopRight', fill: c.axis, fontSize: 11 }} />}
            {ind.crit != null && <ReferenceLine y={ind.crit} stroke={c.crit} strokeDasharray="4 4" label={{ value: 'Danger', position: 'insideTopRight', fill: c.axis, fontSize: 11 }} />}
            {ind.exp && <Line name="Attendu (pompe saine)" dataKey="e" stroke={c.s1} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />}
            <Line name="Mesuré" dataKey="v" stroke={ind.exp ? c.s2 : c.s1} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </figure>
    </div>
  );
}
