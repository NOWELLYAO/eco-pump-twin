import { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, Eye, ListChecks, Package, ShieldAlert, Sparkles, Sun, Wrench, Zap } from 'lucide-react';
import { START_LABEL, SUPPLY_LABEL } from '../electrical';
import { mountSequence, posAdvice } from '../positions';
import { CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import { ACC, ACCESSORIES, PARTS, PIPE_MATS, PUMP_MATS, PUMP_TYPES, refLen } from '../catalog';
import { CAT_LABEL, type Evaluation } from '../evaluate';
import type { Category, Installation, Issue, Sev } from '../types';
import { LevelIcon } from '../../ui/Status';
import { fmt, money, useChartColors } from '../../ui/util';

const LV: Record<Sev, 'critical' | 'warning' | 'info'> = { critical: 'critical', warning: 'warning', info: 'info' };
const SEV_LABEL: Record<Sev, string> = { critical: 'Critique', warning: 'Attention', info: 'Conseil' };

export function ScoreCard({ ev }: { ev: Evaluation }) {
  const lvl = ev.verdict.level;
  const ring = lvl === 'excellent' || lvl === 'good' ? 'ok' : lvl === 'fair' ? 'warning' : 'critical';
  const r = 46, c = 2 * Math.PI * r;
  const nC = ev.issues.filter((x) => x.sev === 'critical').length;
  const nW = ev.issues.filter((x) => x.sev === 'warning').length;
  return (
    <section className={`card score v-${lvl}`}>
      <div className="score-top">
        <div className={`ring lv-${ring}`} style={{ width: 108, height: 108 }}>
          <svg width={108} height={108} viewBox="0 0 108 108" aria-hidden>
            <circle cx={54} cy={54} r={r} className="ring-bg" strokeWidth="9" fill="none" />
            <circle cx={54} cy={54} r={r} className="ring-fg" strokeWidth="9" fill="none" strokeLinecap="round" strokeDasharray={`${(ev.score / 100) * c} ${c}`} transform="rotate(-90 54 54)" />
          </svg>
          <span style={{ fontSize: 30 }}>{ev.score}</span>
        </div>
        <div className="score-txt">
          <small>Note de l'installation</small>
          <h2>{ev.verdict.label}</h2>
          <p>{ev.verdict.text}</p>
          <div className="score-counts">
            <span className={`badge lv-${nC ? 'critical' : 'ok'}`}><LevelIcon level={nC ? 'critical' : 'ok'} size={13} /> {nC} critique{nC > 1 ? 's' : ''}</span>
            <span className={`badge lv-${nW ? 'warning' : 'ok'}`}><LevelIcon level={nW ? 'warning' : 'ok'} size={13} /> {nW} alerte{nW > 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      <div className="cats">
        {(Object.keys(CAT_LABEL) as Category[]).map((k) => {
          const v = ev.cats[k];
          const l = v >= 80 ? 'ok' : v >= 50 ? 'warning' : 'critical';
          return (
            <div key={k} className="cat">
              <span>{CAT_LABEL[k]}</span>
              <div className="bar"><i className={`lv-${l}`} style={{ width: `${Math.max(4, v)}%` }} /></div>
              <b>{v}</b>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function KeyFigures({ i, ev }: { i: Installation; ev: Evaluation }) {
  const h = ev.hydro;
  const imm = i.mode === 'immergee';
  const items = [
    { l: 'Débit obtenu', v: h.ok ? `${fmt(h.q, 1)} m³/h` : 'nul', s: `besoin ${fmt(i.duty.qReq, 1)} m³/h` },
    { l: 'HMT', v: `${fmt(h.h, 1)} m`, s: `géo ${fmt(h.hStatic, 1)} + pression ${fmt(h.hPress, 1)} + pertes ${fmt(h.hLoss, 1)}` },
    { l: 'Position sur la courbe', v: `${fmt(h.x * 100, 0)} %`, s: 'du débit optimal (70–120 %)' },
    { l: 'Marge NPSH', v: `${fmt(h.margin, 1)} m`, s: `dispo ${fmt(h.npsha, 1)} / requis ${fmt(h.npshr, 1)}` },
    { l: 'Vitesses', v: imm ? `${fmt(h.vRef, 2)} m/s` : `${fmt(h.vAsp, 2)} / ${fmt(h.vRef, 2)}`, s: imm ? 'refoulement' : 'aspiration / refoulement (m/s)' },
    { l: 'Puissance absorbée', v: `${fmt(h.pShaft, 2)} kW`, s: `moteur ${fmt(i.pump.motorKw, 1)} kW · rendement ${fmt(h.eta * 100, 0)} %` },
    { l: 'Coût énergie / an', v: money(h.costYear, i.duty.currency), s: `${fmt(h.se * 1000, 0)} Wh/m³ · ${i.duty.hoursPerDay} h/j` },
    { l: 'Pression maxi', v: `${fmt(h.pMaxBar, 1)} bar`, s: `vanne fermée · conduite PN${i.ref.pn}` },
  ];
  return (
    <div className="ikpis">
      {items.map((x) => <div key={x.l}><small>{x.l}</small><b>{x.v}</b><span>{x.s}</span></div>)}
    </div>
  );
}

function IssueCard({ x, onFix, open, onToggle, onSelect, active }: { x: Issue; onFix: (x: Issue) => void; open: boolean; onToggle: () => void; onSelect?: (x: Issue) => void; active?: boolean }) {
  return (
    <li className={`issue lv-${LV[x.sev]}${active ? ' active' : ''}`} id={`issue-${x.id}`}>
      <button className="issue-head" onClick={() => { const opening = !open; onToggle(); if (opening) onSelect?.(x); }} aria-expanded={open}>
        <LevelIcon level={LV[x.sev]} size={18} />
        <strong>{x.title}</strong>
        <span className={`badge lv-${LV[x.sev]}`}>{SEV_LABEL[x.sev]}</span>
        <ChevronDown size={18} className={open ? 'chev open' : 'chev'} aria-hidden />
      </button>
      {open && (
        <div className="issue-body">
          <p>{x.detail}</p>
          {x.consequences.length > 0 && (<><h5>Problèmes à prévoir</h5><ul>{x.consequences.map((c) => <li key={c}>{c}</li>)}</ul></>)}
          {x.parts.length > 0 && (<><h5>Pièces exposées</h5><div className="chips-s">{x.parts.map((p) => <span key={p} className="chip-s">{PARTS_LABEL(p)}</span>)}</div></>)}
          <h5>Solutions</h5>
          <ul className="sol">{x.solutions.map((s) => <li key={s}><Wrench size={13} aria-hidden /> {s}</li>)}</ul>
          <div className="row">
            {onSelect && <button className="btn sm" onClick={() => onSelect(x)}><Eye size={14} aria-hidden /> Voir sur le schéma</button>}
            {x.fix && <button className="btn primary sm" onClick={() => onFix(x)}><Sparkles size={14} aria-hidden /> Corriger : {x.fix.label}</button>}
          </div>
        </div>
      )}
    </li>
  );
}
const PARTS_LABEL = (p: string) => PARTS[p] ?? p;

export function Alerts({ ev, onFix, onSelect, activeId, compact, printAll }: { ev: Evaluation; onFix: (x: Issue) => void; onSelect?: (x: Issue) => void; activeId?: string | null; compact?: boolean; printAll?: boolean }) {
  // Une seule alerte ouverte à la fois ; la flèche ouvre et ferme
  const [openId, setOpenId] = useState<string | null>(activeId ?? null);
  useEffect(() => { if (activeId) setOpenId(activeId); }, [activeId]);
  const card = (x: Issue) => (
    <IssueCard key={x.id} x={x} onFix={onFix} open={printAll || openId === x.id} onToggle={() => setOpenId(openId === x.id ? null : x.id)} onSelect={onSelect} active={activeId === x.id} />
  );
  const main = ev.issues.filter((x) => x.sev !== 'info');
  const recs = ev.issues.filter((x) => x.sev === 'info' && x.id.startsWith('rec_'));
  const infos = ev.issues.filter((x) => x.sev === 'info' && !x.id.startsWith('rec_'));
  return (
    <section className="card">
      <h3><ShieldAlert size={16} aria-hidden /> Alertes et diagnostic</h3>
      {main.length === 0 ? <p className="muted ok-line"><CheckCircle2 size={16} aria-hidden /> Aucune alerte : l'installation respecte les règles de l'art.</p> : (
        <ul className="issues">{(compact ? main.slice(0, 4) : main).map(card)}</ul>
      )}
      {!compact && infos.length > 0 && (<><h4 className="sub-h">Optimisations possibles</h4><ul className="issues">{infos.map(card)}</ul></>)}
      {!compact && recs.length > 0 && (
        <>
          <h4 className="sub-h">Accessoires conseillés non installés</h4>
          <div className="recs">
            {recs.map((x) => (
              <button key={x.id} className="rec" onClick={() => onFix(x)} title={x.detail}>
                <span>+</span>{ACC[x.id.slice(4)]?.label}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

export function Goods({ ev }: { ev: Evaluation }) {
  if (!ev.goods.length) return null;
  return (
    <section className="card">
      <h3><CheckCircle2 size={16} aria-hidden /> Points forts</h3>
      <ul className="goods">{ev.goods.map((g) => <li key={g}><CheckCircle2 size={15} aria-hidden /> {g}</li>)}</ul>
    </section>
  );
}

export function PartsAtRisk({ ev }: { ev: Evaluation }) {
  return (
    <section className="card">
      <h3><Package size={16} aria-hidden /> Pièces susceptibles d'être endommagées</h3>
      {ev.parts.length === 0 ? <p className="muted">Aucune pièce particulièrement exposée.</p> : (
        <table className="tbl parts">
          <thead><tr><th>Pièce</th><th>Risque</th><th>Causes</th></tr></thead>
          <tbody>
            {ev.parts.map((p) => (
              <tr key={p.id}>
                <td><b>{p.label}</b></td>
                <td><span className={`badge lv-${LV[p.sev]}`}><LevelIcon level={LV[p.sev]} size={12} /> {p.sev === 'critical' ? 'Élevé' : p.sev === 'warning' ? 'Moyen' : 'Faible'}</span></td>
                <td className="muted">{p.causes.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function Recommendations({ ev }: { ev: Evaluation }) {
  const seen = new Set<string>();
  const list: { s: string; sev: Sev }[] = [];
  for (const x of ev.issues) for (const s of x.solutions) if (!seen.has(s)) { seen.add(s); list.push({ s, sev: x.sev }); }
  return (
    <section className="card">
      <h3><ListChecks size={16} aria-hidden /> Préconisations, par priorité</h3>
      {list.length === 0 ? <p className="muted">Rien à corriger.</p> : (
        <ol className="recos">{list.map((r) => <li key={r.s} className={`lv-${LV[r.sev]}`}><span className={`dot lv-${LV[r.sev] === 'info' ? 'ok' : LV[r.sev]}`} /> {r.s}</li>)}</ol>
      )}
    </section>
  );
}

export function LossTable({ ev }: { ev: Evaluation }) {
  const h = ev.hydro;
  const rows = h.lossItems.filter((x) => x.h > 0.005).sort((a, b) => b.h - a.h);
  return (
    <section className="card">
      <h3>Bilan des pertes de charge <small>au débit de {fmt(h.q, 1)} m³/h</small></h3>
      <table className="tbl">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label + r.side}>
              <th>{r.label}<small className="muted"> · {r.side === 'asp' ? 'aspiration' : 'refoulement'}</small></th>
              <td style={{ width: '40%' }}><div className="bar"><i className="lv-info" style={{ width: `${(r.h / Math.max(0.01, rows[0].h)) * 100}%` }} /></div></td>
              <td className="num">{fmt(r.h, 2)} m</td>
            </tr>
          ))}
          <tr className="tot"><th>Total</th><td /><td className="num">{fmt(h.hLoss, 2)} m</td></tr>
        </tbody>
      </table>
    </section>
  );
}

export function Bom({ i, ev, onFix }: { i: Installation; ev: Evaluation; onFix: (x: Issue) => void }) {
  const imm = i.mode === 'immergee';
  const rows: { d: string; dn: string; q: string; r: string; missing?: Issue }[] = [
    { d: `Pompe ${PUMP_TYPES[i.pumpType].label}`, dn: imm ? `DN${i.pump.dnRef}` : `DN${i.pump.dnAsp}/${i.pump.dnRef}`, q: '1', r: `${i.pump.qn} m³/h à ${i.pump.hn} m · ${PUMP_MATS[i.pump.material]}` },
    { d: `Moteur ${i.pump.nn} tr/min${i.acc.atex?.on ? ' ATEX' : ''}`, dn: '', q: '1', r: `${i.pump.motorKw} kW` },
  ];
  if (!imm) {
    rows.push({ d: `Tube aspiration ${PIPE_MATS[i.asp.material].label}`, dn: `DN${i.asp.dn}`, q: `${i.asp.length} m`, r: `PN${i.asp.pn}` });
    if (i.asp.elbows) rows.push({ d: 'Coude 90° aspiration (grand rayon)', dn: `DN${i.asp.dn}`, q: String(i.asp.elbows), r: '' });
  }
  rows.push({ d: `Tube refoulement ${PIPE_MATS[i.ref.material].label}`, dn: `DN${i.ref.dn}`, q: `${Math.round(refLen(i))} m`, r: `PN${i.ref.pn}${i.pumpType === 'immergee_forage' ? ` · dont colonne ${i.geo.pumpDepth} m` : ''}` });
  if (i.ref.elbows) rows.push({ d: 'Coude 90° refoulement', dn: `DN${i.ref.dn}`, q: String(i.ref.elbows), r: '' });
  for (const a of ACCESSORIES) {
    const st = i.acc[a.id];
    if (st?.on && ev.needs[a.id] !== 'na') {
      rows.push({ d: a.label, dn: a.inline ? `DN${st.dn || ''}` : '', q: String(st.qty || 1), r: a.id === 'cone_exc' ? `méplat ${st.opt ?? 'haut'}` : '' });
    }
  }
  const r = ev.elec;
  const e = i.elec;
  rows.push({ d: `Câble moteur ${r.cableType}`, dn: `${r.cores} ${String(e.cableSec).replace('.', ',')} mm²`, q: `${e.cableLen} m`, r: e.cableMat === 'cu' ? 'cuivre' : 'aluminium' });
  rows.push({ d: 'Disjoncteur moteur + contacteur', dn: '', q: '1', r: `réglage ${fmt(r.inom, 1)} A` });
  if (r.start === 'variateur' && e.supply !== 'solaire') rows.push({ d: `Variateur de fréquence${r.filter ? ` + ${r.filter}` : ''}`, dn: '', q: '1', r: `≥ ${fmt(r.vfdKw, 1)} kW, ${fmt(r.vfdA, 1)} A` });
  if (r.start === 'progressif') rows.push({ d: 'Démarreur progressif', dn: '', q: '1', r: `${fmt(i.pump.motorKw, 1)} kW` });
  if (r.start === 'etoile') rows.push({ d: 'Démarreur étoile-triangle', dn: '', q: '1', r: `${fmt(i.pump.motorKw, 1)} kW` });
  if (e.supply === 'groupe') rows.push({ d: 'Groupe électrogène', dn: '', q: '1', r: `${fmt(Math.max(r.genKva, e.genKva), 0)} kVA` });
  if (r.vessel) { const row = rows.find((x) => x.d === 'Réservoir à vessie'); if (row) row.r = `${r.vessel.vol} L PN${r.vessel.pn} · précharge ${fmt(r.vessel.pre, 1)} bar · ${fmt(r.vessel.pOn, 1)}/${fmt(r.vessel.pOff, 1)} bar`; }
  if (r.solar) {
    rows.push({ d: `Panneau photovoltaïque ${e.solar.panelWc} Wc`, dn: '', q: String(r.solar.n), r: `${r.solar.ns} série × ${r.solar.np} parallèle · ${fmt(r.solar.wc / 1000, 2)} kWc` });
    rows.push({ d: 'Contrôleur / onduleur de pompage solaire MPPT', dn: '', q: '1', r: `≥ ${fmt(i.pump.motorKw, 1)} kW, entrée ≥ ${fmt(r.solar.vocCold, 0)} V DC` });
    rows.push({ d: 'Câble solaire DC', dn: `${String(e.solar.dcSec).replace('.', ',')} mm²`, q: `${e.solar.dcLen * 2} m`, r: 'aller + retour' });
    rows.push({ d: 'Structure support panneaux + parafoudre DC + sectionneur DC', dn: '', q: '1', r: `≈ ${fmt(r.solar.area, 0)} m²` });
  }
  const missing = ev.issues.filter((x) => (x.id.startsWith('miss_') || x.id.startsWith('rec_')) && x.fix);
  const nFl = rows.length - 2;
  return (
    <section className="card">
      <h3><Package size={16} aria-hidden /> Nomenclature de l'installation <small>{rows.length} lignes · env. {nFl * 2 + 2} joints et jeux de boulonnerie</small></h3>
      <div className="tbl-wrap">
        <table className="tbl bom">
          <thead><tr><th>Désignation</th><th>DN</th><th>Qté</th><th>Remarque</th></tr></thead>
          <tbody>
            {rows.map((r, n) => <tr key={n}><td>{r.d}</td><td>{r.dn}</td><td className="num">{r.q}</td><td className="muted">{r.r}</td></tr>)}
            {missing.map((x) => (
              <tr key={x.id} className={`add lv-${x.sev}`}>
                <td>{ACC[x.id.slice(x.id.indexOf('_') + 1)]?.label}</td>
                <td>{ACC[x.id.slice(x.id.indexOf('_') + 1)]?.inline ? `DN${ACC[x.id.slice(x.id.indexOf('_') + 1)].side === 'asp' ? i.asp.dn : i.ref.dn}` : ''}</td>
                <td className="num">1</td>
                <td><button className="link" onClick={() => onFix(x)}>{x.id.startsWith('miss_') ? 'Requis — ajouter' : 'Conseillé — ajouter'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function InstCurve({ i, ev }: { i: Installation; ev: Evaluation }) {
  const c = useChartColors();
  const h = ev.hydro;
  const op = h.ok ? [{ q: h.q, y: h.h }] : [];
  const need = [{ q: i.duty.qReq, y: h.curve.find((p) => p.q >= i.duty.qReq)?.hs ?? h.hStatic + h.hPress }];
  const axis = { stroke: c.axis, fontSize: 12, tickLine: false };
  const top = Math.max(...h.curve.map((p) => p.hp ?? 0)) * 1.15;
  return (
    <figure className="instcurve">
      <figcaption>Courbe de la pompe et courbe du réseau <span>(HMT en m, débit en m³/h)</span></figcaption>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={h.curve} margin={{ top: 10, right: 16, bottom: 4, left: -6 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="q" type="number" domain={[0, 'dataMax']} {...axis} tickFormatter={(v) => fmt(v, 0)} />
          <YAxis domain={[0, Math.ceil(top / 5) * 5]} allowDataOverflow {...axis} width={44} tickFormatter={(v) => fmt(v, 0)} />
          <Tooltip contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 10, color: c.ink, fontSize: 13 }} labelFormatter={(v) => `Débit ${fmt(Number(v), 1)} m³/h`} formatter={(v, n) => [`${fmt(Number(v), 1)} m`, n]} />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12.5 }} />
          <Line name="Pompe" dataKey="hp" stroke={c.s1} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line name="Réseau (géo + pression + pertes)" dataKey="hs" stroke={c.s3} strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Scatter name="Besoin" data={need} dataKey="y" fill={c.surface} stroke={c.ink} strokeWidth={2} legendType="circle" isAnimationActive={false} />
          <Scatter name="Point de fonctionnement" data={op} dataKey="y" fill={c.s2} stroke={c.surface} strokeWidth={2} legendType="circle" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </figure>
  );
}

export function ElecCard({ i, ev }: { i: Installation; ev: Evaluation }) {
  const r = ev.elec;
  const e = i.elec;
  const sec = (v: number) => String(v).replace('.', ',');
  const rows: [string, string, string?][] = [
    ['Alimentation', `${SUPPLY_LABEL[e.supply]} · moteur ${e.voltage} V`],
    ['Démarrage', e.supply === 'solaire' ? 'Contrôleur solaire (démarrage progressif)' : START_LABEL[r.start], `pointe ≈ ${fmt(r.istart, 0)} A`],
    ['Courant nominal', `${fmt(r.inom, 1)} A`, `en service ≈ ${fmt(r.irun, 1)} A`],
    ['Câble moteur', `${r.cores} ${sec(e.cableSec)} mm² ${e.cableMat === 'cu' ? 'cuivre' : 'alu'} · ${fmt(e.cableLen, 0)} m`, `conseillé ${r.cores} ${sec(r.secRec)} mm²`],
    ['Chute de tension', `${fmt(r.dropRun, 1)} % en marche`, `${fmt(r.dropStart, 1)} % au démarrage`],
    ['Protection', r.breaker],
  ];
  if (r.start === 'variateur' && e.supply !== 'solaire') rows.push(['Variateur', `≥ ${fmt(r.vfdKw, 1)} kW / ${fmt(r.vfdA, 1)} A`, r.filter ? `+ ${r.filter}` : 'sans filtre (câble court)']);
  if (r.vfdSpeed) rows.push(['Consigne variateur', `${fmt(r.vfdSpeed.s * 100, 0)} % · ${fmt(r.vfdSpeed.hz, 1)} Hz`, `−${fmt(r.vfdSpeed.saving * 100, 0)} % d'énergie par m³`]);
  if (e.supply === 'groupe') rows.push(['Groupe électrogène', `${fmt(r.genKva, 0)} kVA conseillés`, e.genKva ? `installé ${e.genKva} kVA` : '']);
  const v = r.vessel;
  const s = r.solar;
  return (
    <section className="card">
      <h3><Zap size={16} aria-hidden /> Électricité</h3>
      <table className="tbl kv"><tbody>{rows.map(([k, a, b]) => <tr key={k}><th>{k}</th><td>{a}{b && <small className="muted"> · {b}</small>}</td></tr>)}</tbody></table>
      {v && (
        <>
          <h4 className="sub-h">Réservoir à vessie</h4>
          <table className="tbl kv"><tbody>
            <tr><th>Volume</th><td>{v.vol} L{v.vol !== v.volRec && <small className="muted"> · conseillé {v.volRec} L</small>}</td></tr>
            <tr><th>Pression nominale</th><td>PN{v.pn}{v.pn !== v.pnRec && <small className="muted"> · conseillé PN{v.pnRec}</small>}</td></tr>
            <tr><th>Pressostat</th><td>marche {fmt(v.pOn, 1)} bar · arrêt {fmt(v.pOff, 1)} bar</td></tr>
            <tr><th>Précharge</th><td>{fmt(v.pre, 1)} bar <small className="muted">· réservoir vide, 0,2 bar sous la marche</small></td></tr>
            <tr><th>Réserve utile</th><td>{fmt(v.dv * 1000, 0)} L<small className="muted"> · {r.start === 'variateur' ? 'régulation variateur' : `≤ ${fmt(v.starts, 0)} démarrages/h (maxi ${i.pump.maxStarts})`}</small></td></tr>
            <tr><th>Repères</th><td><small className="muted">besoin au refoulement {fmt(v.pReq, 1)} bar · pompe vanne fermée {fmt(v.pMax, 1)} bar</small></td></tr>
          </tbody></table>
        </>
      )}
      {s && (
        <>
          <h4 className="sub-h"><Sun size={14} aria-hidden /> Pompage solaire</h4>
          <div className="pvbig">
            <b>{s.n}</b><span>panneaux de {e.solar.panelWc} Wc<br /><small>{s.ns} en série × {s.np} chaîne{s.np > 1 ? 's' : ''} en parallèle</small></span>
          </div>
          <table className="tbl kv"><tbody>
            <tr><th>Puissance crête</th><td>{fmt(s.wc / 1000, 2)} kWc <small className="muted">· besoin {fmt(s.wcNeed / 1000, 2)} kWc, mini moteur {fmt(s.wcMinMotor / 1000, 2)} kWc</small></td></tr>
            {s.n > s.nNeed && <tr><th>Pourquoi {s.n} ?</th><td><small className="muted">{s.nNeed} suffiraient en énergie, mais il faut {s.nsMin} panneaux en série pour atteindre la tension MPPT mini du contrôleur ({e.solar.vmpptMin} V).</small></td></tr>}
            <tr><th>Volume journalier</th><td>≈ {fmt(s.dailyM3, 1)} m³/j <small className="muted">· besoin {fmt(e.solar.dailyM3, 1)} m³/j · ≈ {fmt(s.hours, 1)} h de pompage équivalent</small></td></tr>
            <tr><th>Tensions de chaîne</th><td>Vmp {fmt(s.vmpStr, 0)} V · Voc à froid {fmt(s.vocCold, 0)} V <small className="muted">(maxi {e.solar.vdcMax} V)</small></td></tr>
            <tr><th>Câble DC</th><td>{sec(e.solar.dcSec)} mm² · {fmt(s.dcDrop, 1)} % de pertes <small className="muted">· conseillé {sec(s.dcSecRec)} mm²</small></td></tr>
            <tr><th>Surface au sol</th><td>≈ {fmt(s.area, 0)} m²</td></tr>
            <tr><th>Stockage d'eau conseillé</th><td>{fmt(s.storage, 0)} m³ <small className="muted">(1,5 jour d'autonomie, sans batterie)</small></td></tr>
            <tr><th>Énergie</th><td>{fmt(s.eM3 * 1000, 0)} Wh/m³ pompé</td></tr>
          </tbody></table>
        </>
      )}
    </section>
  );
}

export function MountOrder({ i, ev, onFix }: { i: Installation; ev: Evaluation; onFix: (x: Issue) => void }) {
  const seq = mountSequence(i, ev.needs);
  let zone = '';
  return (
    <section className="card">
      <h3><ListChecks size={16} aria-hidden /> Ordre de montage et position des accessoires <small>de la source vers l'utilisation</small></h3>
      <ol className="mount">
        {seq.map((x, n) => {
          const head = x.zone !== zone ? (zone = x.zone) : null;
          const miss = ev.issues.find((y) => y.id === `miss_${x.id}`);
          return (
            <li key={x.id} className={x.on ? '' : 'missing'}>
              {head && <h4 className="sub-h">{head}</h4>}
              <div className="mount-row">
                <span className="mount-n">{n + 1}</span>
                <div>
                  <b>{ACC[x.id]?.label}{ACC[x.id]?.inline && i.acc[x.id]?.dn ? ` · DN${i.acc[x.id].dn}` : ''}</b>
                  {!x.on && <span className="badge lv-critical"> Manquant</span>}
                  <p>{posAdvice(x.id, i, ev.hydro)}</p>
                  {!x.on && miss && <button className="link" onClick={() => onFix(miss)}>Ajouter</button>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
