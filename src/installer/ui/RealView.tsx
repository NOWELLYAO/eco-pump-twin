import { useId, useRef, type MouseEvent, type ReactNode } from 'react';
import { useDeclutter } from '../../ui/declutter';
import { electrodeDepth, type Readings, type SimKind } from '../sim';
import { backupCalc, backupMode, backupOf, floatKind } from '../backup';
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

export interface Live {
  on: boolean; r: Readings; kind: SimKind; x: number; pv?: number;
  dd?: number; trip?: string | null; hum?: boolean; noFlow?: boolean; vesFill?: number;
  floatPit?: 'high' | 'low' | 'tangle'; floatRes?: boolean; tripKind?: string | null;
  faults?: string[]; powered?: boolean; runaway?: boolean; isolated?: boolean;
  use?: number; // consommation relative (robinets, réseau aval)
  inflow?: number; // arrivée dans la fosse (m³/h)
  syms?: string[]; runTot?: number; startLog?: number[]; simT?: number; // pour le coffret en direct
  phys?: Phys;
  hz?: number;
  overflow?: boolean; backDrop?: boolean; lowLevel?: boolean;
  bk?: number; bkFeed?: boolean; bkFill?: boolean; bkOpen?: boolean; bkLatch?: string | null; bkQ?: number; // réservoir de secours
}
/** Grandeurs physiques simulées */
export interface Phys { tmCause?: string; relaySet?: number; tm: number; tl: number; relay: number; pPeak?: number; peakAge?: number; burst: 'fuite' | 'rupture' | null; burnt: boolean; sealGone: boolean }

/** Flotteur à câble : il pivote autour du point de serrage du câble et suit la surface de l'eau. */
function FloatSw({ px, py, waterY, L = 24, stuck, title }: { px: number; py: number; waterY: number; L?: number; stuck?: 'up' | 'down'; title: string }) {
  let th: number;
  if (stuck === 'up') th = 150;
  else if (stuck === 'down') th = 4;
  else { const c = (waterY - py) / L; th = c >= 1 ? 0 : c <= -0.96 ? 165 : (Math.acos(c) * 180) / Math.PI; }
  const closed = th > 90;
  return (
    <g>
      <g className="r-anim-slow" style={{ transform: `translate(${px}px, ${py}px) rotate(${-th}deg)` }}>
        <path d={`M0 0 V${L - 9}`} className="g-cable" />
        <ellipse cx={0} cy={L} rx={6.5} ry={10} className={`g-float ${closed ? 'closed' : ''} ${stuck ? 'stuck' : ''}`} />
      </g>
      <circle cx={px} cy={py} r={2.6} className="g-dark" />
      <title>{title} — contact {closed ? 'basculé (fermé)' : 'au repos'}{stuck ? ' — BLOQUÉ' : ''}</title>
    </g>
  );
}

