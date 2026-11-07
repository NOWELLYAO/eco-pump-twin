import type { MouseEvent, ReactNode } from 'react';
import type { Readings, SimKind } from '../sim';
import { ACC, APPS, FLUIDS, PIPE_MATS } from '../catalog';
import type { Hydro } from '../hydraulics';
import { effectiveStart, solar } from '../electrical';
import { REF_ORDER, aspGroups } from '../positions';
import type { TermLine } from '../terminal';
import type { Installation } from '../types';
import { RealGlyph } from './Glyphs';

type Pt = [number, number];
const H = 560;

const SHORT: Record<string, string> = {
  clapet_pied: 'Clapet de pied', crepine: 'Crépine', vanne_asp: 'Vanne', filtre_asp: 'Filtre Y', prefiltre: 'Préfiltre',
  manchon_asp: 'Manchon', vacuometre: 'Vacuomètre', cone_exc: 'Cône exc.', cone_ref: 'Cône', manometre: 'Manomètre',
  manchon_ref: 'Manchon', clapet_ar: 'Clapet AR', clapet_boule: 'Clapet boule', vanne_ref: 'Vanne', debitmetre: 'Débitmètre',
  capteur_p: 'Capteur P', pressostat: 'Pressostat', vessie: 'Réservoir', anti_belier: 'Anti-bélier', ventouse: 'Ventouse',
  soupape: 'Soupape', vidange: 'Vidange',
};

function seglen(a: Pt, b: Pt) { return Math.hypot(b[0] - a[0], b[1] - a[1]); }
function polyLen(p: Pt[]) { let s = 0; for (let k = 1; k < p.length; k++) s += seglen(p[k - 1], p[k]); return s; }
function along(p: Pt[], d: number) {
  let rest = Math.max(0, Math.min(d, polyLen(p)));
  for (let k = 1; k < p.length; k++) {
    const l = seglen(p[k - 1], p[k]);
    if (rest <= l || k === p.length - 1) {
      const t = l ? rest / l : 0;
      const [x0, y0] = p[k - 1], [x1, y1] = p[k];
      return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI };
    }
    rest -= l;
  }
  return { x: p[0][0], y: p[0][1], a: 0 };
}
const path = (p: Pt[]) => p.map((q, k) => `${k ? 'L' : 'M'}${q[0]} ${q[1]}`).join(' ');

function Pipe({ pts, mat, dn, flow }: { pts: Pt[]; mat: keyof typeof PIPE_MATS; dn: number; flow: boolean }) {
  const w = Math.max(8, Math.min(18, 6 + dn / 12));
  return (
    <g>
      <path d={path(pts)} stroke={PIPE_MATS[mat].color} strokeWidth={w} className="r-pipe" />
      <path d={path(pts)} strokeWidth={Math.max(2, w / 4)} className="r-pipe-hl" transform={`translate(0,${-w / 5})`} />
      {flow && <path d={path(pts)} strokeWidth={Math.max(2, w / 3)} className="r-flow" />}
    </g>
  );
}

function Dim({ x, y1, y2, label, side = 1 }: { x: number; y1: number; y2: number; label: string; side?: 1 | -1 }) {
  if (Math.abs(y2 - y1) < 6) return null;
  const m = (y1 + y2) / 2;
  return (
    <g className="r-dim">
      <path d={`M${x} ${y1} V${y2} M${x - 5} ${y1} H${x + 5} M${x - 5} ${y2} H${x + 5}`} />
      <path d={`M${x} ${y1} l-4 ${y2 > y1 ? 8 : -8} M${x} ${y1} l4 ${y2 > y1 ? 8 : -8} M${x} ${y2} l-4 ${y2 > y1 ? -8 : 8} M${x} ${y2} l4 ${y2 > y1 ? -8 : 8}`} />
      <text x={x + 8 * side} y={m + 4} textAnchor={side > 0 ? 'start' : 'end'}>{label}</text>
    </g>
  );
}

