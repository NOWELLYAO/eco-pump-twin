import { CartesianGrid, ComposedChart, Legend, Line, ReferenceArea, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { etaAt, headAt, systemHead } from '../engine/physics';
import type { Analysis, PumpConfig } from '../engine/types';
import { LIMITS } from '../engine/twin';
import { fmt, useChartColors } from './util';

const nice = (v: number) => {
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
};

/** Courbes H-Q et rendement-Q : modèle sain, réseau et point mesuré. */
export function CurveCharts({ cfg, a, compact = false }: { cfg: PumpConfig; a: Analysis | null; compact?: boolean }) {
  const c = useChartColors();
  const { spec, system } = cfg;
  const s = a && a.m.n > 0 ? a.m.n / spec.nn : cfg.controls.speedPct / 100;
  const qMax = nice(Math.max(spec.qn * s * 1.45, (a?.m.q ?? 0) * 1.1));
  const steps = 40;
  const data = Array.from({ length: steps + 1 }, (_, i) => {
    const q = (qMax * i) / steps;
    const hp = headAt(spec, q, s);
    return {
      q,
      hp: hp > 0 ? hp : null,
      hs: systemHead(spec, system, q, cfg.controls.valvePct),
      eta: etaAt(spec, q, s) * 100 > 3 && hp > 0 ? etaAt(spec, q, s) * 100 : null,
    };
  });
  const hTop = nice(spec.hn * spec.shutoffRatio * Math.max(1, s * s) * 1.1);
  const meas = a && a.m.q > 0.01 ? [{ q: a.m.q, h: a.h }] : [];
  const exp = a && a.m.q > 0.01 ? [{ q: a.m.q, h: a.hExp }] : [];
  const etaMeas = a && a.m.q > 0.01 ? [{ q: a.m.q, eta: a.eta }] : [];
  const tip = {
    contentStyle: { background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 10, color: c.ink, fontSize: 13 },
    labelFormatter: (v: unknown) => `Débit ${fmt(Number(v), 1)} m³/h`,
  };
  const axis = { stroke: c.axis, fontSize: 12, tickLine: false };

  return (
    <div className="curves">
      <figure>
        <figcaption>Hauteur en fonction du débit <span>(m)</span></figcaption>
        <ResponsiveContainer width="100%" height={compact ? 230 : 300}>
          <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <ReferenceArea x1={spec.qn * s * LIMITS.xLow} x2={spec.qn * s * LIMITS.xHigh} fill={c.band} stroke="none" ifOverflow="hidden" />
            <XAxis dataKey="q" type="number" domain={[0, qMax]} {...axis} tickFormatter={(v) => fmt(v, 0)} unit="" />
            <YAxis domain={[0, hTop]} allowDataOverflow {...axis} tickFormatter={(v) => fmt(v, 0)} width={44} />
            <Tooltip {...tip} formatter={(v, n) => [`${fmt(Number(v), 1)} m`, n]} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12.5, paddingTop: 4 }} />
            <Line name="Pompe saine (modèle)" dataKey="hp" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
            <Line name="Réseau" dataKey="hs" stroke={c.s3} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
            <Scatter name="Attendu (sain)" data={exp} dataKey="h" fill={c.s1} stroke={c.surface} strokeWidth={2} shape="circle" isAnimationActive={false} legendType="circle" />
            <Scatter name="Mesuré" data={meas} dataKey="h" fill={c.s2} stroke={c.surface} strokeWidth={2} shape="circle" isAnimationActive={false} legendType="circle" />
          </ComposedChart>
        </ResponsiveContainer>
      </figure>
      {!compact && (
        <figure>
          <figcaption>Rendement en fonction du débit <span>(%)</span></figcaption>
          <ResponsiveContainer width="100%" height={190}>
            <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <ReferenceArea x1={spec.qn * s * LIMITS.xLow} x2={spec.qn * s * LIMITS.xHigh} fill={c.band} stroke="none" ifOverflow="hidden" />
              <XAxis dataKey="q" type="number" domain={[0, qMax]} {...axis} tickFormatter={(v) => fmt(v, 0)} />
              <YAxis domain={[0, 100]} {...axis} width={44} />
              <Tooltip {...tip} formatter={(v, n) => [`${fmt(Number(v), 1)} %`, n]} />
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 12.5, paddingTop: 4 }} />
              <Line name="Rendement sain (modèle)" dataKey="eta" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
              <Scatter name="Rendement mesuré" data={etaMeas} dataKey="eta" fill={c.s2} stroke={c.surface} strokeWidth={2} isAnimationActive={false} legendType="circle" />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="axis-note">Débit (m³/h). La bande bleutée est la plage de fonctionnement conseillée (70–120 % du débit optimal).</p>
        </figure>
      )}
    </div>
  );
}