export function RealView({ i, h, highlight = [], onPick, live, term }: { i: Installation; h: Hydro; highlight?: string[]; onPick?: (t: string) => void; live?: Live; term?: TermLine[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  useDeclutter(svgRef, ['.r-note text', '.r-dim text', 'g.lcd', 'g.r-closed', 'g.r-tbadge', 'text.r-label', 'text.r-stuck', 'g.state'], '.r-legend, g.term, .r-obst');
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const on = (id: string) => !!i.acc[id]?.on;
  const flow = live ? live.on && live.r.q > 0.05 : h.ok && h.q > 0.05;
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
  const bkp = backupOf(i); // réservoir de secours en by-pass (forage)
  const BKW = bkp ? 200 : 0;
  const W = 1000 + DX + DR + BKW;

  let G = 320;
  let asp: Pt[] | null = null;
  let ref: Pt[] = [];
  let refStart = 30;
  const scene: ReactNode[] = [];
  const front: ReactNode[] = [];
  const dims: ReactNode[] = [];
  let pumpXY: Pt = [440, 290];
  // Parties visibles du groupe : moteur (chaleur), roue et ventilateur (rotation)
  let motorBox = { x: 0, y: 0, w: 0, h: 0 };
  let impXY: Pt = [440, 290];
  let fanXY: Pt | null = null;

  if (forage) {
    G = 200;
    const bottomY = 540;
    const k = (bottomY - G - 10) / Math.max(10, i.geo.boreDepth);
    const yS = G + i.geo.staticLevel * k, yD = G + i.geo.dynamicLevel * k, yP = G + i.geo.pumpDepth * k;
    // Niveau réel : dynamique (+ rabattement) en pompage, remonte vers le statique à l'arrêt
    // En marche : niveau dynamique ; à l'arrêt : remonte vers le statique, sauf si la nappe est rabattue (source qui se tarit)
    const yNow = live ? Math.min(bottomY - 6, (live.on && !live.hum) || (live.dd ?? 0) > 0.05 ? yD + (live.dd ?? 0) * k : yS) : yD;
    scene.push(
      <rect key="soil" x={0} y={G} width={W} height={H - G} className="r-soil" />,
      <rect key="bore" x={150} y={G} width={90} height={bottomY - G} className="r-bore" />,
      <clipPath key="bc" id={`bore${uid}`}><rect x={152} y={G} width={86} height={bottomY - G} /></clipPath>,
      <g key="w" clipPath={`url(#bore${uid})`}>
        <g className="r-anim-level" style={{ transform: `translateY(${yNow - G}px)` }}>
          <rect x={152} y={G} width={86} height={bottomY - G + 4} className={liquidCls} />
          <rect x={152} y={G} width={86} height={3} className="r-surface" />
        </g>
      </g>,
      <path key="st" d={`M140 ${yS} H250`} className="r-level dashed" />,
      <path key="dy" d={`M140 ${yD} H250`} className="r-level" />,
      <path key="c1" d={`M150 ${G - 12} V${bottomY}`} className="r-casing" />, <path key="c2" d={`M240 ${G - 12} V${bottomY}`} className="r-casing" />,
      <rect key="head" x={140} y={G - 26} width={110} height={14} rx={2} className="r-plinth" />,
    );
    // L'entrée de la pompe (crépine entre pompe et moteur) est dessinée à la profondeur réelle de la pompe
    const top = Math.min(yP - 56, bottomY - 110);
    const pTop = Math.max(yD + 6, top);
    const yE = Math.max(yD + 3, Math.min(pTop + 50, G + electrodeDepth(i) * k)); // électrodes / sonde de niveau
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
    motorBox = { x: 183, y: pTop + 56, w: 24, h: 40 }; impXY = [195, pTop + 28];
    ref = [[195, pTop], [195, G - 40], [REF_END, G - 40]];
    refStart = polyLen(ref.slice(0, 2)) + 40;
    if (on('marche_sec')) front.push(<g key="el" transform={`translate(170,${yE})`}><path d={`M0 ${-(yE - G)} V0`} className="r-cablepath" /><RealGlyph kind="electrode" /><title>Électrodes de manque d'eau : la pompe s'arrête si l'eau descend sous ce point</title></g>);
    if (on('sonde_niveau')) front.push(<g key="sn" transform={`translate(228,${yE + 8})`}><path d={`M0 ${-(yE + 8 - G)} V0`} className="r-cablepath" /><RealGlyph kind="probe" /><title>Sonde de niveau : mesure la hauteur d'eau, arrêt au niveau mini</title></g>);
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
    const yAlarm = Math.max(yStop - 1.6 * (yStop - yStart), G + 18);
    const yWater = live && live.kind === 'pit' ? Math.max(G + 4, Math.min(floor - 4, yStop - (live.x / 0.5) * (yStop - yStart))) : yStart + 12;
    scene.push(
      <rect key="soil" x={0} y={G} width={W} height={H - G} className="r-soil" />,
      <rect key="pit" x={100} y={G} width={250} height={floor - G + 14} className="r-concrete" />,
      <rect key="in" x={114} y={G} width={222} height={floor - G} className="r-pitin" />,
      <clipPath key="pc" id={`pit${uid}`}><rect x={114} y={G} width={222} height={floor - G} /></clipPath>,
      <g key="liq" clipPath={`url(#pit${uid})`}>
        <g className="r-anim-level" style={{ transform: `translateY(${yWater - G}px)` }}>
          <rect x={114} y={G} width={222} height={floor - G + 4} className={liquidCls} />
          <rect x={114} y={G} width={222} height={3} className="r-surface" />
        </g>
      </g>,
      <rect key="lid" x={96} y={G - 10} width={258} height={10} rx={2} className="r-plinth" />,
      ...(live?.kind === 'pit' && live.overflow ? [
        <g key="povf" className="r-ovf">
          <rect x={92} y={G - 15} width={266} height={6} rx={3} className="r-water" />
          <path d={`M92 ${G - 12} q -14 2 -18 14`} className="r-stream" strokeWidth={4} />
          <path d={`M358 ${G - 12} q 14 2 18 14`} className="r-stream" strokeWidth={4} />
          <ellipse cx={70} cy={G + 2} rx={26} ry={4} className="r-puddle" />
          <ellipse cx={382} cy={G + 2} rx={26} ry={4} className="r-puddle" />
        </g>,
      ] : []),
      <path key="inlet" d={`M0 ${G + 40} H114`} stroke="#8a96a3" strokeWidth={14} className="r-pipe" />,
      ...(live?.kind === 'pit' && (live.inflow ?? 0) > 0.02 ? [
        <path key="inf" d={`M0 ${G + 40} H114`} className="r-flow slow" strokeWidth={4} />,
        <g key="infs" clipPath={`url(#pit${uid})`}><path d={`M118 ${G + 46} V${Math.max(G + 50, yWater)}`} className="r-stream-body" strokeWidth={5} /><path d={`M118 ${G + 46} V${Math.max(G + 50, yWater)}`} className="r-stream" strokeWidth={2.5} /></g>,
      ] : []),
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
    motorBox = { x: 172, y: floor - 98, w: 50, h: 58 }; impXY = [197, floor - 21];
    ref = [[270, floor - 20], [300, floor - 20], [300, G + 50], [REF_END, G + 50]];
    refStart = 50;
    const floats: [string, number][] = [['flotteur_arret', yStop], ['flotteur_marche', yStart], ['flotteur_alarme', yAlarm]];
    floats.forEach(([id, y], n) => {
      if (!on(id)) return;
      const px = 132 + n * 20;
      const tangle = live?.floatPit === 'tangle' && (id === 'flotteur_arret' || id === 'flotteur_marche');
      const stuck = (live?.floatPit === 'high' || tangle) && id === 'flotteur_arret' ? 'up' : (live?.floatPit === 'low' || tangle) && id === 'flotteur_marche' ? 'down' : undefined;
      front.push(
        <g key={id}>
          <path d={`M${px - 12} ${G} C ${px - 12} ${G + 30}, ${px} ${y - 30}, ${px} ${y}`} className="r-cablepath" />
          <FloatSw px={px} py={y} waterY={yWater} stuck={stuck} title={id === 'flotteur_arret' ? 'Flotteur d\'arrêt' : id === 'flotteur_marche' ? 'Flotteur de marche' : 'Flotteur d\'alarme'} />
          {stuck && !tangle && <text x={px + 16} y={y - 14} className="r-stuck">bloqué</text>}
          {tangle && id === 'flotteur_marche' && <g><path d={`M${px - 26} ${y - 46} c 8 -10 18 10 26 0 c 6 -8 14 6 18 -2`} className="r-tangle" /><text x={px + 16} y={y - 40} className="r-stuck">emmêlés</text></g>}
        </g>,
      );
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
      const ddPx = Math.min(bottomY - wl - 8, (live?.dd ?? 0) * 22);
      scene.push(
        <path key="bank" d={`M20 ${G} L60 ${bottomY} H280 L310 ${G} Z`} className="r-pitin" />,
        <clipPath key="bkc" id={`bank${uid}`}><path d={`M20 ${G} L60 ${bottomY} H280 L310 ${G} Z`} /></clipPath>,
        <g key="water" clipPath={`url(#bank${uid})`}>
          <g className="r-anim-level" style={{ transform: `translateY(${wl + ddPx - G}px)` }}>
            <rect x={20} y={G} width={290} height={bottomY - G + 4} className={liquidCls} />
            <rect x={20} y={G} width={290} height={3} className="r-surface" />
          </g>
        </g>,
      );
      const inletY = Math.min(bottomY - 14 - i.geo.bottom * 30, wl + 20 + i.geo.immersion * 40);
      const inX = vertical ? px - 30 : px - 28;
      asp = [[170, inletY], [170, axisY], [inX, axisY]];
      dims.push(<Dim key="d1" x={120} y1={wl} y2={axisY} label={`Aspiration ${fm(i.geo.suctionLift)}`} side={-1} />);
    } else {
      const tankTop = 110;
      const wl = Math.max(tankTop + 12, axisY - 20 - i.geo.chargeHead * 40);
      const ddPx = Math.min(G - wl - 10, (live?.dd ?? 0) * 40);
      scene.push(
        <rect key="tank" x={40} y={tankTop} width={190} height={G - tankTop} rx={6} className="r-tank" />,
        <clipPath key="tc" id={`bache${uid}`}><rect x={46} y={tankTop + 6} width={178} height={G - tankTop - 12} rx={3} /></clipPath>,
        <g key="liq" clipPath={`url(#bache${uid})`}>
          <g className="r-anim-level" style={{ transform: `translateY(${wl + ddPx - tankTop}px)` }}>
            <rect x={46} y={tankTop} width={178} height={G - tankTop} className={liquidCls} />
            <rect x={46} y={tankTop} width={178} height={3} className="r-surface" />
          </g>
        </g>,
      );
      const inX = vertical ? px - 30 : px - 28;
      asp = [[230, axisY], [inX, axisY]];
      dims.push(<Dim key="d1" x={58} y1={wl} y2={axisY} label={`En charge ${fm(i.geo.chargeHead)}`} />);
    }
    front.push(vertical ? <VerticalPump key="vp" x={px} y={axisY} atex={on('atex')} /> : <SurfacePump key="sp" x={px} y={axisY} atex={on('atex')} />);
    if (vertical) { motorBox = { x: px - 22, y: axisY - 180, w: 44, h: 70 }; impXY = [px, axisY]; fanXY = [px, axisY - 192]; }
    else { motorBox = { x: px + 26, y: axisY - 20, w: 98, h: 40 }; impXY = [px, axisY]; fanXY = [px + 140, axisY]; }
    ref = vertical ? [[px + 30, axisY], [px + 80, axisY], [px + 80, 150], [REF_END, 150]] : [[px, axisY - 38], [px, 150], [REF_END, 150]];
    refStart = 26;
  }

  // Pompes en parallèle : copies en retrait + étiquette
  const cntP = Math.max(1, i.pump.count ?? 1);
  if (cntP > 1 && !forage && front.length) {
    const main = front[0];
    const ghosts = Array.from({ length: Math.min(cntP - 1, 3) }, (_, k) => (
      <g key={`gh${k}`} opacity={0.5} transform={pit ? `translate(${(k + 1) * 78},0)` : `translate(${(k + 1) * 16},${-(k + 1) * 11})`}>{main}</g>
    ));
    front.unshift(...ghosts.reverse());
  }

  // ----- Destination (avec l'eau qui circule) -----
  const [ax, ay] = ref[ref.length - 1];
  const destG = G;
  const destEls: ReactNode[] = [];
  const qr = live ? Math.max(0, Math.min(1.6, live.r.q / Math.max(0.1, i.duty.qReq))) : flow ? 1 : 0; // débit relatif
  // Eau disponible aux robinets : la pompe débite, ou le réservoir à vessie contient encore de l'eau sous pression
  // (le réservoir de secours, lui, se raccorde en aval, juste avant la maison : la vessie ne débite plus quand il alimente)
  // Château d'eau en série : la maison est servie par le réservoir, la vessie ne débite que dans le robinet à flotteur
  const bkSerie = !!bkp && backupMode(bkp) === 'serie';
  const fromVessel = !!live && !bkSerie && (live.kind === 'vessel' || live.kind === 'vfd') && !live.bkFeed && (live.vesFill ?? 0) > 0.02 && (live.x ?? 0) > 0.3;
  const netFlow = live ? (bkSerie ? (live.bk ?? 1) > 0.002 : flow || fromVessel || !!live.bkFeed) : flow;
  const dryTaps = !!live && !netFlow;
  const use = live ? (dryTaps ? 0 : Math.max(0, live.use ?? 0)) : 0.6; // consommation relative (robinets, réseau aval)
  const stream = (k: string, x: number, y1: number, y2: number, w = 6) => (
    <g key={k}><path d={`M${x} ${y1} V${y2}`} className="r-stream-body" strokeWidth={w} /><path d={`M${x} ${y1} V${y2}`} className="r-stream" strokeWidth={Math.max(2, w * 0.45)} /></g>
  );
  const pressureMode = live ? live.kind === 'vessel' || live.kind === 'vfd' : !!(i.acc.pressostat?.on || i.acc.capteur_p?.on);
  if (dest === 'reservoir' && pressureMode && i.app !== 'surpression') {
    // Alimentation directe sous pression (pressostat / variateur) : maison avec robinets
    const hx = ax + 20 + BKW, hy = destG - 90;
    if (bkp) {
      // Réservoir de secours surélevé, en by-pass : remplissage par robinet à flotteur, retour par clapet vers la maison
      const bc = backupCalc(i, bkp);
      const fillB = live ? Math.max(0, Math.min(1, live.bk ?? 1)) : 0.85;
      const tw = 116, th = 58, tx = ax + 48, ty = 34;
      const teeIn = ax + 22, teeOut = tx + tw - 22;
      const yTop = ty + 6, yBot = ty + th - 5, yWb = yBot - (yBot - yTop) * fillB;
      const filling = !!live?.bkFill, feeding = !!live?.bkFeed;
      destEls.push(
        <g key="bk" className="r-bk">
          <path d={`M${tx + 12} ${ty + th} L${tx + 4} ${destG} M${tx + tw - 12} ${ty + th} L${tx + tw - 4} ${destG} M${tx + 8} ${ty + th + 46} H${tx + tw - 8} M${tx + 10} ${ty + th + 4} L${tx + tw - 6} ${ty + th + 46} M${tx + tw - 10} ${ty + th + 4} L${tx + 6} ${ty + th + 46}`} className="r-legs" />
          {/* montée (remplissage) depuis un té sur la conduite de la maison */}
          <path d={`M${teeIn} ${ay} V${ty + 12} H${tx + 8}`} stroke="#8a96a3" strokeWidth={6} className="r-pipe" />
          {filling && <path d={`M${teeIn} ${ay} V${ty + 12} H${tx + 8}`} className="r-flow" strokeWidth={2.5} />}
          {/* descente (secours) avec clapet vers la maison */}
          <path d={`M${teeOut} ${ty + th} V${ay}`} stroke="#8a96a3" strokeWidth={7} className="r-pipe" />
          {feeding && <path d={`M${teeOut} ${ty + th} V${ay}`} className="r-flow" strokeWidth={3} />}
          <circle cx={teeIn} cy={ay} r={4} className="e-dot" /><circle cx={teeOut} cy={ay} r={4} className="e-dot" />
          <rect x={tx} y={ty} width={tw} height={th} rx={8} className="r-tank" />
          <clipPath id={`bk${uid}`}><rect x={tx + 5} y={yTop} width={tw - 10} height={yBot - yTop} rx={4} /></clipPath>
          <g clipPath={`url(#bk${uid})`}>
            <g className="r-anim-level" style={{ transform: `translateY(${yWb - yTop}px)` }}>
              <rect x={tx + 5} y={yTop} width={tw - 10} height={yBot - yTop + 8} className="r-water" />
              <rect x={tx + 5} y={yTop} width={tw - 10} height={3} className="r-surface" />
            </g>
          </g>
          {filling && stream('bks', tx + 12, ty + 14, yWb, 3)}
          {/* robinet à flotteur : bras + boule qui suit le niveau */}
          <path d={`M${tx + 10} ${ty + 12} L${tx + 34} ${Math.max(ty + 12, yWb - 3)}`} className="r-arm" />
          <circle cx={tx + 36} cy={Math.max(ty + 12, yWb - 3)} r={5} className="g-float" />
          {/* trop-plein : descend le long du support ; coule si le robinet à flotteur ne ferme plus */}
          <path d={`M${tx + tw} ${ty + 12} h8 V${destG - 2}`} stroke="#8a96a3" strokeWidth={3.5} fill="none" className="r-pipe" />
          {live?.overflow && <path d={`M${tx + tw} ${ty + 12} h8 V${destG - 2}`} className="r-flow" strokeWidth={2} />}
          {live?.overflow && <ellipse cx={tx + tw + 8} cy={destG} rx={22} ry={4} className="r-puddle" />}
          {/* électrovanne normalement ouverte (tenue fermée par le coffret) puis clapet */}
          {bkSerie && <g className="r-obst r-bypass" transform={`translate(${(teeIn + teeOut) / 2},${ay})`}><path d="M-8 -6 L8 6 L8 -6 L-8 6 Z" /><path d="M0 0 V-9 M-5 -9 H5" /></g>}
          {!bkSerie && <g className={`r-obst r-ev${live ? (live.bkOpen ? ' open' : ' shut') : ''}`} transform={`translate(${teeOut},${ty + th + 9})`}>
            <path d="M-6 -7 L6 -7 L-6 7 L6 7 Z" />
            <path d="M0 0 H10" className="r-ev-stem" />
            <rect x={10} y={-6} width={11} height={12} rx={2} />
            <path d="M12.5 -3 h6 M12.5 0 h6 M12.5 3 h6" className="r-ev-coil" />
          </g>}
          {!bkSerie && <g className="r-obst" transform={`translate(${teeOut},${Math.max(ty + th + 26, (ty + th + ay) / 2 + 6)}) rotate(90) scale(0.8)`}><RealGlyph kind="check" /></g>}
          {live && (() => {
            const fq = (live.bkQ ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
            const msg = live.overflow ? 'Déborde !' : (live.bk ?? 1) <= 0.002 ? 'VIDE' : bkSerie ? (filling ? `Remplit · ${fq} m³/h` : 'Flotteur fermé') : feeding ? `Secours · ${bc.pHouse.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} bar` : filling ? 'En remplissage' : 'Plein, en attente';
            const w = msg.length * 5.6 + 14;
            return <g className={`r-bk-badge${live.overflow || (live.bk ?? 1) <= 0.002 ? ' over' : feeding ? ' on' : filling ? ' fill' : ''}`}>
              <rect x={tx + tw / 2 - w / 2} y={ty + th / 2 - 2} width={w} height={16} rx={8} />
              <text x={tx + tw / 2} y={ty + th / 2 + 9.5} textAnchor="middle">{msg}</text>
            </g>;
          })()}
        </g>,
        <text key="bkl" x={tx + tw / 2} y={ty - 22} textAnchor="middle" className="r-label">{bkSerie ? 'Château d\'eau' : 'Réservoir de secours'} {bkp.volume.toLocaleString('fr-FR')} L{live ? ` · ${Math.round(fillB * 100)} %` : ` · ${bkp.height} m · ${Math.round(bc.autonomyH)} h`}</text>,
        <text key="bkf" x={teeIn - 6} y={ty + 30} textAnchor="end" className="r-label small">{bkSerie && floatKind(bkp) === 'differentiel' ? `Flotteur différentiel ${bkp.low ?? 80}→100 %` : 'Robinet à flotteur'}</text>,
        bkSerie ? <text key="bkc" x={(teeIn + teeOut) / 2} y={ay + 22} textAnchor="middle" className="r-label small">By-pass (fermé)</text>
          : <text key="bkc" x={tx - 8} y={ty + th + 13} textAnchor="end" className="r-label small">{live ? (live.bkOpen ? 'Électrovanne ouverte' : 'Électrovanne fermée') : 'Électrovanne NO + clapet'}</text>,
      );
    }
    destEls.push(
      <path key="hp" d={`M${ax} ${ay} H${hx + 30} V${hy + 40}`} stroke="#8a96a3" strokeWidth={8} className="r-pipe" />,
      netFlow && (use > 0.05 || (flow && !bkSerie)) ? <path key="hpf" d={`M${bkSerie ? ax + 142 : ax} ${ay} H${hx + 30} V${hy + 40}`} className="r-flow" strokeWidth={3} /> : null,
      <path key="roof" d={`M${hx - 10} ${hy} L${hx + 70} ${hy - 50} L${hx + 150} ${hy} Z`} className="r-roof" />,
      <rect key="house" x={hx} y={hy} width={140} height={90} className="r-building" />,
      <rect key="door" x={hx + 98} y={hy + 40} width={24} height={50} rx={2} className="r-door" />,
      <rect key="sink" x={hx + 18} y={hy + 56} width={50} height={12} rx={3} className="r-sink" />,
      <path key="tap" d={`M${hx + 30} ${hy + 40} V${hy + 32} H${hx + 46} V${hy + 40}`} className="r-tap" />,
      use > 0.08 ? stream('ts', hx + 46, hy + 41, hy + 56, 3 + 3 * Math.min(1, use)) : null,
      <text key="hl" x={hx + 70} y={hy + 106} textAnchor="middle" className="r-label">{dryTaps ? 'Plus d\'eau aux robinets' : `Points d'eau${live ? ` · ${Math.round(use * 100)} %${live.bkFeed ? ' (réservoir de secours)' : bkSerie || !flow ? ' (réservoir)' : ''}` : ''}`}</text>,
    );
  } else if (dest === 'reservoir') {
    // Château d'eau / grande bâche : arrivée par le haut, niveau, flotteur, départ vers le réseau
    const big = i.app === 'forage' || i.app === 'transfert';
    const tw = big ? 170 : 120, th = big ? 96 : 80;
    const tx = ax + 10, ty = ay - th + 34;
    destEls.push(
      <path key="legs" d={`M${tx + 20} ${ty + th} L${tx + 8} ${destG} M${tx + tw - 20} ${ty + th} L${tx + tw - 8} ${destG} ${ty + th + 50 < destG ? `M${tx + 16} ${ty + th + 50} H${tx + tw - 16}` : ''}`} className="r-legs" />,
      <rect key="t" x={tx} y={ty} width={tw} height={th} rx={10} className="r-tank" />,
      <clipPath key="dc" id={`dest${uid}`}><rect x={tx + 6} y={ty + 6} width={tw - 12} height={th - 12} rx={6} /></clipPath>,
    );
    const fill = live && live.kind === 'tank' ? Math.min(1.04, live.x) : 0.7;
    if (live?.kind === 'tank' && live.overflow) {
      // Débordement : l'eau passe par-dessus le bord et ruisselle jusqu'au sol
      const ox = tx + tw;
      destEls.push(
        <g key="ovf" className="r-ovf">
          <path d={`M${ox - 4} ${ty + 4} q 14 4 14 24 V${destG - 2}`} className="r-stream-body" strokeWidth={6} />
          <path d={`M${ox - 4} ${ty + 4} q 14 4 14 24 V${destG - 2}`} className="r-stream" strokeWidth={3} />
          <ellipse cx={ox + 18} cy={destG + 2} rx={30} ry={5} className="r-puddle" />
        </g>,
      );
    }
    const yTop = ty + 12, yBot = ty + th - 6;
    const yW = yBot - (yBot - yTop) * fill;
    // conduite d'arrivée qui monte et se déverse par le haut
    const inX = tx + 34;
    destEls.push(
      <path key="inl" d={`M${ax} ${ay} H${tx - 6} V${ty - 14} H${inX} V${ty + 8}`} stroke="#8a96a3" strokeWidth={7} className="r-pipe" />,
      flow ? <path key="inlf" d={`M${ax} ${ay} H${tx - 6} V${ty - 14} H${inX} V${ty + 8}`} className="r-flow" strokeWidth={3} /> : null,
      <g key="tw" clipPath={`url(#dest${uid})`}>
        <g className="r-anim-level" style={{ transform: `translateY(${yW - ty}px)` }}>
          <rect x={tx + 6} y={ty} width={tw - 12} height={th + 8} className="r-water" />
          <rect x={tx + 6} y={ty} width={tw - 12} height={3} className="r-surface" />
          {flow && <circle cx={inX} cy={ty + 2} r={7} className="r-splash" />}
        </g>
        {flow && stream('ins', inX, ty + 8, yBot, 4 + 4 * Math.min(1, qr))}
      </g>,
    );
    // départ vers le réseau (consommation)
    const outY = ty + th - 12;
    const usingOut = live ? use > 0.05 && fill > 0.03 : true;
    destEls.push(<path key="out" d={`M${tx + tw} ${outY} H${tx + tw + 40} V${destG + 18} H${W}`} stroke="#8a96a3" strokeWidth={6} className="r-pipe" />);
    if (usingOut) destEls.push(<path key="outf" d={`M${tx + tw} ${outY} H${tx + tw + 40} V${destG + 18} H${W}`} className="r-flow slow" strokeWidth={2.5} />);
    destEls.push(<text key="outl" x={tx + tw + 46} y={destG + 12} className="r-label">vers le réseau</text>);
    if (on('flotteur_res')) {
      // Flotteur à bras : la boule suit la surface ; bras horizontal = réservoir plein, arrêt
      const px = tx + tw - 22, py = yTop + 4, L = 30;
      const c = Math.max(-1, Math.min(1, (yW - py) / L));
      const ang = (Math.asin(c) * 180) / Math.PI;
      const stuck = !!live?.floatRes;
      destEls.push(
        <g key="fr">
          <rect x={px - 4} y={ty - 6} width={8} height={py - ty + 8} className="g-dark" />
          <g className="r-anim-slow" style={{ transform: `translate(${px}px, ${py}px) rotate(${stuck ? 70 : 180 - ang}deg)` }}>
            <path d={`M0 0 H${L - 7}`} className="r-arm" />
            <circle cx={L} cy={0} r={7} className={`g-float ${fill >= 0.98 ? 'closed' : ''} ${stuck ? 'stuck' : ''}`} />
          </g>
          <text x={px - 30} y={ty - 10} className="r-label">Flotteur{stuck ? ' bloqué' : fill >= 0.98 ? ' : plein, arrêt' : ''}</text>
        </g>,
      );
    }
  } else if (dest === 'batiment' || dest === 'incendie') {
    const bx = dest === 'incendie' ? ax + 95 : ax + 30, top = 40;
    const floors = Math.max(2, Math.floor((destG - top - 20) / 34));
    const bw = dest === 'incendie' ? 120 : 170;
    destEls.push(<rect key="b" x={bx} y={top} width={bw} height={destG - top} className="r-building" />);
    for (let r = 0; r < floors; r++) for (let c = 0; c < (dest === 'incendie' ? 2 : 3); c++) destEls.push(<rect key={`w${r}${c}`} x={bx + 50 + c * 36} y={top + 14 + r * 34} width={24} height={18} rx={2} className="r-window" />);
    // colonne montante le long de la façade
    const rx = bx + 18;
    destEls.push(
      <path key="col" d={`M${ax} ${ay} H${rx} V${top + 18}`} stroke="#a9b4bd" strokeWidth={7} className="r-pipe" />,
      netFlow && (use > 0.05 || flow) ? <path key="colf" d={`M${ax} ${ay} H${rx} V${top + 18}`} className="r-flow" strokeWidth={3} /> : null,
    );
    if (dest === 'batiment') {
      // un robinet par étage : ouverts selon la consommation du moment
      const nOpen = live ? Math.round(Math.min(1, use) * floors) : Math.ceil(floors / 2);
      for (let r = 0; r < floors; r++) {
        const fy = top + 30 + r * 34;
        const open = (floors - 1 - r) < nOpen; // les étages du bas d'abord
        destEls.push(
          <path key={`tp${r}`} d={`M${rx} ${fy} H${rx + 16} V${fy + 4}`} className="r-tap" />,
          open && (netFlow || !live) ? stream(`ts${r}`, rx + 16, fy + 5, fy + 18, 3) : null,
          <rect key={`sk${r}`} x={rx + 8} y={fy + 18} width={18} height={4} rx={1} className="r-sink" />,
        );
      }
      destEls.push(<text key="bl" x={bx + 85} y={top - 8} textAnchor="middle" className="r-label">{live ? (dryTaps ? 'Plus d\'eau aux robinets : réseau vide' : `${nOpen} étage(s) consomment · ${Math.round(use * 100)} %${!flow ? ' (réservoir)' : ''}`) : 'Robinets aux étages'}</text>);
    } else {
      // Incendie : RIA devant l'immeuble, tuyau déroulé et lance dirigée vers la façade
      const rx2 = ax + 8, ry = destG - 52;
      const fireOn = live ? use > 0.02 : false;
      destEls.push(
        <path key="riap" d={`M${ax} ${ay} V${ry + 12}`} stroke="#d03b3b" strokeWidth={6} className="r-pipe" />,
        <rect key="ria" x={rx2 - 4} y={ry - 8} width={40} height={42} rx={4} className="r-ria" />,
        <circle key="reel" cx={rx2 + 16} cy={ry + 13} r={13} className="r-reel" />,
        <text key="rl" x={rx2 + 16} y={ry - 14} textAnchor="middle" className="r-label">RIA</text>,
      );
      if (fireOn || !live) {
        const lx = ax + 62, ly = destG - 26;
        destEls.push(
          <path key="hose" d={`M${rx2 + 30} ${ry + 24} C ${rx2 + 40} ${destG + 2}, ${lx - 20} ${destG + 2}, ${lx} ${ly}`} className="r-hose" />,
          <path key="lance" d={`M${lx} ${ly} l10 -8`} className="r-lance" />,
          <text key="ll" x={lx - 6} y={destG + 14} className="r-label">Lance</text>,
        );
        // Départ de feu sur la façade quand la lance est ouverte
        const fx2 = bx + 50, fy2 = top + 14 + (floors - 2) * 34;
        if (fireOn) destEls.push(<g key="flame" className="r-flame"><path d={`M${fx2 + 2} ${fy2 + 18} q 4 -16 10 -24 q 2 10 8 4 q 4 10 -2 20 Z`} /><path d={`M${fx2 + 8} ${fy2 + 18} q 2 -8 5 -12 q 2 6 4 2 q 2 6 -2 10 Z`} className="in" /></g>);
        if (flow && fireOn) {
          const jx = lx + 10, jy = ly - 8;
          const tx = fx2 + 10, ty = fy2 + 6;
          const k = Math.min(1.2, qr);
          const ex = jx + (tx - jx) * (0.6 + 0.4 * k), ey = jy + (ty - jy) * (0.6 + 0.4 * k);
          destEls.push(
            <path key="jet" d={`M${jx} ${jy} Q ${(jx + ex) / 2} ${Math.min(jy, ey) - 40 * k} ${ex} ${ey}`} className="r-jet" />,
            <path key="jet2" d={`M${jx} ${jy} Q ${(jx + ex) / 2 - 4} ${Math.min(jy, ey) - 34 * k} ${ex - 6} ${ey + 4}`} className="r-jet thin" />,
            ...[0, 1, 2, 3].map((m) => <circle key={`jd${m}`} cx={ex + (m - 1.5) * 4} cy={ey + 4} r={2.2} className="r-drop" style={{ animationDelay: `${m * 0.2}s` }} />),
          );
        }
      }
      destEls.push(<text key="bl" x={W - 6} y={top - 8} textAnchor="end" className="r-label">{live ? (use > 0.02 ? `Lance ouverte · ${Math.round(use * 100)} % du débit incendie` : 'Réseau en veille (sous pression)') : 'Réseau incendie'}</text>);
    }
  } else if (dest === 'irrigation') {
    destEls.push(<path key="lat" d={`M${ax} ${ay} V${destG - 8} H${ax + 220}`} stroke="#2b2f33" strokeWidth={8} className="r-pipe" />);
    if (flow) destEls.push(<path key="latf" d={`M${ax} ${ay} V${destG - 8} H${ax + 220}`} className="r-flow" strokeWidth={3} />);
    for (let c = 0; c < 10; c++) destEls.push(<path key={`c${c}`} d={`M${ax + 10 + c * 22} ${destG} q4 -14 8 0 q4 -10 8 0`} className="r-crop" />);
    for (let k = 0; k < 3; k++) {
      const sx = ax + 40 + k * 75, sy = destG - 50;
      destEls.push(<path key={`r${k}`} d={`M${sx} ${destG - 8} V${sy}`} className="r-riser" />, <circle key={`n${k}`} cx={sx} cy={sy - 2} r={4} className="g-dark" />);
      if (flow) {
        const R = 26 + 34 * Math.min(1.2, qr);
        destEls.push(
          <g key={`sp${k}`} className="r-sweep" style={{ transformOrigin: `${sx}px ${sy}px`, animationDelay: `${k * 0.4}s` }}>
            <path d={`M${sx} ${sy} q ${-R * 0.5} ${-R * 0.7} ${-R} ${R * 0.35}`} className="r-sprayjet" />
            <path d={`M${sx} ${sy} q ${R * 0.5} ${-R * 0.7} ${R} ${R * 0.35}`} className="r-sprayjet" />
            <path d={`M${sx} ${sy} q ${-R * 0.25} ${-R * 0.55} ${-R * 0.55} ${R * 0.3}`} className="r-sprayjet thin" />
            <path d={`M${sx} ${sy} q ${R * 0.25} ${-R * 0.55} ${R * 0.55} ${R * 0.3}`} className="r-sprayjet thin" />
          </g>,
          ...[-1, 1].flatMap((d) => [0, 1, 2].map((m) => <circle key={`d${k}${d}${m}`} cx={sx + d * R * (0.6 + m * 0.2)} cy={sy + R * 0.2} r={1.8} className="r-drop" style={{ animationDelay: `${(m * 0.25 + k * 0.1).toFixed(2)}s` }} />)),
        );
      }
    }
  } else if (dest === 'regard') {
    // Regard / réseau gravitaire : l'eau tombe puis s'écoule
    destEls.push(
      <rect key="rg" x={ax} y={destG - 6} width={70} height={ay - destG + 70} className="r-concrete" />,
      <rect key="rgi" x={ax + 10} y={destG} width={50} height={ay - destG + 54} className="r-pitin" />,
      <rect key="rgw" x={ax + 10} y={ay + 38} width={50} height={16} className={liquidCls} />,
      <rect key="rgl" x={ax - 4} y={destG - 10} width={78} height={8} rx={2} className="r-plinth" />,
      <path key="rgo" d={`M${ax + 60} ${ay + 46} H${W}`} stroke="#8a96a3" strokeWidth={10} className="r-pipe" />,
    );
    if (flow) destEls.push(stream('rgs', ax + 14, ay, ay + 40, 5 + 4 * Math.min(1, qr)), <path key="rgof" d={`M${ax + 60} ${ay + 46} H${W}`} className="r-flow" strokeWidth={4} />);
    destEls.push(<text key="rgt" x={ax + 80} y={ay + 34} className="r-label">vers le réseau d'assainissement</text>);
  } else if (dest === 'cuve') {
    const fill = live && live.kind === 'tank' ? Math.min(1, live.x) : 0.55;
    destEls.push(
      <rect key="cv" x={ax + 10} y={ay - 30} width={160} height={70} rx={35} className="r-tank" />,
      <clipPath key="cc" id={`cuve${uid}`}><rect x={ax + 16} y={ay - 24} width={148} height={58} rx={29} /></clipPath>,
      <g key="cvw" clipPath={`url(#cuve${uid})`}><g className="r-anim-level" style={{ transform: `translateY(${58 * (1 - fill)}px)` }}><rect x={ax + 16} y={ay - 24} width={148} height={60} className={liquidCls} /><rect x={ax + 16} y={ay - 24} width={148} height={3} className="r-surface" /></g>{flow && stream('cvs', ax + 40, ay - 26, ay + 30, 4)}</g>,
      <path key="cvi" d={`M${ax} ${ay} H${ax + 4} V${ay - 40} H${ax + 40} V${ay - 26}`} stroke="#8a96a3" strokeWidth={6} className="r-pipe" />,
      <path key="cl" d={`M${ax + 40} ${ay + 40} V${destG} M${ax + 140} ${ay + 40} V${destG}`} className="r-legs" />,
      <text key="ct" x={ax + 90} y={ay + 58} textAnchor="middle" className="r-note">Cuve</text>,
    );
  } else if (dest === 'bassin') {
    const py0 = destG + 8;
    destEls.push(
      <path key="pl" d={`M${ax} ${ay} V${destG + 30} H${ax + 12}`} stroke="#8a96a3" strokeWidth={10} className="r-pipe" />,
      <rect key="pb" x={ax + 10} y={destG} width={190} height={74} className="r-pitin" />,
      <rect key="pw" x={ax + 12} y={py0} width={186} height={64} className="r-water" />,
      <rect key="pws" x={ax + 12} y={py0} width={186} height={3} className="r-surface" />,
      <text key="pt" x={ax + 105} y={destG + 92} textAnchor="middle" className="r-label">Bassin · buse de refoulement</text>,
    );
    if (flow) destEls.push(
      <path key="plf" d={`M${ax} ${ay} V${destG + 30} H${ax + 12}`} className="r-flow" strokeWidth={4} />,
      <path key="pjet" d={`M${ax + 14} ${destG + 30} q 40 -6 80 4`} className="r-jet thin" />,
      ...[0, 1, 2, 3, 4].map((k) => <circle key={`bb${k}`} cx={ax + 30 + k * 16} cy={destG + 34} r={2.2 + (k % 2)} className="r-bubble" style={{ animationDelay: `${k * 0.3}s` }} />),
    );
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
        <g className="r-obst" transform={`translate(${p.x},${p.y}) rotate(${vertical ? 0 : p.a})`}><RealGlyph kind={a.glyph} /></g>
        {id === 'vanne_ref' && live?.faults?.includes('vanne_fermee') && <g className="r-closed"><path d={`M${p.x - 10} ${p.y - 10} L${p.x + 10} ${p.y + 10} M${p.x + 10} ${p.y - 10} L${p.x - 10} ${p.y + 10}`} /></g>}
        <text x={vertical ? p.x + 22 : a.glyph === 'vessel' ? p.x - 20 : p.x} y={vertical ? p.y + 4 : down ? p.y + (a.glyph === 'vessel' ? 50 : 40) : up ? p.y - (a.glyph === 'surge' ? 78 : 50) - (upN % 2) * 15 : p.y + 32 + (inlineN % 2) * 17} textAnchor={vertical ? 'start' : a.glyph === 'vessel' && !vertical ? 'end' : 'middle'} className="r-label">
          <title>{a.label}</title>{SHORT[id] ?? a.label}{dnTxt}{id === 'vanne_ref' && live?.faults?.includes('vanne_fermee') && <tspan className="r-closed-t"> FERMÉE</tspan>}
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
    items.push(<g key="cof" {...pick('cable')}><path d={`M${boxX} ${boxY + 28} C ${boxX - 40} ${boxY + 60}, ${pxp + 60} ${pyp + 10}, ${pxp + (forage || pit ? 20 : 70)} ${pyp}`} className="r-cablepath" /><g className="r-obst" transform={`translate(${boxX},${boxY})`}><RealGlyph kind="panel" /></g><text x={boxX} y={boxY - 36} textAnchor="middle" className="r-label">Coffret</text></g>);
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
  if (on('variateur') || isSolar) items.push(<g key="vfd"><g className="r-obst" transform={`translate(${boxX + 60},${boxY + 2})`}><RealGlyph kind="vfd" /></g><text x={boxX + 60} y={boxY - 36} textAnchor="middle" className="r-label">{isSolar ? 'MPPT' : 'Variateur'}</text></g>);
  if (on('marche_sec') && !forage && asp) {
    const [sx, sy] = asp[0];
    items.push(<g key="ms" transform={`translate(${sx + 30},${sy - 6})`}><path d="M0 -30 V0" className="r-cablepath" /><RealGlyph kind="electrode" /></g>);
  }

  if (cntP > 1 && !forage) {
    const sb = Math.max(0, i.pump.standby ?? 0);
    dims.push(<text key="npump" x={pit ? 225 : pxp - 40} y={pit ? G - 18 : G + 46} textAnchor={pit ? 'middle' : 'start'} className="r-label par">{sb ? `${cntP} pompes · ${cntP - sb} en service + ${sb} de secours` : `${cntP} pompes en parallèle`}</text>);
  }
  anchors.pump = { x: pxp + (forage || pit ? 0 : 30), y: pyp, r: forage ? 50 : 62 };
  anchors.source = forage ? { x: 195, y: (G + 540) / 2, r: 90 } : pit ? { x: 225, y: 420, r: 110 } : asp && i.mode === 'aspiration' ? { x: 165, y: 470, r: 90 } : { x: 135, y: 230, r: 100 };
  anchors.dest = { x: ax + 70, y: ay, r: 80 };

  // Lectures des instruments (simulation)
  const lcd: ReactNode[] = [];
  if (live) {
    const r = live.r;
    const fx = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
    // Surpression : le compteur est posé après le réservoir à vessie, il mesure ce que la maison consomme
    // (pompe en marche ou non). Pompe arrêtée, le manomètre (entre la pompe et le clapet) suit la pression du
    // réseau : la colonne reste pleine (clapet de la pompe) et se détend à travers le clapet quand la pression baisse.
    const surp = live.kind === 'vessel' || live.kind === 'vfd';
    const qMeter = bkSerie ? (flow ? r.q : live.bkQ ?? 0) : surp ? ((flow || fromVessel) ? Math.max(0, live.use ?? 0) * i.duty.qReq : 0) : r.q;
    const pMano = surp && !r.on ? Math.max(0, live.x ?? 0) : r.pRef;
    const val: Record<string, string> = {
      'acc:manometre': `${fx(pMano)} bar`, 'acc:vacuometre': `${fx(r.pAsp, 2)} bar`, 'acc:debitmetre': `${fx(qMeter)} m³/h`,
      'acc:capteur_p': `${fx(r.pRef)} bar`, 'acc:vessie': live.kind === 'vessel' || live.kind === 'vfd' ? `${fx(live.x)} bar${live.vesFill != null ? ` · ${Math.round(Math.max(0, Math.min(1, live.vesFill)) * 100)} % eau` : ''}` : '',
      cable: `${fx(r.amps)} A`, pv: live.pv != null ? `${fx(live.pv, 2)} kW` : '',
    };
    for (const [k, t] of Object.entries(val)) {
      const an = anchors[k];
      if (!an || !t) continue;
      const w = t.length * 7.6 + 12;
      const side = ['acc:manometre', 'acc:vacuometre', 'acc:capteur_p', 'acc:vessie'].includes(k);
      const y = k === 'acc:vessie' ? an.y + 6 : k === 'cable' ? an.y + 36 : k === 'pv' ? an.y + 48 : side ? an.y - 8 : an.y - 40;
      const cx = side ? an.x + (k === 'acc:vessie' ? 22 : 16) + w / 2 : an.x;
      lcd.push(<g key={`lcd-${k}`} className="lcd"><rect x={cx - w / 2} y={y - 13} width={w} height={19} rx={4} /><text x={cx} y={y + 1} textAnchor="middle">{t}</text></g>);
    }
    // Pompe arrêtée : le réservoir à vessie alimente seul le réseau (écoulement après le réservoir uniquement)
    const vesA = anchors['acc:vessie'];
    if (vesA && !flow && bkSerie && live.bkFill) lcd.push(<path key="vesfloat" d={`M${vesA.x} ${ref[ref.length - 1][1]} H${ax + 22}`} className="r-flow slow" strokeWidth={3} />);
    if (vesA && !flow && fromVessel && use > 0.05) {
      const yL = ref[ref.length - 1][1], xE = ref[ref.length - 1][0];
      lcd.push(<path key="vesflow" d={`M${vesA.x} ${yL} H${xE}`} className="r-flow slow" strokeWidth={3} />);
    }
    const ves = anchors['acc:vessie'];
    if (ves && live.vesFill != null) {
      const top = ves.y - 40 + 23, hgt = 48, f = Math.max(0, Math.min(1, live.vesFill));
      lcd.push(
        <g key="vesfill">
          <clipPath id={`ves${uid}`}><rect x={ves.x - 14} y={top} width={28} height={hgt} rx={13} /></clipPath>
          <g clipPath={`url(#ves${uid})`}>
            <rect x={ves.x - 14} y={top} width={28} height={hgt} className="r-air" />
            <g className="r-anim-level" style={{ transform: `translateY(${hgt * (1 - f)}px)` }}><rect x={ves.x - 14} y={top} width={28} height={hgt} className="r-water" /></g>
          </g>
        </g>,
      );
    }
    // Physique : moteur qui chauffe / grillé, garniture qui fuit, conduite en surpression / rompue
    const P = live.phys;
    if (P) {
      // Chaleur du moteur : sur le corps du moteur lui-même
      const hot = Math.max(0, Math.min(1, (P.tm - 90) / 70));
      const mb = motorBox, mcx = mb.x + mb.w / 2;
      if ((hot > 0 || P.burnt) && mb.w) lcd.push(<g key="heat" className="r-heat"><rect x={mb.x - 3} y={mb.y - 3} width={mb.w + 6} height={mb.h + 6} rx={8} style={{ opacity: P.burnt ? 0.35 : 0.15 + 0.55 * hot }} /><title>Moteur à {Math.round(P.tm)} °C</title></g>);
      const side = forage || (!!fanXY && fanXY[1] < mb.y); // ventilateur au-dessus du moteur, ou forage étroit : badge sur le côté
      const bx2 = side ? mb.x + mb.w + 50 : mcx, by2 = side ? mb.y + mb.h / 2 - 9 : mb.y - 22;
      if ((P.tm > 120 || P.burnt) && mb.w) lcd.push(<g key="tm" className={`r-tbadge ${P.burnt || P.tm > 140 ? 'crit' : 'warn'}`}><rect x={bx2 - 44} y={by2} width={88} height={18} rx={9} /><text x={bx2} y={by2 + 13} textAnchor="middle">{P.burnt ? 'MOTEUR GRILLÉ' : `moteur ${Math.round(P.tm)} °C`}</text></g>);
      if (P.burnt && mb.w) lcd.push(<g key="smoke" className="r-smoke">{[0, 1, 2].map((k) => <circle key={k} cx={mcx - 8 + k * 8} cy={mb.y - 4} r={6} style={{ animationDelay: `${k * 0.6}s` }} />)}</g>);
      // Liquide qui chauffe : sur le corps de pompe (partie hydraulique), vapeur et fuite à la garniture
      const [hx, hy] = impXY;
      const hotL = Math.max(0, Math.min(1, (P.tl - 45) / 90));
      if (hotL > 0) lcd.push(<g key="lheat" className="r-lheat"><circle cx={hx} cy={hy} r={22} style={{ opacity: 0.15 + 0.5 * hotL }} /><title>Liquide à {Math.round(P.tl)} °C dans la pompe</title></g>);
      if (P.tl > 60) lcd.push(<g key="tl" className={`r-tbadge ${P.sealGone || P.tl > 90 ? 'crit' : 'warn'}`}><rect x={hx - 44} y={hy + 26} width={88} height={18} rx={9} /><text x={hx} y={hy + 39} textAnchor="middle">{`eau ${Math.round(P.tl)} °C`}</text></g>);
      if (P.sealGone || P.tl > 90) lcd.push(<g key="seal" className="r-seal">{P.sealGone && [0, 1, 2].map((k) => <circle key={k} cx={hx + 18} cy={hy + 10} r={2.4} className="r-drop" style={{ animationDelay: `${k * 0.4}s` }} />)}{P.tl > 90 && [0, 1].map((k) => <path key={`v${k}`} d={`M${hx - 6 + k * 12} ${hy - 22} q -5 -8 0 -16 q 5 -8 0 -16`} className="r-vapor" style={{ animationDelay: `${k * 0.7}s` }} />)}</g>);
      const mid = ref[Math.min(ref.length - 1, Math.max(1, Math.floor(ref.length / 2)))];
      const recent = P.pPeak != null && (P.peakAge ?? 1e9) < 600 && P.pPeak > i.ref.pn * 0.8;
      if (recent) lcd.push(<g key="ham"><path d={`M${ref.map((q) => q.join(' ')).join(' L')}`} className="r-overp" /><g className={`r-tbadge ${P.pPeak! > i.ref.pn ? 'crit' : 'warn'}`}><rect x={mid[0] - 70} y={mid[1] - 46} width={140} height={18} rx={9} /><text x={mid[0]} y={mid[1] - 33} textAnchor="middle">pointe {P.pPeak!.toFixed(1).replace('.', ',')} bar · PN{i.ref.pn}</text></g></g>);
      if (P.burst) {
        const [bx0, by0] = mid;
        const big = P.burst === 'rupture';
        lcd.push(<g key="burst" className="r-burst"><path d={`M${bx0 - 6} ${by0 - 6} l12 12 M${bx0 + 6} ${by0 - 6} l-12 12`} className="r-crack" />{(big ? [-40, -20, 0, 20, 40] : [-10, 10]).map((a, k) => <path key={k} d={`M${bx0} ${by0} q ${a * 0.6} ${-30 - (big ? 20 : 0)} ${a} ${big ? -10 : 4}`} className="r-sprayjet" style={{ animationDelay: `${k * 0.12}s` }} />)}<text x={bx0} y={by0 + 26} textAnchor="middle" className="r-label crit">{big ? 'CONDUITE ROMPUE' : 'fuite au raccord'}</text></g>);
      }
    }
    // Fuites visibles : réseau (panne « fuite »), garniture usée
    const fl = live.faults ?? [];
    if (fl.includes('fuite_reseau') && ref.length > 1) {
      const a2 = ref[ref.length - 2], b2 = ref[ref.length - 1];
      const lx = a2[0] + (b2[0] - a2[0]) * 0.6, ly = a2[1] + (b2[1] - a2[1]) * 0.6;
      const strong = live.on && live.r.q > 0.05;
      lcd.push(<g key="leak" className="r-leak">{(strong ? [-14, 0, 14] : [0]).map((a3, k) => <path key={k} d={`M${lx} ${ly} q ${a3 * 0.5} ${strong ? -22 : -6} ${a3} ${strong ? -4 : 8}`} className="r-sprayjet" style={{ animationDelay: `${k * 0.15}s` }} />)}<ellipse cx={lx} cy={Math.max(ly + 14, G + 2)} rx={22} ry={4} className="r-puddle" /></g>);
    }
    if (fl.includes('garniture') && !(P && P.sealGone)) lcd.push(<g key="gar">{[0, 1].map((k) => <circle key={k} cx={pxp + 20} cy={pyp + 10} r={2.2} className="r-drop" style={{ animationDelay: `${k * 0.6}s` }} />)}<ellipse cx={pxp + 22} cy={pyp + 34} rx={14} ry={3} className="r-puddle" /></g>);
    // Retour d'eau pompe arrêtée (clapet anti-retour non étanche)
    if (!live.on && live.backDrop) lcd.push(<path key="back" d={`M${ref.map((q) => q.join(' ')).join(' L')}`} className="r-flow back" strokeWidth={3} />);
    // Voyants du coffret : vert = marche, rouge = défaut, éteints = hors tension
    const cab = anchors.cable;
    if (cab) lcd.push(<g key="leds"><circle cx={cab.x + 12} cy={cab.y - 17} r={3.6} className={`r-led g ${live.powered !== false && live.on ? 'lit' : ''}`} /><circle cx={cab.x + 12} cy={cab.y - 6} r={3.6} className={`r-led r ${live.trip || live.isolated ? 'lit' : ''}`} />{live.powered === false && <rect x={cab.x - 16} y={cab.y - 22} width={20} height={10} rx={1} className="r-scr-off" />}</g>);
    // Éléments tournants : roue (partie hydraulique) et ventilateur du moteur
    {
      const fl2 = live.faults ?? [];
      const turning = live.on && !live.hum && live.powered !== false;
      const rev = fl2.includes('rotation');
      const impTurn = turning && !fl2.includes('arbre_casse');
      const dur = Math.max(0.12, 0.35 * (50 / Math.max(10, live.hz ?? 50)));
      const rotor = (key: string, [cx, cy]: Pt, r: number, spin: boolean, blades: number, cls: string) => (
        <g key={key} className={`r-rotor r-obst ${cls}${spin ? ' spin' : ''}${rev ? ' rev' : ''}${live.hum ? ' shake' : ''}`} style={{ transformOrigin: `${cx}px ${cy}px`, animationDuration: `${dur}s` }}>
          <circle cx={cx} cy={cy} r={r} className="r-rotor-bg" />
          {Array.from({ length: blades }, (_, k) => { const a = (k * 2 * Math.PI) / blades; return <path key={k} d={`M${cx} ${cy} Q ${cx + Math.cos(a + 0.6) * r * 0.7} ${cy + Math.sin(a + 0.6) * r * 0.7} ${cx + Math.cos(a) * r * 0.92} ${cy + Math.sin(a) * r * 0.92}`} className="r-blade" />; })}
          <circle cx={cx} cy={cy} r={r * 0.22} className="r-rotor-hub" />
          <title>{cls === 'fan' ? 'Ventilateur du moteur' : 'Roue de la pompe'}{spin ? (rev ? ' — tourne à l\'envers' : ' — en rotation') : ' — à l\'arrêt'}</title>
        </g>
      );
      lcd.push(rotor('imp', impXY, forage ? 8 : 12, impTurn, 5, 'imp'));
      if (fanXY) lcd.push(rotor('fan', fanXY, 13, turning, 4, 'fan'));
    }
    const stTxt = live.trip ? 'DÉFAUT' : live.hum ? 'BLOQUÉ' : live.noFlow ? 'À SEC' : live.on ? 'EN MARCHE' : live.lowLevel ? 'ARRÊT · MANQUE D\'EAU' : 'ARRÊT';
    lcd.push(<g key="state" className={live.trip || live.hum || live.noFlow ? 'state fault' : live.on ? 'state on' : 'state off'}><circle cx={pxp + (forage || pit ? 34 : 0)} cy={pyp - (forage ? 40 : pit ? 70 : 50)} r={8} /><text x={pxp + (forage || pit ? 46 : 12)} y={pyp - (forage ? 36 : pit ? 66 : 46)}>{stTxt}</text></g>);
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
      const color: Record<string, string> = { ok: 't-ok', warn: 't-warn', crit: 't-crit', info: 't-info', cmd: 't-cmd' };
      const sym: Record<string, string> = { ok: '[ OK ]', warn: '[ !! ]', crit: '[ XX ]', info: '[ ·· ]', cmd: '' };
      const lh = 16.5, maxLines = Math.floor((bh - 34) / lh), maxChars = Math.floor((bw - 24) / 7.55);
      // Lignes longues : retour à la ligne sur un mot, aligné sous le texte (après l'étiquette)
      const rows: { tag: string; txt: string }[] = [];
      for (const l of term) {
        const pre = sym[l.tag] ? `${sym[l.tag]} ` : '';
        let rest = pre + l.text, first = true;
        const ind = ' '.repeat(Math.min(16, pre.length + 8));
        while (rest.length) {
          const room = maxChars - (first ? 0 : ind.length);
          let cut = rest.length <= room ? rest.length : rest.lastIndexOf(' ', room);
          if (cut <= room * 0.5) cut = Math.min(rest.length, room);
          rows.push({ tag: l.tag, txt: (first ? '' : ind) + rest.slice(0, cut).trimEnd() });
          rest = rest.slice(cut).trimStart(); first = false;
        }
      }
      const lines = rows.slice(0, maxLines);
      consoleEl.push(
        <g key="console" className="term">
          <rect x={box.x0} y={box.y0} width={bw} height={bh} rx={9} className="t-bg" />
          <rect x={box.x0} y={box.y0} width={bw} height={20} rx={9} className="t-bar" />
          <rect x={box.x0} y={box.y0 + 12} width={bw} height={8} className="t-bar" />
          {[0, 1, 2].map((k) => <circle key={k} cx={box.x0 + 14 + k * 13} cy={box.y0 + 10} r={4} className={`t-dot d${k}`} />)}
          <text x={box.x0 + 56} y={box.y0 + 14} className="t-title">ECO PUMP AFRIK — console {live ? '(temps réel)' : '(analyse)'}</text>
          {lines.map((l, n) => <text key={n} x={box.x0 + 12} y={box.y0 + 38 + n * lh} className={`t-line ${color[l.tag]}`} xmlSpace="preserve">{l.txt}</text>)}
          <text x={box.x0 + 12} y={box.y0 + 38 + lines.length * lh} className="t-line t-cmd">ecopump&gt; <tspan className="t-cursor">█</tspan></text>
        </g>,
      );
    }
  }

  // Cotes
  const refEndY = ref[ref.length - 1][1];
  dims.push(<Dim key="dref" x={ax - 22} y1={forage ? G : pumpXY[1]} y2={refEndY} label={forage ? `${fm(i.geo.hRef)} au-dessus du sol` : `Refoulement ${fm(i.geo.hRef)}`} side={-1} />);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} style={{ minWidth: W * 0.68 }} className={`realview${live?.faults?.includes('ensablement') ? ' sandy' : ''}`} role="img" aria-label={`Vue réaliste de l'installation : ${APPS[i.app].label}`}>
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