const fm = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m`;

function SurfacePump({ x, y, atex }: { x: number; y: number; atex: boolean }) {
  return (
    <g>
      <rect x={x - 44} y={y + 26} width={180} height={14} rx={2} className="r-plinth" />
      <rect x={x + 26} y={y - 20} width={98} height={40} rx={8} className="r-motor" />
      {[0, 1, 2, 3, 4].map((k) => <rect key={k} x={x + 40 + k * 15} y={y - 20} width={6} height={40} className="r-fin" />)}
      <rect x={x + 18} y={y - 13} width={14} height={26} className="r-lantern" />
      <circle cx={x} cy={y} r={28} className="r-pumpbody" />
      <circle cx={x} cy={y} r={9} className="r-hub" />
      <rect x={x - 12} y={y - 38} width={24} height={14} className="r-pumpbody" />
      {atex && <g transform={`translate(${x + 75},${y - 34})`}><RealGlyph kind="atex" /></g>}
    </g>
  );
}

function VerticalPump({ x, y, atex }: { x: number; y: number; atex: boolean }) {
  return (
    <g>
      <rect x={x - 46} y={y + 14} width={92} height={12} rx={2} className="r-plinth" />
      <rect x={x - 30} y={y - 14} width={60} height={28} rx={4} className="r-pumpbody" />
      <rect x={x - 17} y={y - 110} width={34} height={96} rx={6} className="r-stack" />
      {[0, 1, 2, 3, 4].map((k) => <path key={k} d={`M${x - 17} ${y - 100 + k * 18} H${x + 17}`} className="r-seam" />)}
      <rect x={x - 22} y={y - 180} width={44} height={70} rx={8} className="r-motor" />
      {atex && <g transform={`translate(${x},${y - 145})`}><RealGlyph kind="atex" /></g>}
    </g>
  );
}

export interface Live { on: boolean; r: Readings; kind: SimKind; x: number; pv?: number }

export function RealView({ i, h, highlight = [], onPick, live, term }: { i: Installation; h: Hydro; highlight?: string[]; onPick?: (t: string) => void; live?: Live; term?: TermLine[] }) {
  const on = (id: string) => !!i.acc[id]?.on;
  const flow = live ? live.on && live.r.q > 0 : h.ok && h.q > 0;
  const anchors: Record<string, { x: number; y: number; r?: number }> = {};
  const pick = (t: string) => (onPick ? { onClick: (e: MouseEvent) => { e.stopPropagation(); onPick(t); }, className: 'pickable' } : {});
  const forage = i.pumpType === 'immergee_forage';
  const pit = i.mode === 'immergee' && !forage;
  const dest = APPS[i.app].dest;
  const fluid = FLUIDS[i.fluid.type];
  const liquidCls = i.fluid.type === 'gasoil' || i.fluid.type === 'huile' ? 'r-oil' : i.fluid.type === 'eaux_usees' || i.fluid.type === 'boues' ? 'r-dirty' : 'r-water';

  // Largeur du dessin : on allonge les conduites quand il y a beaucoup d'accessoires
  const groups = aspGroups(i);
  const refIds = REF_ORDER.filter(on);
  const STEP_A = 58, STEP_R = 66;
  const vertical0 = i.pumpType === 'multi_v';
  const surface = !(i.mode === 'immergee');
  const px0 = vertical0 ? 470 : 440;
  const availAsp = surface ? (px0 - 28) - (i.mode === 'aspiration' ? 170 : 230) : 0;
  const needAsp = surface ? (groups.near.length + groups.far.length) * STEP_A + (groups.far.length ? 70 : 0) + 40 : 0;
  const DX = Math.max(0, needAsp - availAsp);
  const refX0 = i.pumpType === 'immergee_forage' ? 195 : !surface ? 300 : px0 + DX + (vertical0 ? 80 : 0);
  const availRef = 790 + DX - refX0 - 74;
  const DR = Math.max(0, refIds.length * STEP_R - availRef);
  const REF_END = 790 + DX + DR;
  const W = 1000 + DX + DR;

  let G = 320;
  let asp: Pt[] | null = null;
  let ref: Pt[] = [];
  let refStart = 30;
  const scene: ReactNode[] = [];
  const front: ReactNode[] = [];
  const dims: ReactNode[] = [];
  let pumpXY: Pt = [440, 290];

  if (forage) {
    G = 200;
    const bottomY = 540;
    const k = (bottomY - G - 10) / Math.max(10, i.geo.boreDepth);
    const yS = G + i.geo.staticLevel * k, yD = G + i.geo.dynamicLevel * k, yP = G + i.geo.pumpDepth * k;
    scene.push(
      <rect key="soil" x={0} y={G} width={W} height={H - G} className="r-soil" />,
      <rect key="bore" x={150} y={G} width={90} height={bottomY - G} className="r-bore" />,
      <rect key="w" x={152} y={yD} width={86} height={bottomY - yD} className={liquidCls} />,
      <path key="st" d={`M140 ${yS} H250`} className="r-level dashed" />,
      <path key="dy" d={`M140 ${yD} H250`} className="r-level" />,
      <path key="c1" d={`M150 ${G - 12} V${bottomY}`} className="r-casing" />, <path key="c2" d={`M240 ${G - 12} V${bottomY}`} className="r-casing" />,
      <rect key="head" x={140} y={G - 26} width={110} height={14} rx={2} className="r-plinth" />,
    );
    const top = Math.min(yP - 60, bottomY - 110);
    const pTop = Math.max(yD + 6, top);
    front.push(
      <g key="fp">
        {on('chemise') && <rect x={174} y={pTop - 8} width={42} height={112} rx={6} className="r-jacket" />}
        <rect x={181} y={pTop} width={28} height={56} rx={5} className="r-stainless" />
        {[1, 2, 3, 4].map((n) => <path key={n} d={`M181 ${pTop + n * 11} H209`} className="r-seam" />)}
        <rect x={183} y={pTop + 56} width={24} height={40} rx={5} className="r-motor" />
        <path d={`M209 ${pTop + 70} C 228 ${pTop + 40}, 226 ${G}, 226 ${G - 14}`} className="r-cablepath" />
      </g>,
    );
    pumpXY = [195, pTop + 30];
    ref = [[195, pTop], [195, G - 40], [REF_END, G - 40]];
    refStart = polyLen(ref.slice(0, 2)) + 40;
    if (on('marche_sec')) front.push(<g key="el" transform={`translate(170,${pTop - 20})`}><path d={`M0 ${-(pTop - 20 - G)} V0`} className="r-cablepath" /><RealGlyph kind="electrode" /></g>);
    if (on('sonde_niveau')) front.push(<g key="sn" transform={`translate(228,${yD + 30})`}><path d={`M0 ${-(yD + 30 - G)} V0`} className="r-cablepath" /><RealGlyph kind="probe" /></g>);
    dims.push(
      <g key="lv" className="r-note">
        <text x={258} y={yS + 4}>Niveau statique {fm(i.geo.staticLevel)}</text>
        <text x={258} y={yD + 4}>Niveau dynamique {fm(i.geo.dynamicLevel)}</text>
        <text x={258} y={pTop + 34}>Pompe à {fm(i.geo.pumpDepth)} · immersion {fm(i.geo.pumpDepth - i.geo.dynamicLevel)}</text>
        <text x={258} y={bottomY - 6}>Fond {fm(i.geo.boreDepth)} · Ø {i.geo.boreDia} mm</text>
      </g>,
    );
  } else if (pit) {
    G = 250;
    const floor = 520;
    const yStop = Math.max(floor - 30 - i.geo.wetLevel * 60, 380);
    const yStart = Math.max(yStop - 40 - Math.min(80, i.geo.tankVolume / 25), 300);
    const yAlarm = Math.max(yStart - 30, 275);
    const yWater = live && live.kind === 'pit' ? Math.max(G + 6, Math.min(floor - 4, yStop - (live.x / 0.5) * (yStop - yStart))) : yStart + 12;
    scene.push(
      <rect key="soil" x={0} y={G} width={W} height={H - G} className="r-soil" />,
      <rect key="pit" x={100} y={G} width={250} height={floor - G + 14} className="r-concrete" />,
      <rect key="in" x={114} y={G} width={222} height={floor - G} className="r-pitin" />,
      <rect key="liq" x={114} y={yWater} width={222} height={floor - yWater} className={liquidCls} />,
      <rect key="lid" x={96} y={G - 10} width={258} height={10} rx={2} className="r-plinth" />,
      <path key="inlet" d={`M0 ${G + 40} H114`} stroke="#8a96a3" strokeWidth={14} className="r-pipe" />,
    );
    front.push(
      <g key="rp">
        {on('barres') && <path d={`M196 ${floor - 40} V${G} M212 ${floor - 40} V${G}`} className="r-rails" />}
        <rect x={160} y={floor - 42} width={74} height={42} rx={10} className="r-pumpbody" />
        <rect x={172} y={floor - 98} width={50} height={58} rx={8} className="r-motor" />
        <rect x={234} y={floor - 30} width={36} height={22} rx={3} className="r-plinth" />
        <path d={`M198 ${floor - 98} C 190 ${G + 60}, 160 ${G + 30}, 150 ${G}`} className="r-cablepath" />
      </g>,
    );
    pumpXY = [205, floor - 40];
    ref = [[270, floor - 20], [300, floor - 20], [300, G + 50], [REF_END, G + 50]];
    refStart = 50;
    const floats: [string, number][] = [['flotteur_arret', yStop], ['flotteur_marche', yStart], ['flotteur_alarme', yAlarm]];
    floats.forEach(([id, y], n) => {
      if (on(id)) front.push(<g key={id} transform={`translate(${128 + n * 14},${y})`}><path d={`M0 -10 C 0 ${-(y - G) / 2}, 10 ${-(y - G) + 20}, 10 ${-(y - G)}`} className="r-cablepath" /><RealGlyph kind="float" /></g>);
    });
    dims.push(
      <g key="pl" className="r-note">
        <text x={94} y={floor + 34} textAnchor="start">Volume utile {i.geo.tankVolume.toLocaleString('fr-FR')} L entre flotteurs</text>
        {on('flotteur_alarme') && <text x={94} y={yAlarm + 4} textAnchor="end">Alarme</text>}
        {on('flotteur_marche') && <text x={94} y={yStart + 4} textAnchor="end">Marche</text>}
        {on('flotteur_arret') && <text x={94} y={yStop + 4} textAnchor="end">Arrêt</text>}
      </g>,
    );
  } else {
    // Pompe de surface : en aspiration ou en charge
    const vertical = i.pumpType === 'multi_v';
    const axisY = 288;
    const px = (vertical ? 470 : 440) + DX;
    pumpXY = [px, axisY];
    scene.push(<rect key="soil" x={0} y={G} width={W} height={H - G} className="r-soil" />);
    if (i.mode === 'aspiration') {
      const wl = Math.min(470, axisY + 60 + i.geo.suctionLift * 22);
      const bottomY = Math.min(540, wl + 50 + i.geo.immersion * 40);
      scene.push(
        <path key="bank" d={`M20 ${G} L60 ${bottomY} H280 L310 ${G} Z`} className="r-pitin" />,
        <path key="water" d={`M${20 + (40 * (wl - G)) / (bottomY - G)} ${wl} L60 ${bottomY} H280 L${310 - (30 * (wl - G)) / (bottomY - G)} ${wl} Z`} className={liquidCls} />,
      );
      const inletY = Math.min(bottomY - 14 - i.geo.bottom * 30, wl + 20 + i.geo.immersion * 40);
      const inX = vertical ? px - 30 : px - 28;
      asp = [[170, inletY], [170, axisY], [inX, axisY]];
      dims.push(<Dim key="d1" x={120} y1={wl} y2={axisY} label={`Aspiration ${fm(i.geo.suctionLift)}`} side={-1} />);
    } else {
      const tankTop = 110;
      const wl = Math.max(tankTop + 12, axisY - 20 - i.geo.chargeHead * 40);
      scene.push(
        <rect key="tank" x={40} y={tankTop} width={190} height={G - tankTop} rx={6} className="r-tank" />,
        <rect key="liq" x={46} y={wl} width={178} height={G - wl - 6} rx={3} className={liquidCls} />,
      );
      const inX = vertical ? px - 30 : px - 28;
      asp = [[230, axisY], [inX, axisY]];
      dims.push(<Dim key="d1" x={58} y1={wl} y2={axisY} label={`En charge ${fm(i.geo.chargeHead)}`} />);
    }
    front.push(vertical ? <VerticalPump key="vp" x={px} y={axisY} atex={on('atex')} /> : <SurfacePump key="sp" x={px} y={axisY} atex={on('atex')} />);
    ref = vertical ? [[px + 30, axisY], [px + 80, axisY], [px + 80, 150], [REF_END, 150]] : [[px, axisY - 38], [px, 150], [REF_END, 150]];
    refStart = 26;
  }

  // ----- Destination -----
  const [ax, ay] = ref[ref.length - 1];
  const destG = G;
  const destEls: ReactNode[] = [];
  if (dest === 'reservoir') {
    destEls.push(
      <path key="legs" d={`M${ax + 30} ${ay + 34} L${ax + 18} ${destG} M${ax + 110} ${ay + 34} L${ax + 122} ${destG} ${ay + 90 < destG ? `M${ax + 26} ${ay + 90} H${ax + 114}` : ''}`} className="r-legs" />,
      <rect key="t" x={ax + 10} y={ay - 46} width={120} height={80} rx={10} className="r-tank" />,
      <rect key="tw" x={ax + 16} y={ay + 28 - 64 * (live && live.kind === 'tank' ? Math.min(1, live.x) : 0.7)} width={108} height={64 * (live && live.kind === 'tank' ? Math.min(1, live.x) : 0.7)} rx={6} className="r-water" />,
    );
    if (on('flotteur_res')) destEls.push(<g key="fr" transform={`translate(${ax + 90},${ay - 18})`}><RealGlyph kind="float" /></g>);
  } else if (dest === 'batiment' || dest === 'incendie') {
    destEls.push(<rect key="b" x={ax + 10} y={40} width={170} height={destG - 40} className="r-building" />);
    for (let r = 0; r < Math.floor((destG - 60) / 34); r++) for (let c = 0; c < 4; c++) destEls.push(<rect key={`w${r}${c}`} x={ax + 24 + c * 40} y={54 + r * 34} width={24} height={18} rx={2} className="r-window" />);
    if (dest === 'incendie') destEls.push(<rect key="ria" x={ax + 70} y={destG - 50} width={40} height={40} rx={4} className="r-ria" />);
  } else if (dest === 'irrigation') {
    destEls.push(<path key="lat" d={`M${ax} ${ay} V${destG - 8} H${ax + 190}`} stroke="#2b2f33" strokeWidth={8} className="r-pipe" />);
    for (let s = 0; s < 3; s++) {
      const sx = ax + 40 + s * 70;
      destEls.push(<g key={`s${s}`}><path d={`M${sx} ${destG - 8} V${destG - 46}`} className="r-riser" /><path d={`M${sx} ${destG - 48} q-30 -26 -56 4 M${sx} ${destG - 48} q30 -26 56 4`} className="r-spray" /></g>);
    }
    for (let c = 0; c < 9; c++) destEls.push(<path key={`c${c}`} d={`M${ax + 10 + c * 22} ${destG} q4 -14 8 0 q4 -10 8 0`} className="r-crop" />);
  } else if (dest === 'regard') {
    destEls.push(<rect key="rg" x={ax} y={destG - 6} width={70} height={ay - destG + 60} className="r-concrete" />, <rect key="rgi" x={ax + 10} y={destG} width={50} height={ay - destG + 44} className="r-pitin" />, <rect key="rgl" x={ax - 4} y={destG - 10} width={78} height={8} rx={2} className="r-plinth" />);
  } else if (dest === 'cuve') {
    destEls.push(<rect key="cv" x={ax + 10} y={ay - 30} width={160} height={70} rx={35} className="r-tank" />, <path key="cl" d={`M${ax + 40} ${ay + 40} V${destG} M${ax + 140} ${ay + 40} V${destG}`} className="r-legs" />, <text key="ct" x={ax + 90} y={ay + 10} textAnchor="middle" className="r-note">Cuve</text>);
  } else if (dest === 'bassin') {
    destEls.push(<path key="pl" d={`M${ax} ${ay} V${destG - 4}`} stroke="#8a96a3" strokeWidth={10} className="r-pipe" />, <rect key="pb" x={ax + 10} y={destG} width={180} height={70} className="r-pitin" />, <rect key="pw" x={ax + 10} y={destG + 8} width={180} height={62} className="r-water" />);
  }

  // ----- Accessoires -----
  const items: ReactNode[] = [];
  let inlineN = 0;
  let upN = 0;
  const placeGlyph = (id: string, p: { x: number; y: number; a: number }, _n: number, vertical: boolean) => {
    const a = ACC[id];
    const st = i.acc[id];
    const pipeDn = a.side === 'asp' ? i.asp.dn : i.ref.dn;
    const dnTxt = a.inline && st?.dn && (st.dn !== pipeDn || a.glyph === 'eccentric' || a.glyph === 'concentric') ? ` DN${st.dn}` : a.id === 'vessie' && st?.vol ? ` ${st.vol} L` : '';
    if (a.inline) inlineN++;
    const down = a.glyph === 'vessel' || a.glyph === 'drain';
    const up = !a.inline && !down;
    if (up) upN++;
    anchors[`acc:${id}`] = { x: p.x, y: p.y + (a.glyph === 'vessel' ? 40 : a.glyph === 'surge' ? -40 : !a.inline ? -22 : 0), r: 30 };
    items.push(
      <g key={id} {...pick(`acc:${id}`)}>
        <rect x={p.x - 24} y={p.y - 30} width={48} height={60} className="hit" />
        <g transform={`translate(${p.x},${p.y}) rotate(${vertical ? 0 : p.a})`}><RealGlyph kind={a.glyph} /></g>
        <text x={vertical ? p.x + 22 : p.x} y={vertical ? p.y + 4 : down ? p.y + (a.glyph === 'vessel' ? 88 : 40) : up ? p.y - (a.glyph === 'surge' ? 78 : 50) - (upN % 2) * 15 : p.y + 32 + (inlineN % 2) * 17} textAnchor={vertical ? 'start' : 'middle'} className="r-label">
          <title>{a.label}</title>{SHORT[id] ?? a.label}{dnTxt}
        </text>
      </g>,
    );
  };

  if (asp) {
    const L = polyLen(asp);
    const startIds = ['clapet_pied', 'crepine'].filter(on);
    startIds.forEach((id, n) => {
      const a = ACC[id];
      const p = { x: asp![0][0], y: asp![0][1] + 14 + n * 4, a: 0 };
      anchors[`acc:${id}`] = { x: p.x, y: p.y, r: 26 };
      items.push(<g key={id} {...pick(`acc:${id}`)}><g transform={`translate(${p.x},${p.y})`}><RealGlyph kind={a.glyph} /></g><text x={p.x + 18} y={p.y + 8} className="r-label">{SHORT[id]}</text></g>);
    });
    // Contre la pompe (le cône touche la bride), puis longueur droite, puis groupe côté bâche
    const nearRev = [...groups.near].reverse();
    let d = L - 22;
    nearRev.forEach((id, n) => {
      const p = along(asp!, d);
      placeGlyph(id, p, n, Math.abs(p.a) > 45 && Math.abs(p.a) < 135);
      d -= STEP_A;
    });
    if (groups.far.length) {
      const gapEnd = d + STEP_A - 26, gapStart = d - 30;
      const p1 = along(asp!, gapStart), p2 = along(asp!, gapEnd);
      const sd = Math.max(0.2, (5 * i.asp.dn) / 1000);
      items.push(
        <g key="gap" className="r-gap">
          <path d={`M${p1.x} ${p1.y - 20} V${p1.y - 30} H${p2.x} V${p2.y - 20}`} />
          <text x={(p1.x + p2.x) / 2} y={p1.y - 36} textAnchor="middle">≥ {sd.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m droits</text>
        </g>,
      );
      d -= 70;
      [...groups.far].reverse().forEach((id, n) => {
        const p = along(asp!, Math.max(30, d));
        placeGlyph(id, p, n + nearRev.length, Math.abs(p.a) > 45 && Math.abs(p.a) < 135);
        d -= STEP_A;
      });
    }
  }
  refStart = Math.max(refStart, polyLen(ref.slice(0, ref.length - 1)) + 34);
  const LR = polyLen(ref);
  const avail = LR - refStart - 40;
  const step = Math.min(STEP_R, avail / Math.max(1, refIds.length));
  refIds.forEach((id, n) => {
    const p = along(ref, refStart + n * step);
    placeGlyph(id, p, n, Math.abs(p.a) > 45 && Math.abs(p.a) < 135);
  });

  // Coffret, variateur
  const [pxp, pyp] = pumpXY;
  const boxX = forage ? 60 : pit ? 420 : pxp + 190;
  const boxY = forage ? G - 34 : pit ? G - 52 : G - 34;
  if (on('coffret')) {
    anchors.cable = { x: boxX, y: boxY, r: 40 };
    items.push(<g key="cof" {...pick('cable')}><path d={`M${boxX} ${boxY + 28} C ${boxX - 40} ${boxY + 60}, ${pxp + 60} ${pyp + 10}, ${pxp + (forage || pit ? 20 : 70)} ${pyp}`} className="r-cablepath" /><g transform={`translate(${boxX},${boxY})`}><RealGlyph kind="panel" /></g><text x={boxX} y={boxY - 36} textAnchor="middle" className="r-label">Coffret</text></g>);
  }
  const isSolar = i.elec?.supply === 'solaire';
  const st = i.elec ? effectiveStart(i) : 'direct';
  if (i.elec && on('coffret')) {
    const cores = i.elec.supply === 'mono' ? '3G' : st === 'etoile' ? '7G' : '4G';
    items.push(<text key="cablelbl" x={boxX - 22} y={boxY + 54} className="r-label"><tspan x={boxX - 22}>{`Câble ${cores} ${String(i.elec.cableSec).replace('.', ',')} mm²`}</tspan><tspan x={boxX - 22} dy={15}>{`${i.elec.cableLen} m`}</tspan></text>);
  }
  if (isSolar) {
    const sr = solar(i, h);
    const ns = sr?.ns ?? 1, np = sr?.np ?? 1;
    const cols = Math.min(ns, 10), rows = Math.min(np, 3);
    const x0 = 560, y0 = 14, pw = 17, ph = 12;
    anchors.pv = { x: x0 + 90, y: y0 + 30, r: 70 };
    items.push(
      <g key="pv" {...pick('pv')}>
        <rect x={x0 - 8} y={y0 - 4} width={Math.max(200, cols * (pw + 3) + 16)} height={rows * (ph + 4) + 42} rx={8} className="r-pvbox" />
        {Array.from({ length: rows }).flatMap((_, r) => Array.from({ length: cols }).map((__, c) => (
          <path key={`pv${r}-${c}`} d={`M${x0 + c * (pw + 3) + 3} ${y0 + 4 + r * (ph + 4)} h${pw} l-3 ${ph} h${-pw} Z`} className="r-pv" />
        )))}
        <text x={x0} y={y0 + rows * (ph + 4) + 18} className="r-label">{sr ? `${sr.n} panneaux ${i.elec.solar.panelWc} Wc · ${ns} série × ${np}` : 'Champ solaire'}</text>
        <text x={x0} y={y0 + rows * (ph + 4) + 33} className="r-label">{sr ? `${(sr.wc / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} kWc · ≈ ${sr.dailyM3.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} m³/jour` : ''}</text>
        <path d={`M${x0 + 20} ${y0 + rows * (ph + 4) + 38} C ${x0} ${boxY - 60}, ${boxX + 40} ${boxY - 70}, ${boxX + 10} ${boxY - 30}`} className="r-dc" />
      </g>,
    );
  }
  if (on('variateur') || isSolar) items.push(<g key="vfd"><g transform={`translate(${boxX + 60},${boxY + 2})`}><RealGlyph kind="vfd" /></g><text x={boxX + 60} y={boxY - 36} textAnchor="middle" className="r-label">{isSolar ? 'MPPT' : 'Variateur'}</text></g>);
  if (on('marche_sec') && !forage && asp) {
    const [sx, sy] = asp[0];
    items.push(<g key="ms" transform={`translate(${sx + 30},${sy - 6})`}><path d="M0 -30 V0" className="r-cablepath" /><RealGlyph kind="electrode" /></g>);
  }

  anchors.pump = { x: pxp + (forage || pit ? 0 : 30), y: pyp, r: forage ? 50 : 62 };
  anchors.source = forage ? { x: 195, y: (G + 540) / 2, r: 90 } : pit ? { x: 225, y: 420, r: 110 } : asp && i.mode === 'aspiration' ? { x: 165, y: 470, r: 90 } : { x: 135, y: 230, r: 100 };
  anchors.dest = { x: ax + 70, y: ay, r: 80 };

  // Lectures des instruments (simulation)
  const lcd: ReactNode[] = [];
  if (live) {
    const r = live.r;
    const fx = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
    const val: Record<string, string> = {
      'acc:manometre': `${fx(r.pRef)} bar`, 'acc:vacuometre': `${fx(r.pAsp, 2)} bar`, 'acc:debitmetre': `${fx(r.q)} m³/h`,
      'acc:capteur_p': `${fx(r.pRef)} bar`, 'acc:vessie': live.kind === 'vessel' || live.kind === 'vfd' ? `${fx(live.x)} bar` : '',
      cable: `${fx(r.amps)} A`, pv: live.pv != null ? `${fx(live.pv, 2)} kW` : '',
    };
    for (const [k, t] of Object.entries(val)) {
      const an = anchors[k];
      if (!an || !t) continue;
      const w = t.length * 7.6 + 12;
      const side = ['acc:manometre', 'acc:vacuometre', 'acc:capteur_p'].includes(k);
      const y = k === 'acc:vessie' ? an.y + 44 : k === 'cable' ? an.y + 36 : k === 'pv' ? an.y + 48 : side ? an.y - 8 : an.y - 40;
      const cx = side ? an.x + 16 + w / 2 : an.x;
      lcd.push(<g key={`lcd-${k}`} className="lcd"><rect x={cx - w / 2} y={y - 13} width={w} height={19} rx={4} /><text x={cx} y={y + 1} textAnchor="middle">{t}</text></g>);
    }
    lcd.push(<g key="state" className={live.on ? 'state on' : 'state off'}><circle cx={pxp + (forage || pit ? 34 : 0)} cy={pyp - (forage ? 40 : pit ? 70 : 50)} r={8} /><text x={pxp + (forage || pit ? 46 : 12)} y={pyp - (forage ? 36 : pit ? 66 : 46)}>{live.on ? 'EN MARCHE' : 'ARRÊT'}</text></g>);
  }

  // Surbrillance des éléments signalés
  const hl: ReactNode[] = [];
  for (const t of highlight) {
    if (t === 'asp' && asp) hl.push(<path key="h-asp" d={path(asp)} className="hl-path" />);
    else if (t === 'ref') hl.push(<path key="h-ref" d={path(ref)} className="hl-path" />);
    else if (anchors[t]) { const a = anchors[t]; hl.push(<circle key={`h-${t}`} cx={a.x} cy={a.y} r={a.r ?? 34} className="hl-ring" />); }
    else if (t.startsWith('acc:')) {
      const a = ACC[t.slice(4)];
      const base = a?.side === 'asp' && asp ? along(asp, polyLen(asp) / 2) : a?.side === 'ref' ? along(ref, polyLen(ref) * 0.55) : anchors.cable ?? anchors.pump;
      hl.push(<g key={`h-${t}`}><circle cx={base.x} cy={base.y} r={34} className="hl-ring ghost" /><text x={base.x} y={base.y - 42} textAnchor="middle" className="hl-txt">Manque : {a?.label ?? t}</text></g>);
    }
  }

  // Console : on détecte la zone vide du sous-sol selon la scène et on y écrit l'état de l'installation
  const consoleEl: ReactNode[] = [];
  if (term && term.length) {
    let box = { x0: 20, y0: G + 60, x1: W - 20, y1: H - 12 };
    if (forage) box = { x0: 545, y0: G + 40, x1: W - 20, y1: H - 12 };
    else if (pit) box = { x0: 380, y0: G + 112, x1: ax - 150, y1: H - 12 };
    else if (i.mode === 'aspiration') box = { x0: 330, y0: G + 62, x1: W - 20, y1: H - 12 };
    const bw = box.x1 - box.x0, bh = box.y1 - box.y0;
    if (bw > 220 && bh > 80) {
      const lh = 16.5, maxLines = Math.floor((bh - 34) / lh), maxChars = Math.floor((bw - 24) / 7.55);
      const lines = term.slice(0, maxLines);
      const color: Record<string, string> = { ok: 't-ok', warn: 't-warn', crit: 't-crit', info: 't-info', cmd: 't-cmd' };
      const sym: Record<string, string> = { ok: '[ OK ]', warn: '[ !! ]', crit: '[ XX ]', info: '[ ·· ]', cmd: '' };
      consoleEl.push(
        <g key="console" className="term">
          <rect x={box.x0} y={box.y0} width={bw} height={bh} rx={9} className="t-bg" />
          <rect x={box.x0} y={box.y0} width={bw} height={20} rx={9} className="t-bar" />
          <rect x={box.x0} y={box.y0 + 12} width={bw} height={8} className="t-bar" />
          {[0, 1, 2].map((k) => <circle key={k} cx={box.x0 + 14 + k * 13} cy={box.y0 + 10} r={4} className={`t-dot d${k}`} />)}
          <text x={box.x0 + 56} y={box.y0 + 14} className="t-title">ECO PUMP AFRIK — console {live ? '(temps réel)' : '(analyse)'}</text>
          {lines.map((l, n) => {
            const pre = sym[l.tag] ? `${sym[l.tag]} ` : '';
            const txt = (pre + l.text).slice(0, maxChars);
            return <text key={n} x={box.x0 + 12} y={box.y0 + 38 + n * lh} className={`t-line ${color[l.tag]}`} xmlSpace="preserve">{txt}</text>;
          })}
          <text x={box.x0 + 12} y={box.y0 + 38 + lines.length * lh} className="t-line t-cmd">ecopump&gt; <tspan className="t-cursor">█</tspan></text>
        </g>,
      );
    }
  }

  // Cotes
  const refEndY = ref[ref.length - 1][1];
  dims.push(<Dim key="dref" x={ax - 22} y1={forage ? G : pumpXY[1]} y2={refEndY} label={forage ? `${fm(i.geo.hRef)} au-dessus du sol` : `Refoulement ${fm(i.geo.hRef)}`} side={-1} />);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W * 0.68 }} className="realview" role="img" aria-label={`Vue réaliste de l'installation : ${APPS[i.app].label}`}>
      <rect x={0} y={0} width={W} height={G} className="r-sky" />
      <g {...pick('source')}>{scene}</g>
      <g {...pick('dest')}>{destEls}</g>
      {asp && <g {...pick('asp')}><Pipe pts={asp} mat={i.asp.material} dn={i.asp.dn} flow={flow} /></g>}
      <g {...pick('ref')}><Pipe pts={ref} mat={i.ref.material} dn={i.ref.dn} flow={flow} /></g>
      <g {...pick('pump')}>{front}</g>
      {items}
      {dims}
      {consoleEl}
      {lcd}
      {hl}
      <g className="r-legend">
        <text x={16} y={26} className="r-title">{APPS[i.app].label} · {fluid.label} · {i.fluid.temp} °C</text>
        <text x={16} y={47}>{asp ? `Aspiration DN${i.asp.dn} ${PIPE_MATS[i.asp.material].label} ${i.asp.length} m · ` : ''}Refoulement DN{i.ref.dn} {PIPE_MATS[i.ref.material].label} {i.ref.length} m</text>
        {h.ok && <text x={16} y={66}>Point de fonctionnement : {h.q.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m³/h à {h.h.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m</text>}
      </g>
    </svg>
  );
}
