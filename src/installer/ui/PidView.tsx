import type { MouseEvent, ReactNode } from 'react';
import { ACC, ACCESSORIES, APPS, PIPE_MATS } from '../catalog';
import type { Installation } from '../types';
import type { Hydro } from '../hydraulics';
import { solar } from '../electrical';
import { PidGlyph } from './Glyphs';

const W = 1100, H = 470;

function Bubble({ x, y, code, num, field = true }: { x: number; y: number; code: string; num: number; field?: boolean }) {
  return (
    <g className="p-inst">
      <circle cx={x} cy={y} r={17} />
      {!field && <path d={`M${x - 17} ${y} H${x + 17}`} />}
      <text x={x} y={y - 2} textAnchor="middle" className="p-code">{code}</text>
      <text x={x} y={y + 10} textAnchor="middle" className="p-num">{num}</text>
    </g>
  );
}

/** Schéma P&ID (symboles ISA 5.1 simplifiés), généré depuis la configuration. */
export function PidView({ i, h, highlight = [], onPick }: { i: Installation; h: Hydro; highlight?: string[]; onPick?: (t: string) => void }) {
  const on = (id: string) => !!i.acc[id]?.on;
  const anchors: Record<string, [number, number]> = {};
  const lines: Record<string, string> = {};
  const pick = (t: string) => (onPick ? { onClick: (e: MouseEvent) => { e.stopPropagation(); onPick(t); }, className: 'pickable' } : {});
  const counters: Record<string, number> = {};
  const tag = (p: string) => (counters[p] = (counters[p] ?? 100) + 1);
  const imm = i.mode === 'immergee';
  const els: ReactNode[] = [];
  const insts: ReactNode[] = [];
  const signals: { from: [number, number]; to: 'mcc' | 'vfd' }[] = [];

  const Y = imm ? 150 : 230;
  const pumpX = imm ? 130 : 520;
  const pumpY = imm ? 330 : Y;
  const mcc: [number, number] = [imm ? 380 : 470, 420];
  const vfd: [number, number] = [mcc[0] + 130, 420];

  // ----- Source -----
  if (imm) {
    els.push(<path key="src" d="M30 110 V400 H230 V110" className="p-vessel" />, <path key="lvl" d="M34 250 H226" className="p-level" />, <text key="srcl" x={130} y={425} textAnchor="middle" className="p-cap">{i.pumpType === 'immergee_forage' ? 'Forage' : 'Fosse de relevage'}</text>);
  } else if (i.mode === 'aspiration') {
    els.push(<path key="src" d="M30 250 V360 H160 V250" className="p-vessel" />, <path key="lvl" d="M34 290 H156" className="p-level" />, <text key="srcl" x={95} y={384} textAnchor="middle" className="p-cap">Source (bassin, rivière)</text>);
  } else {
    els.push(<rect key="src" x={30} y={110} width={130} height={200} rx={10} className="p-vessel" />, <path key="lvl" d="M34 150 H156" className="p-level" />, <text key="srcl" x={95} y={334} textAnchor="middle" className="p-cap">Bâche / réservoir T-101</text>);
  }

  // ----- Pompe -----
  const pTag = tag('P');
  anchors.pump = [pumpX, pumpY];
  els.push(
    <g key="pump" className="p-pump" {...pick('pump')}>
      <circle cx={pumpX} cy={pumpY} r={24} />
      <path d={`M${pumpX} ${pumpY - 24} H${pumpX + 30}`} />
      <path d={`M${pumpX - 14} ${pumpY + 19} L${pumpX - 22} ${pumpY + 34} H${pumpX + 22} L${pumpX + 14} ${pumpY + 19}`} />
      <text x={pumpX} y={pumpY + 52} textAnchor="middle" className="p-tag">P-{pTag}</text>
      <circle cx={imm ? pumpX + 60 : pumpX} cy={imm ? pumpY : pumpY + 80} r={13} className="p-motor" />
      <text x={imm ? pumpX + 60 : pumpX} y={imm ? pumpY + 4 : pumpY + 84} textAnchor="middle" className="p-code">M</text>
      <path d={imm ? `M${pumpX + 24} ${pumpY} H${pumpX + 47}` : `M${pumpX} ${pumpY + 34} V${pumpY + 67}`} />
      {on('atex') && <text x={imm ? pumpX + 60 : pumpX + 20} y={imm ? pumpY - 18 : pumpY + 66} className="p-code">Ex</text>}
    </g>,
  );
  const motor: [number, number] = imm ? [pumpX + 60, pumpY + 13] : [pumpX, pumpY + 93];

  // ----- Ligne d'aspiration -----
  const inline = (side: 'asp' | 'ref') => ACCESSORIES.filter((a) => a.side === side && on(a.id) && (a.inline || ['vessie', 'anti_belier', 'ventouse', 'soupape', 'vidange'].includes(a.id)));
  const instr = (side: 'asp' | 'ref') => ACCESSORIES.filter((a) => a.side === side && on(a.id) && ['vacuometre', 'manometre', 'capteur_p', 'pressostat'].includes(a.id));

  if (!imm) {
    const x0 = i.mode === 'aspiration' ? 95 : 160;
    if (i.mode === 'aspiration') els.push(<path key="aspv" d={`M95 330 V${Y}`} className="p-proc" />);
    lines.asp = `M${x0} ${Y} H${pumpX - 24}`;
    els.push(<g key="asp" {...pick('asp')}><path d={lines.asp} className="p-hit" /><path d={lines.asp} className="p-proc" /></g>);
    const list = inline('asp').filter((a) => a.id !== 'clapet_pied' && a.id !== 'crepine');
    if (i.mode === 'aspiration' && (on('clapet_pied') || on('crepine'))) els.push(<g key="foot" transform="translate(95,340)"><PidGlyph kind={on('clapet_pied') ? 'foot' : 'strainer'} /></g>);
    const span = pumpX - 60 - (x0 + 40);
    list.forEach((a, n) => {
      const x = x0 + 40 + (span * (n + 0.5)) / Math.max(1, list.length);
      anchors[`acc:${a.id}`] = [x, Y];
      els.push(<g key={a.id} {...pick(`acc:${a.id}`)}><g transform={`translate(${x},${Y})`}><rect x={-14} y={-12} width={28} height={24} className="p-gap" /><PidGlyph kind={a.glyph} /></g></g>);
      if (a.tag) els.push(<text key={`${a.id}t`} x={x} y={Y + 30} textAnchor="middle" className="p-tag">{a.tag}-{tag(a.tag)}</text>);
    });
    instr('asp').forEach((a) => {
      const x = pumpX - 60;
      els.push(<path key={`${a.id}l`} d={`M${x} ${Y} V${Y - 53}`} className="p-sig solid" />);
      anchors[`acc:${a.id}`] = [x, Y - 70];
      insts.push(<g key={a.id} {...pick(`acc:${a.id}`)}><Bubble x={x} y={Y - 70} code={a.tag!} num={tag(a.tag!)} /></g>);
    });
    els.push(<text key="asps" x={(x0 + pumpX) / 2} y={Y + 52} textAnchor="middle" className="p-spec">DN{i.asp.dn} · {PIPE_MATS[i.asp.material].label} · PN{i.asp.pn} · L = {i.asp.length} m</text>);
    els.push(<path key="aspa" d={`M${pumpX - 44} ${Y - 5} l10 5 l-10 5`} className="p-arrow" />);
  }

  // ----- Ligne de refoulement -----
  const rx0 = pumpX + 30;
  const ry0 = pumpY - 24;
  const xEnd = 960;
  lines.ref = imm ? `M${rx0} ${ry0} H${rx0 + 40} V${Y} H${xEnd}` : `M${rx0} ${ry0} H${xEnd}`;
  els.push(<g key="ref" {...pick('ref')}><path d={lines.ref} className="p-hit" /><path d={lines.ref} className="p-proc" /></g>);
  const startX = imm ? rx0 + 90 : rx0 + 30;
  const refList = inline('ref');
  const ins = instr('ref');
  const slots = refList.length + ins.length;
  const span = xEnd - 40 - startX;
  let slot = 0;
  const ordered = ['cone_ref', 'manchon_ref', 'manometre', 'capteur_p', 'pressostat', 'clapet_ar', 'clapet_boule', 'vanne_ref', 'vessie', 'anti_belier', 'soupape', 'vidange', 'debitmetre', 'ventouse'].filter(on);
  for (const id of ordered) {
    const a = ACC[id];
    const x = startX + (span * (slot + 0.5)) / Math.max(1, slots);
    slot++;
    if (['manometre', 'capteur_p', 'pressostat'].includes(id)) {
      const n = tag(a.tag!);
      els.push(<path key={`${id}l`} d={`M${x} ${Y} V${Y - 53}`} className="p-sig solid" />);
      anchors[`acc:${id}`] = [x, Y - 70];
      insts.push(<g key={id} {...pick(`acc:${id}`)}><Bubble x={x} y={Y - 70} code={a.tag!} num={n} field={id === 'manometre'} /></g>);
      if (id === 'capteur_p') signals.push({ from: [x, Y - 87], to: on('variateur') ? 'vfd' : 'mcc' });
      if (id === 'pressostat') signals.push({ from: [x, Y - 87], to: 'mcc' });
      continue;
    }
    anchors[`acc:${id}`] = [x, Y + (id === 'vessie' ? 25 : id === 'anti_belier' ? -25 : 0)];
    els.push(<g key={id} {...pick(`acc:${id}`)}><g transform={`translate(${x},${Y})`}>{a.inline && <rect x={-14} y={-12} width={28} height={24} className="p-gap" />}<PidGlyph kind={a.glyph} /></g></g>);
    if (id === 'debitmetre') {
      const n = tag('FT');
      els.push(<path key={`${id}l`} d={`M${x} ${Y - 8} V${Y - 53}`} className="p-sig solid" />);
      insts.push(<Bubble key={`${id}b`} x={x} y={Y - 70} code="FT" num={n} />);
    } else if (a.tag) els.push(<text key={`${id}t`} x={x} y={Y + 30} textAnchor="middle" className="p-tag">{a.tag}-{tag(a.tag)}</text>);
    else if (id === 'vessie' || id === 'anti_belier') els.push(<text key={`${id}t`} x={x} y={id === 'vessie' ? Y + 56 : Y - 46} textAnchor="middle" className="p-tag">{id === 'vessie' ? `TK-${tag('TK')}${i.acc.vessie?.vol ? ` ${i.acc.vessie.vol} L` : ''}` : `AB-${tag('AB')}`}</text>);
  }
  els.push(<text key="refs" x={(startX + xEnd) / 2} y={Y + 82} textAnchor="middle" className="p-spec">DN{i.ref.dn} · {PIPE_MATS[i.ref.material].label} · PN{i.ref.pn} · L = {Math.round(i.ref.length + (i.pumpType === 'immergee_forage' ? i.geo.pumpDepth : 0))} m</text>);
  els.push(<path key="refa" d={`M${xEnd - 20} ${Y - 5} l10 5 l-10 5`} className="p-arrow" />);

  // ----- Destination -----
  const dest = APPS[i.app].dest;
  const dl: Record<string, string> = { reservoir: 'Réservoir', batiment: 'Réseau bâtiment', irrigation: 'Réseau d\'irrigation', regard: 'Regard / réseau', cuve: 'Cuve', bassin: 'Bassin', incendie: 'Réseau incendie' };
  els.push(<g key="dest"><rect x={xEnd} y={Y - 40} width={110} height={80} rx={8} className="p-vessel" /><text x={xEnd + 55} y={Y + 4} textAnchor="middle" className="p-cap">{dl[dest]}</text></g>);
  if (on('flotteur_res')) { const n = tag('LSH'); insts.push(<Bubble key="lshr" x={xEnd + 55} y={Y - 80} code="LSH" num={n} />); signals.push({ from: [xEnd + 55, Y - 97], to: 'mcc' }); }

  // ----- Niveaux dans la source -----
  const lv: [string, string][] = [['flotteur_alarme', 'LAHH'], ['flotteur_marche', 'LSH'], ['flotteur_arret', 'LSL'], ['marche_sec', 'LSLL'], ['sonde_niveau', 'LT']];
  let ly = imm ? 140 : i.mode === 'aspiration' ? 260 : 130;
  const lx = imm ? 270 : i.mode === 'aspiration' ? 200 : 205;
  for (const [id, code] of lv) {
    if (!on(id)) continue;
    const n = tag(code);
    anchors[`acc:${id}`] = [lx, ly];
    insts.push(<g key={id} {...pick(`acc:${id}`)}><path d={`M${imm ? 230 : 160} ${ly} H${lx - 17}`} className="p-sig solid" /><Bubble x={lx} y={ly} code={code} num={n} /></g>);
    signals.push({ from: [lx, ly + 17], to: 'mcc' });
    ly += 42;
  }

  // ----- Commande -----
  if (on('coffret')) {
    anchors.cable = [mcc[0], mcc[1]];
    if (on('variateur')) anchors['acc:variateur'] = [vfd[0], vfd[1]];
    anchors['acc:coffret'] = [mcc[0], mcc[1]];
    els.push(<g key="mcc" {...pick('cable')}><rect x={mcc[0] - 50} y={mcc[1] - 18} width={100} height={36} rx={4} className="p-box" /><text x={mcc[0]} y={mcc[1] + 5} textAnchor="middle" className="p-cap">Coffret MCC</text></g>);
    els.push(<path key="pw" d={`M${motor[0]} ${motor[1]} V${mcc[1] - 40} H${mcc[0]} V${mcc[1] - 18}`} className="p-elec" />);
  }
  const isSolar = i.elec?.supply === 'solaire';
  if (on('variateur') || isSolar) {
    els.push(<g key="vfd"><rect x={vfd[0] - 46} y={vfd[1] - 18} width={92} height={36} rx={4} className="p-box" /><text x={vfd[0]} y={vfd[1] + 5} textAnchor="middle" className="p-cap">{isSolar ? 'Contrôleur MPPT' : 'Variateur'}</text></g>);
    els.push(<path key="vm" d={`M${mcc[0] + 50} ${mcc[1]} H${vfd[0] - 46}`} className="p-elec" />);
  }
  if (isSolar) {
    const sr = solar(i, h);
    const px = vfd[0] + 150;
    anchors.pv = [px, vfd[1]];
    els.push(
      <g key="pvb" {...pick('pv')}>
        <rect x={px - 60} y={vfd[1] - 24} width={120} height={48} rx={4} className="p-box" />
        {[0, 1, 2, 3].map((k) => <path key={k} d={`M${px - 50 + k * 26} ${vfd[1] - 16} h20 l-4 14 h-20 Z`} className="p-sym" />)}
        <text x={px} y={vfd[1] + 18} textAnchor="middle" className="p-code">{sr ? `PV ${sr.n}×${i.elec.solar.panelWc} Wc (${sr.ns}S×${sr.np}P)` : 'Champ PV'}</text>
        <path d={`M${px - 60} ${vfd[1]} H${vfd[0] + 46}`} className="p-elec" strokeDasharray="8 3" />
      </g>,
    );
  }
  signals.forEach((s, n) => {
    const t = s.to === 'vfd' && on('variateur') ? vfd : mcc;
    if (!on('coffret') && s.to === 'mcc') return;
    const lane = 380 - n * 7;
    const bx = s.from[0] + 17, by = s.from[1] + 17;
    els.push(<path key={`sig${n}`} d={`M${bx} ${by} H${bx + 10 + (n % 3) * 4} V${lane} H${t[0] - 30 + n * 8} V${t[1] - 18}`} className="p-sig" />);
  });

  const hl: ReactNode[] = [];
  for (const t of highlight) {
    if ((t === 'asp' || t === 'ref') && lines[t]) hl.push(<path key={`h-${t}`} d={lines[t]} className="hl-path" />);
    else if (anchors[t]) hl.push(<circle key={`h-${t}`} cx={anchors[t][0]} cy={anchors[t][1]} r={t === 'pump' ? 44 : t === 'cable' || t === 'pv' ? 64 : 26} className="hl-ring" />);
    else if (t === 'source') hl.push(<circle key="h-src" cx={imm ? 130 : 95} cy={imm ? 255 : 260} r={90} className="hl-ring" />);
    else if (t.startsWith('acc:')) {
      const side = ACC[t.slice(4)]?.side;
      const x = side === 'asp' ? (pumpX + 160) / 2 : side === 'ref' ? 760 : mcc[0];
      const y = side === 'ctrl' ? mcc[1] : Y;
      hl.push(<g key={`h-${t}`}><circle cx={x} cy={y} r={28} className="hl-ring ghost" /><text x={x} y={y - 36} textAnchor="middle" className="hl-txt">Manque : {ACC[t.slice(4)]?.label}</text></g>);
    }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pidview" role="img" aria-label="Schéma P&ID de l'installation">
      <rect x={1} y={1} width={W - 2} height={H - 2} className="p-frame" />
      {els}
      {insts}
      {hl}
      <g className="p-cartouche">
        <rect x={W - 270} y={H - 42} width={268} height={40} />
        <text x={W - 262} y={H - 25}>P&ID · {i.name}</text>
        <text x={W - 262} y={H - 10}>ECO PUMP AFRIK · généré automatiquement</text>
      </g>
    </svg>
  );
}
