import { useRef, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { MONTHS, effectiveStart } from '../electrical';
import { losses, pumpHead, speedFor, systemHeadAt } from '../hydraulics';
import type { Evaluation } from '../evaluate';
import type { Installation } from '../types';
import { fmt, money, useChartColors } from '../../ui/util';

/* Graphiques (Recharts), chargés à la demande pour alléger le démarrage de l'application. */

export function InstCurve({ i, ev }: { i: Installation; ev: Evaluation }) {
  const c = useChartColors();
  const h = ev.hydro;
  const op = h.ok ? [{ q: h.q, y: h.h }] : [];
  const qN = i.duty.qReq;
  const demandAt = (q: number) => systemHeadAt(i, q);
  const need = [{ q: qN, y: demandAt(qN) }];
  const axis = { stroke: c.axis, fontSize: 12, tickLine: false };
  const top = Math.max(...h.curve.map((p) => p.hp ?? 0), demandAt(qN)) * 1.15;
  const h0 = pumpHead(i, 0);
  const givesAtNeed = pumpHead(i, qN);
  const asksAtNeed = demandAt(qN);
  const gap = givesAtNeed - asksAtNeed;
  const fricOp = h.ok ? h.hLoss : losses(i, qN).total;
  const parts = [
    { l: 'Hauteur à monter', v: Math.max(0, h.hStatic), cls: 'geo' },
    { l: `Pression demandée (${fmt(i.duty.pRes, 1)} bar)`, v: Math.max(0, h.hPress), cls: 'press' },
    { l: 'Frottements dans les tuyaux', v: Math.max(0, fricOp), cls: 'fric' },
  ];
  const tot = parts.reduce((a, b) => a + b.v, 0) || 1;
  // Vitesse de variateur qui amènerait le point sur le besoin
  const qe = qN / h.n;
  const sVfd = speedFor(i, qN, asksAtNeed);
  // Variateur : courbe de la pompe à vitesse réduite (lois de similitude H(q, s) = s² · H(q / s))
  const hasVfd = effectiveStart(i) === 'variateur' && i.elec.supply !== 'solaire';
  const vfdPossible = h.ok && h.q > qN * 1.03 && sVfd > 0.3 && sVfd < 0.995;
  // Sans variateur installé, sa courbe n'est tracée que si on la demande
  const [askVfd, setAskVfd] = useState(false);
  const vfdOk = vfdPossible && (hasVfd || askVfd);
  const vfdHz = sVfd * 50;
  // Plusieurs pompes en parallèle : la courbe « pompe » est celle des pompes en service ensemble ; on montre aussi une pompe seule
  const multi = h.n > 1;
  const total = Math.max(1, i.pump.count ?? 1);
  const spare = total - h.n; // pompes de secours (non comptées dans le service)
  const all: Installation = { ...i, pump: { ...i.pump, count: total, standby: 0 } };
  const hAll = (q: number) => { const v = pumpHead(all, q); return v > 0 ? v : null; };
  const one: Installation = { ...i, pump: { ...i.pump, count: 1, standby: 0 } };
  const hv = (q: number) => { const v = sVfd * sVfd * pumpHead(i, q / sVfd); return v > 0 ? v : null; };
  const h1 = (q: number) => { const v = pumpHead(one, q); return v > 0 ? v : null; };
  const data = h.curve.map((p) => ({ ...p, ...(vfdOk ? { hv: hv(p.q) } : {}), ...(multi ? { h1: h1(p.q) } : {}), ...(spare > 0 ? { ha: hAll(p.q) } : {}) }));
  const qMax = h.curve[h.curve.length - 1]?.q ?? 1;
  // Curseur maison : la valeur est calculée exactement au débit pointé (doigt ou souris)
  const [hq, setHq] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const pointTo = (clientX: number) => {
    const grid = boxRef.current?.querySelector('.recharts-cartesian-grid');
    const r = grid?.getBoundingClientRect();
    if (!r || r.width < 10) return;
    const q = Math.max(0, Math.min(qMax, ((clientX - r.left) / r.width) * qMax));
    setHq(q);
  };
  const tipHp = hq != null ? pumpHead(i, hq) : 0;
  const tipHs = hq != null ? demandAt(hq) : 0;
  const regPt = vfdOk ? [{ q: qN, y: asksAtNeed }] : [];
  const xReg = qe / (i.pump.qn * sVfd);
  const vs = ev.elec.vfdSpeed;
  const rho = i.fluid.rho * 9.81 / 3.6e6;
  const kwhM3Now = h.ok && h.q > 0 ? h.pElec / h.q : 0;
  const kwhM3Reg = vs ? vs.pNew / qN : vfdOk ? (rho * asksAtNeed) / Math.max(0.3, i.pump.eta * 0.95) / 0.88 : 0;
  const vfdName = hasVfd ? `Avec le variateur (${fmt(vfdHz, 0)} Hz)` : `Si vous ajoutez un variateur (${fmt(vfdHz, 0)} Hz)`;
  return (
    <figure className="instcurve">
      <figcaption>{multi ? `Ce que les ${h.n} pompes en service fournissent ensemble` : total > 1 ? 'Ce que la pompe en service fournit' : 'Ce que la pompe fournit'} face à ce que l'installation demande <span>(hauteur en m, débit en m³/h)</span></figcaption>
      {spare > 0 && <p className="small curnote">{total} pompes installées : <b>{h.n} en service</b> et <b>{spare} de secours</b>. La secours ne tourne qu'en cas de panne (ou en permutation) : elle n'ajoute pas de débit. Pointillés : ce que donneraient les {total} pompes si elles tournaient toutes ensemble.</p>}
      <div className={`curtip ${hq == null ? 'empty' : ''}`} aria-live="polite">
        {hq == null ? <span>Touchez ou survolez le graphique pour lire les valeurs à un débit donné.</span> : (
          <>
            <b>{fmt(hq, 1)} m³/h</b>
            <span className="cp">{multi ? `${h.n} pompes` : 'pompe'}{vfdOk ? ' 50 Hz' : ''} : {tipHp > 0 ? `${fmt(tipHp, 1)} m` : '—'}</span>
            {multi && <span className="c1">1 pompe seule : {h1(hq) != null ? `${fmt(h1(hq)!, 1)} m` : '—'}</span>}
            {spare > 0 && <span className="c1">{total} pompes ensemble : {hAll(hq) != null ? `${fmt(hAll(hq)!, 1)} m` : '—'}</span>}
            {vfdOk && <span className="cv">{fmt(vfdHz, 0)} Hz : {hv(hq) != null ? `${fmt(hv(hq)!, 1)} m` : '—'}</span>}
            <span className="cn">installation : {fmt(tipHs, 1)} m</span>
            <span className={`cg ${tipHp >= tipHs ? 'ok' : 'ko'}`}>{tipHp <= 0 ? 'la pompe ne débite pas autant' : tipHp >= tipHs ? `+${fmt(tipHp - tipHs, 1)} m de réserve` : `il manque ${fmt(tipHs - tipHp, 1)} m`}</span>
          </>
        )}
      </div>
      <div ref={boxRef} className="curbox"
        onPointerMove={(e) => pointTo(e.clientX)} onPointerDown={(e) => pointTo(e.clientX)}
        onPointerLeave={(e) => { if (e.pointerType === 'mouse') setHq(null); }}>
      <ResponsiveContainer width="100%" height={330}>
        <ComposedChart data={data} margin={{ top: 34, right: 16, bottom: 4, left: -6 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="q" type="number" domain={[0, 'dataMax']} {...axis} tickFormatter={(v) => fmt(v, 0)} />
          <YAxis domain={[0, Math.ceil(top / 5) * 5]} allowDataOverflow {...axis} width={44} tickFormatter={(v) => fmt(v, 0)} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12.5 }} />
          <Line name={`${multi ? `${h.n} pompes en parallèle` : total > 1 ? '1 pompe en service' : 'Ce que la pompe fournit'}${vfdOk ? ' (50 Hz)' : ''}`} dataKey="hp" stroke={c.s1} strokeWidth={2.5} dot={false} activeDot={false} isAnimationActive={false} />
          {spare > 0 && <Line name={`${total} pompes ensemble (secours comprise)`} dataKey="ha" stroke={c.s1} strokeWidth={1.5} strokeDasharray="8 5" strokeOpacity={0.6} dot={false} activeDot={false} isAnimationActive={false} />}
          {multi && <Line name="1 pompe seule" dataKey="h1" stroke={c.s1} strokeWidth={1.5} strokeDasharray="3 4" dot={false} activeDot={false} isAnimationActive={false} />}
          {vfdOk && <Line name={vfdName} dataKey="hv" stroke={c.good} strokeWidth={2.5} strokeDasharray={hasVfd ? undefined : '2 4'} dot={false} activeDot={false} isAnimationActive={false} connectNulls={false} />}
          <Line name="Ce que l'installation demande" dataKey="hs" stroke={c.s3} strokeWidth={2.5} strokeDasharray="6 4" dot={false} activeDot={false} isAnimationActive={false} />
          {i.pump.usePts && (i.pump.pts?.length ?? 0) > 0 && <Scatter name={`Points du fabricant${h.n > 1 ? ' (1 pompe)' : ''}`} data={(i.pump.pts ?? []).filter((p) => p.h > 0 && Number.isFinite(p.q)).map((p) => ({ q: p.q, y: p.h }))} dataKey="y" fill={c.surface} stroke={c.s1} strokeWidth={2} legendType="circle" isAnimationActive={false} />}
          <Scatter name="Votre besoin" data={need} dataKey="y" fill={c.ink} stroke={c.surface} strokeWidth={2} legendType="circle" isAnimationActive={false} />
          <Scatter name={vfdOk ? 'Point à 50 Hz' : 'Point de fonctionnement réel'} data={op} dataKey="y" fill={c.s2} stroke={c.surface} strokeWidth={2} legendType="circle" isAnimationActive={false} />
          {vfdOk && hasVfd && <Scatter name={`Point réel avec variateur`} data={regPt} dataKey="y" fill={c.good} stroke={c.surface} strokeWidth={2} legendType="diamond" shape="diamond" isAnimationActive={false} />}
          {hq != null && <ReferenceLine x={hq} stroke={c.axis} strokeDasharray="4 3" ifOverflow="extendDomain" />}
          {hq != null && tipHp > 0 && <ReferenceDot x={hq} y={tipHp} r={5} fill={c.s1} stroke={c.surface} strokeWidth={2} />}
          {hq != null && <ReferenceDot x={hq} y={tipHs} r={5} fill={c.s3} stroke={c.surface} strokeWidth={2} />}
          {hq != null && vfdOk && hv(hq) != null && <ReferenceDot x={hq} y={hv(hq)!} r={4} fill={c.good} stroke={c.surface} strokeWidth={2} />}
        </ComposedChart>
      </ResponsiveContainer>
      </div>

      <div className="howto">
        <h5>Comment lire ce graphique</h5>
        <p><span className="key k-pump" /> <b>Ce que la pompe fournit</b> : la hauteur que la pompe est capable de donner selon le débit. Plus elle débite, moins elle pousse fort : {fmt(h0, 0)} m vanne fermée, {fmt(i.pump.hn, 0)} m à {fmt(i.pump.qn, 1)} m³/h{multi ? ` par pompe. Avec ${h.n} pompes identiques en parallèle, les débits s'additionnent à hauteur égale : ${fmt(i.pump.hn, 0)} m à ${fmt(i.pump.qn * h.n, 1)} m³/h (trait plein), contre la pompe seule en pointillés${(i.pump.standby ?? 0) > 0 ? ` ; la pompe de secours n'est pas comptée` : ''}` : ''}.</p>
        <p><span className="key k-net" /> <b>Ce que l'installation demande</b> : la hauteur qu'il faut pour faire passer l'eau dans vos tuyaux jusqu'au point d'utilisation. {h.ok ? 'Au point de fonctionnement' : `À votre besoin (${fmt(qN, 1)} m³/h)`}, elle se compose de :</p>
        <div className="stackbar">{parts.map((p) => <i key={p.cls} className={p.cls} style={{ width: `${(p.v / tot) * 100}%` }} title={`${p.l} : ${fmt(p.v, 1)} m`} />)}</div>
        <ul className="stacklegend">{parts.map((p) => <li key={p.cls}><i className={p.cls} /> {p.l} : <b>{fmt(p.v, 1)} m</b></li>)}</ul>
        <p className="small muted">Les deux premières ne changent pas avec le débit ; les frottements augmentent quand le débit augmente. C'est pour cela que la ligne violette monte.</p>
        <p><span className="key k-op" /> <b>Le point de fonctionnement</b> est le croisement des deux lignes : c'est là que la pompe donne exactement ce que l'installation demande. {h.ok ? <>Ici : <b>{fmt(h.q, 1)} m³/h à {fmt(h.h, 1)} m</b>, soit {fmt(h.x * 100, 0)} % du débit idéal de la pompe.</> : <b>Les lignes ne se croisent pas : la pompe n'a pas assez de hauteur, aucun débit.</b>}</p>
        <div className={`verdictline ${Math.abs(gap) / Math.max(1, asksAtNeed) < 0.08 ? 'ok' : gap > 0 ? 'over' : 'under'}`}>
          {Math.abs(gap) / Math.max(1, asksAtNeed) < 0.08
            ? <>À votre besoin ({fmt(qN, 1)} m³/h), la pompe donne {fmt(givesAtNeed, 1)} m et l'installation en demande {fmt(asksAtNeed, 1)} m : <b>la pompe est bien adaptée.</b></>
            : gap > 0
              ? <>À votre besoin ({fmt(qN, 1)} m³/h), la pompe donne <b>{fmt(givesAtNeed, 0)} m</b> alors que l'installation n'en demande que <b>{fmt(asksAtNeed, 0)} m</b> : <b>{fmt(gap, 0)} m de trop</b>. Ce surplus fait accélérer l'eau jusqu'au croisement{h.ok ? ` (${fmt(h.q, 1)} m³/h)` : ''}. Pour revenir au besoin : pompe plus petite{sVfd > 0.5 && sVfd < 1 ? `, variateur à ${fmt(sVfd * 100, 0)} % (${fmt(sVfd * 50, 0)} Hz)` : ''} ou vanne partiellement fermée (énergie perdue).</>
              : h.ok
                ? <>À votre besoin ({fmt(qN, 1)} m³/h), la pompe ne donne que <b>{fmt(Math.max(0, givesAtNeed), 0)} m</b> alors que l'installation demande <b>{fmt(asksAtNeed, 0)} m</b> : <b>il manque {fmt(-gap, 0)} m</b>. Le débit reste donc plus faible ({fmt(h.q, 1)} m³/h). Il faut une pompe plus puissante, ou réduire les frottements (tuyaux plus gros) ou la pression demandée.</>
                : <><b>Aucun débit : les deux lignes ne se croisent pas.</b> Même vanne fermée, la pompe ne pousse qu'à <b>{fmt(h0, 0)} m</b>, alors que l'installation demande déjà <b>{fmt(h.hStatic + h.hPress, 0)} m</b> sans aucun débit (hauteur à monter {fmt(h.hStatic, 1)} m + pression {fmt(h.hPress, 1)} m). À votre besoin, il manquerait <b>{fmt(-gap, 0)} m</b>. Il faut une pompe d'au moins <b>{fmt(asksAtNeed * 1.05, 0)} m à {fmt(qN, 1)} m³/h</b> (plus d'étages ou roue plus grande), ou baisser la pression demandée.</>}
        </div>
        {hasVfd && (
          <div className={`vfdbox ${vfdOk ? 'ok' : 'no'}`}>
            <h5>Effet du variateur</h5>
            {vfdOk ? (
              <>
                <p>Le variateur ralentit la pompe jusqu'à ce qu'elle donne <b>exactement votre besoin</b>. Sa courbe descend (ligne verte) et croise la demande de l'installation sur votre besoin : le point de fonctionnement passe du point orange (50 Hz) au losange vert.</p>
                <table className="tbl vfdtbl">
                  <thead><tr><th /><th>Sans variateur<br /><small>50 Hz</small></th><th>Avec variateur<br /><small>{fmt(vfdHz, 1)} Hz</small></th></tr></thead>
                  <tbody>
                    <tr><th>Vitesse</th><td>{fmt(i.pump.nn, 0)} tr/min</td><td><b>{fmt(i.pump.nn * sVfd, 0)} tr/min</b></td></tr>
                    <tr><th>Débit</th><td>{fmt(h.q, 1)} m³/h</td><td><b>{fmt(qN, 1)} m³/h</b></td></tr>
                    <tr><th>Hauteur</th><td>{fmt(h.h, 1)} m</td><td><b>{fmt(asksAtNeed, 1)} m</b></td></tr>
                    <tr><th>Position sur la courbe</th><td className={h.x > 1.2 || h.x < 0.7 ? 'bad' : ''}>{fmt(h.x * 100, 0)} % du débit optimal</td><td className={xReg > 1.2 || xReg < 0.7 ? 'bad' : 'good'}><b>{fmt(xReg * 100, 0)} %</b></td></tr>
                    {vs && <tr><th>Puissance absorbée</th><td>{fmt(vs.pNow, 2)} kW</td><td><b>{fmt(vs.pNew, 2)} kW</b></td></tr>}
                    {kwhM3Now > 0 && kwhM3Reg > 0 && <tr><th>Énergie par m³</th><td>{fmt(kwhM3Now, 3)} kWh</td><td><b>{fmt(kwhM3Reg, 3)} kWh</b></td></tr>}
                  </tbody>
                </table>
                {vs && vs.saving > 0.02 && <p className="small">Économie : <b>{fmt(vs.saving * 100, 0)} % d'énergie par m³</b> pompé, soit environ <b>{money(h.costYear * vs.saving, i.duty.currency)}</b> par an.</p>}
                <p className="small muted">Réglage : consigne du variateur sur la pression ou le débit voulu (capteur de pression), ou fréquence fixe ≈ {fmt(vfdHz, 0)} Hz.</p>
              </>
            ) : h.ok && h.q <= qN * 1.03 ? (
              <p>Le variateur ne peut <b>pas augmenter</b> le débit : à 50 Hz, la pompe donne déjà {h.q < qN * 0.97 ? <>moins que votre besoin ({fmt(h.q, 1)} m³/h pour {fmt(qN, 1)} m³/h)</> : 'juste votre besoin'}. Il tourne donc à 50 Hz et sert seulement au démarrage progressif et à la protection du moteur.{h.q < qN * 0.97 && ' Pour atteindre le besoin : pompe plus forte, ou réseau moins exigeant (tuyaux plus gros, pression plus basse).'}</p>
            ) : (
              <p>Le variateur ne peut rien faire ici : la pompe n'atteint pas la hauteur nécessaire, même à pleine vitesse.</p>
            )}
          </div>
        )}
        {!hasVfd && vfdPossible && i.elec.supply !== 'solaire' && (
          vfdOk ? (
            <div className="vfdbox opt">
              <h5>Et avec un variateur ?</h5>
              <p>La ligne verte en pointillés montre la pompe ralentie à <b>{fmt(vfdHz, 0)} Hz</b> : elle donnerait exactement votre besoin ({fmt(qN, 1)} m³/h), à {fmt(xReg * 100, 0)} % de son débit optimal. Activez le variateur (Électricité ou accessoires) pour voir le gain détaillé.</p>
              <button type="button" className="btn sm" onClick={() => setAskVfd(false)}>Masquer la courbe avec variateur</button>
            </div>
          ) : <button type="button" className="btn sm" onClick={() => setAskVfd(true)}>Voir la courbe avec un variateur</button>
        )}
      </div>
    </figure>
  );
}

export function SolarMonths({ s, need }: { s: NonNullable<Evaluation['elec']['solar']>; need: number }) {
  const c = useChartColors();
  const data = s.monthly!.map((x) => ({ mois: MONTHS[x.m].replace('.', ''), m3: Math.round(x.m3 * 10) / 10, used: x.used, ghi: x.ghi }));
  return (
    <figure className="mt-s">
      <figcaption>Eau pompée par jour, mois par mois <span>(m³/jour)</span></figcaption>
      <ResponsiveContainer width="100%" height={210}>
        <BarChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="mois" stroke={c.axis} fontSize={11} tickLine={false} interval={0} />
          <YAxis stroke={c.axis} fontSize={11} tickLine={false} width={40} />
          <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 10, color: c.ink, fontSize: 13 }}
            formatter={(v, _n, p) => [`${fmt(Number(v), 1)} m³/j · ${fmt((p.payload as { ghi: number }).ghi, 2)} kWh/m²/j${(p.payload as { used: boolean }).used ? '' : ' (non utilisé)'}`, 'Volume']} />
          <ReferenceLine y={need} stroke={c.s2} strokeDasharray="5 4" label={{ value: `Besoin ${fmt(need, 0)} m³/j`, position: 'insideTopRight', fill: c.axis, fontSize: 11 }} />
          <Bar dataKey="m3" radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {data.map((d) => <Cell key={d.mois} fill={d.used ? (d.m3 >= need ? c.s1 : c.crit) : c.grid} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="axis-note">Barres bleues : mois utilisés couverts ; rouges : mois utilisés sous le besoin ; grises : mois non utilisés.</p>
    </figure>
  );
}
