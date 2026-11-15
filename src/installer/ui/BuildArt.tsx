/** Illustrations « réalistes » du chantier : sources, pompes, destinations, énergie et accessoires montés sur
 *  un bout de tuyau. Mêmes couleurs que la vue réelle (classes r-* et g-*). */
import type { ReactNode } from 'react';
import { ACC, PUMP_TYPES } from '../catalog';
import type { PumpTypeId, SupplyId } from '../types';
import type { DestId, SrcId } from '../build';
import { RealGlyph } from './Glyphs';
import { RealDefs } from './RealDefs';

const Art = ({ children, w = 120, h = 80, cls }: { children: ReactNode; w?: number; h?: number; cls?: string }) => (
  <svg viewBox={`0 0 ${w} ${h}`} className={`bd-art${cls ? ` ${cls}` : ''}`} aria-hidden><RealDefs />{children}</svg>
);
const Ground = ({ y = 58 }: { y?: number }) => <rect x="0" y={y} width="120" height={80 - y} className="r-soil" />;

export function SrcArt({ id }: { id: SrcId }) {
  switch (id) {
    case 'bache_charge': return (<Art><Ground y={66} /><rect x="14" y="10" width="60" height="50" rx="4" className="r-tank" /><path d="M14 27 H74 M14 43 H74 M34 10 V60 M54 10 V60" className="r-weld" /><rect x="17" y="22" width="54" height="35" rx="2" className="r-water" /><rect x="11" y="7" width="66" height="5" rx="1" className="r-lid" /><path d="M74 52 H96 V62" className="r-pipe" stroke="#7b8791" strokeWidth="5" /><rect x="90" y="56" width="16" height="10" rx="2" className="r-pumpbody" /><rect x="10" y="60" width="68" height="6" className="r-plinth" /></Art>);
    case 'bache_asp': return (<Art><Ground y={30} /><rect x="8" y="34" width="62" height="40" className="r-pitin" /><rect x="8" y="50" width="62" height="24" className="r-water" /><path d="M48 66 V22 H92" className="r-pipe" stroke="#7b8791" strokeWidth="5" /><rect x="86" y="14" width="22" height="14" rx="3" className="r-pumpbody" /><rect x="96" y="12" width="16" height="10" rx="2" className="r-motor" /></Art>);
    case 'forage': return (<Art><rect x="0" y="0" width="120" height="16" className="r-sky" /><rect x="0" y="16" width="120" height="5" className="r-l-top" /><rect x="0" y="21" width="120" height="14" className="r-l-lat" /><rect x="0" y="35" width="120" height="8" className="r-l-clay" /><rect x="0" y="43" width="120" height="28" className="r-l-aq" /><rect x="0" y="43" width="120" height="37" className="r-l-wet" /><rect x="0" y="71" width="120" height="9" className="r-l-rock" /><rect x="50" y="16" width="20" height="64" className="r-bore" /><path d="M50 16 V80 M70 16 V80" className="r-casing" /><rect x="52" y="42" width="16" height="38" className="r-water" /><rect x="55" y="54" width="10" height="20" rx="2" className="r-stainless" /><rect x="44" y="10" width="32" height="7" rx="1" className="r-concrete" /><path d="M60 16 V54" className="r-riser" /></Art>);
    case 'fosse': return (<Art><Ground y={18} /><rect x="20" y="20" width="80" height="56" className="r-concrete" /><rect x="25" y="24" width="70" height="50" className="r-pitin" /><rect x="25" y="44" width="70" height="30" className="r-dirty" /><rect x="50" y="52" width="18" height="20" rx="3" className="r-motor" /><rect x="47" y="64" width="24" height="10" rx="3" className="r-pumpbody" /><path d="M86 74 V24" className="r-rails" /><rect x="16" y="15" width="88" height="5" className="r-plinth" /></Art>);
    case 'riviere': return (<Art><rect x="0" y="0" width="120" height="40" className="r-sky" /><path d="M0 40 Q30 36 60 42 T120 40 V80 H0 Z" className="r-water" /><path d="M0 46 Q20 43 40 47 M50 55 Q70 51 90 56" className="g-mesh light" /><path d="M78 30 L120 30 V80 H96 Z" className="r-soil" /><path d="M60 60 V26 H98" className="r-pipe" stroke="#7b8791" strokeWidth="5" /><rect x="94" y="18" width="22" height="12" rx="3" className="r-pumpbody" /></Art>);
    case 'cuve_carb': return (<Art><Ground y={62} /><ellipse cx="20" cy="40" rx="8" ry="20" className="r-tank" /><rect x="20" y="20" width="70" height="40" className="r-tank-h" /><ellipse cx="90" cy="40" rx="8" ry="20" className="r-tank" /><path d="M43 20 V60 M67 20 V60" className="r-weld" /><rect x="22" y="38" width="68" height="20" className="r-oil" /><path d="M30 60 L26 70 M80 60 L84 70" className="r-legs" /><circle cx="55" cy="18" r="5" className="g-atex" /><text x="55" y="21" textAnchor="middle" className="g-txt dark" fontSize="7">!</text></Art>);
    case 'bassin': return (<Art><rect x="0" y="0" width="120" height="34" className="r-sky" /><rect x="0" y="34" width="120" height="46" className="r-soil" /><rect x="8" y="36" width="86" height="30" rx="2" className="r-concrete" /><rect x="11" y="39" width="80" height="24" className="r-water" /><path d="M14 46 Q30 43 46 47 T78 46" className="g-mesh light" /><rect x="98" y="44" width="16" height="12" rx="2" className="r-pumpbody" /><rect x="96" y="30" width="20" height="13" rx="3" className="g-glass" /></Art>);
  }
}

export function PumpArt({ pt }: { pt: PumpTypeId }) {
  const base = <rect x="10" y="66" width="100" height="6" rx="1" className="r-plinth" />;
  switch (pt) {
    case 'surface': return (<Art>{base}<rect x="14" y="34" width="46" height="30" rx="5" className="r-motor" />{[0, 1, 2, 3, 4].map((k) => <rect key={k} x={18 + k * 8} y="34" width="3" height="30" className="r-fin" />)}<rect x="60" y="42" width="10" height="16" className="r-lantern" /><circle cx="86" cy="50" r="17" className="r-pumpbody" /><circle cx="86" cy="50" r="6" className="r-hub" /><rect x="80" y="22" width="12" height="12" className="r-pumpbody" /><rect x="103" y="44" width="12" height="12" className="r-pumpbody" /></Art>);
    case 'auto_amorcante': return (<Art>{base}<rect x="12" y="36" width="44" height="28" rx="5" className="r-motor" />{[0, 1, 2, 3].map((k) => <rect key={k} x={16 + k * 9} y="36" width="3" height="28" className="r-fin" />)}<rect x="56" y="30" width="44" height="36" rx="8" className="r-pumpbody" /><rect x="64" y="22" width="12" height="10" className="r-pumpbody" /><rect x="86" y="18" width="12" height="14" className="r-pumpbody" /><circle cx="78" cy="48" r="7" className="r-hub" /></Art>);
    case 'multi_h': return (<Art>{base}<rect x="8" y="38" width="36" height="26" rx="5" className="r-motor" /><rect x="44" y="44" width="8" height="14" className="r-lantern" />{[0, 1, 2, 3, 4, 5].map((k) => <rect key={k} x={52 + k * 9} y="40" width="9" height="22" className="r-stack" />)}<rect x="104" y="44" width="10" height="14" className="r-stainless" /><rect x="96" y="28" width="10" height="12" className="r-stainless" /></Art>);
    case 'multi_v': return (<Art w={120} h={80}><rect x="34" y="70" width="52" height="6" rx="1" className="r-plinth" /><rect x="44" y="4" width="32" height="26" rx="5" className="r-motor" />{[0, 1, 2].map((k) => <rect key={k} x={47 + k * 10} y="4" width="3" height="26" className="r-fin" />)}<rect x="50" y="30" width="20" height="6" className="r-lantern" />{[0, 1, 2, 3].map((k) => <rect key={k} x="48" y={36 + k * 7} width="24" height="7" className="r-stack" />)}<rect x="40" y="64" width="40" height="7" rx="1" className="r-stainless" /><rect x="22" y="60" width="18" height="10" className="r-stainless" /><rect x="80" y="60" width="18" height="10" className="r-stainless" /></Art>);
    case 'immergee_forage': return (<Art><rect x="48" y="2" width="24" height="76" rx="3" className="r-bore" /><rect x="52" y="4" width="16" height="30" className="r-stainless" />{[0, 1, 2, 3].map((k) => <path key={k} d={`M52 ${10 + k * 7} H68`} className="r-seam" />)}<rect x="52" y="34" width="16" height="8" className="g-mesh" /><rect x="51" y="42" width="18" height="32" rx="3" className="r-motor" /><path d="M64 4 V40" className="g-cable" /></Art>);
    case 'submersible_relevage': return (<Art><rect x="38" y="10" width="34" height="38" rx="6" className="r-motor" />{[0, 1, 2].map((k) => <rect key={k} x={42 + k * 10} y="12" width="3" height="34" className="r-fin" />)}<rect x="32" y="48" width="46" height="18" rx="6" className="r-pumpbody" /><rect x="78" y="50" width="22" height="12" className="r-pumpbody" /><path d="M54 10 C 54 0, 80 0, 90 4" className="g-cable" /><rect x="30" y="66" width="50" height="5" rx="1" className="r-plinth" /></Art>);
    case 'drainage_immergee': return (<Art><rect x="40" y="8" width="38" height="44" rx="10" className="r-pumpbody" /><rect x="44" y="14" width="30" height="8" className="g-band" /><rect x="52" y="0" width="14" height="10" rx="2" className="r-stainless" /><rect x="40" y="52" width="38" height="14" rx="4" className="g-mesh" /><path d="M66 4 C 80 0, 96 4, 104 12" className="g-cable" /><rect x="34" y="66" width="50" height="5" rx="1" className="r-plinth" /></Art>);
  }
}

export function DestArt({ id }: { id: DestId }) {
  switch (id) {
    case 'chateau': return (<Art><rect x="0" y="0" width="120" height="70" className="r-sky" /><Ground y={70} /><path d="M44 70 L50 34 M76 70 L70 34 M47 52 H73" className="r-legs" /><rect x="36" y="8" width="48" height="28" rx="6" className="r-tank" /><rect x="39" y="18" width="42" height="15" className="r-water" /><path d="M36 10 Q60 0 84 10" className="r-tank" /></Art>);
    case 'batiment': return (<Art><rect x="0" y="0" width="120" height="74" className="r-sky" /><Ground y={74} /><rect x="30" y="6" width="60" height="68" className="r-building" />{[0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={37 + c * 17} y={12 + r * 15} width="11" height="9" className="r-window" />))}<rect x="54" y="62" width="12" height="12" className="r-plinth" /></Art>);
    case 'irrigation': return (<Art><rect x="0" y="0" width="120" height="56" className="r-sky" /><Ground y={56} />{[10, 30, 50, 70, 90, 110].map((x) => <path key={x} d={`M${x} 64 q -4 -10 0 -14 q 4 4 0 14`} className="r-crop" />)}<path d="M60 56 V30" className="r-riser" /><circle cx="60" cy="28" r="3" className="g-metal" /><path d="M60 28 Q 30 10 8 40 M60 28 Q 90 10 112 40" className="r-spray" /></Art>);
    case 'incendie': return (<Art><rect x="0" y="0" width="120" height="80" className="r-sky" /><rect x="22" y="8" width="76" height="62" rx="4" className="r-ria" /><circle cx="60" cy="38" r="20" className="g-red" /><circle cx="60" cy="38" r="12" className="g-dark" /><circle cx="60" cy="38" r="4" className="g-red" /><rect x="26" y="12" width="68" height="8" rx="2" className="g-box" /><text x="60" y="19" textAnchor="middle" className="g-txt dark" fontSize="7">RIA</text></Art>);
    case 'egout': return (<Art><rect x="0" y="0" width="120" height="30" className="r-sky" /><Ground y={30} /><rect x="44" y="30" width="32" height="46" className="r-concrete" /><rect x="48" y="30" width="24" height="46" className="r-pitin" /><rect x="48" y="62" width="24" height="14" className="r-dirty" /><rect x="40" y="26" width="40" height="5" rx="1" className="g-dark" /><path d="M0 44 H48" className="r-pipe" stroke="#7b8791" strokeWidth="6" /><path d="M72 66 H120" className="r-pipe" stroke="#7b8791" strokeWidth="6" /></Art>);
    case 'cuve': return (<Art><Ground y={64} /><rect x="22" y="14" width="76" height="48" rx="6" className="r-tank" /><path d="M47 14 V62 M73 14 V62" className="r-weld" /><rect x="25" y="34" width="70" height="25" className="r-oil" /><rect x="54" y="6" width="12" height="9" className="g-metal" /><path d="M28 62 V68 M92 62 V68" className="r-legs" /></Art>);
    case 'piscine': return (<Art><rect x="0" y="0" width="120" height="40" className="r-sky" /><rect x="0" y="40" width="120" height="40" className="r-soil" /><rect x="10" y="42" width="100" height="28" rx="2" className="r-concrete" /><rect x="13" y="45" width="94" height="22" className="r-water" /><path d="M18 52 Q34 49 50 53 T82 52 T104 53" className="g-mesh light" /><path d="M96 36 V46 M104 36 V46 M96 38 H104 M96 42 H104" className="g-cable" /></Art>);
  }
}

export function EnergyArt({ id }: { id: SupplyId }) {
  switch (id) {
    case 'mono': case 'tri': return (<Art><rect x="0" y="0" width="120" height="74" className="r-sky" /><Ground y={74} /><path d="M58 74 V6" stroke="#6b5a45" strokeWidth="6" /><path d="M34 14 H82" stroke="#6b5a45" strokeWidth="4" />{(id === 'tri' ? [36, 50, 66, 80] : [40, 76]).map((x) => <g key={x}><circle cx={x} cy="11" r="3" className="g-metal" /><path d={`M${x} 11 L ${x - 30} 2`} className="g-cable" /></g>)}<rect x="62" y="40" width="20" height="26" rx="2" className="g-box" /><text x="72" y="56" textAnchor="middle" className="g-txt dark" fontSize="8">{id === 'tri' ? '400' : '230'}</text></Art>);
    case 'groupe': return (<Art><Ground y={70} /><rect x="12" y="24" width="96" height="42" rx="4" fill="#f0b429" stroke="#8a5a00" strokeWidth="2" /><rect x="18" y="30" width="38" height="28" rx="2" className="g-dark" />{[0, 1, 2, 3, 4].map((k) => <path key={k} d={`M20 ${34 + k * 5} H54`} stroke="#6b7782" strokeWidth="2" />)}<rect x="64" y="32" width="22" height="14" rx="2" className="g-screen" /><rect x="92" y="10" width="7" height="16" className="g-dark" /><rect x="10" y="66" width="100" height="5" className="g-dark" /></Art>);
    case 'solaire': return (<Art><rect x="0" y="0" width="120" height="70" className="r-sky" /><Ground y={70} /><circle cx="104" cy="12" r="8" fill="#fab219" /><path d="M14 54 L34 18 H104 L84 54 Z" fill="#1f3f63" stroke="#c9d1d8" strokeWidth="2" />{[1, 2, 3].map((k) => <path key={`v${k}`} d={`M${14 + k * 17.5 + 0} 54 L${34 + k * 17.5} 18`} stroke="#c9d1d8" strokeWidth="1" />)}<path d="M24 36 H94" stroke="#c9d1d8" strokeWidth="1" /><path d="M40 54 V70 M80 54 V70" className="r-legs" /></Art>);
  }
}

/** Accessoire monté sur un bout de conduite (ou posé, pour ceux qui ne sont pas sur la conduite). */
export function AccArt({ id }: { id: string }) {
  const a = ACC[id];
  if (!a) return null;
  return (
    <svg viewBox="-46 -52 92 74" className="bd-art acc" aria-hidden><RealDefs />
      {a.inline || ['manometre', 'vacuometre', 'capteur_p', 'pressostat', 'anti_belier', 'ventouse', 'soupape', 'vidange', 'vessie'].includes(id) ? <><rect x="-46" y="-7" width="92" height="14" className="g-metal" /><rect x="-46" y="-7" width="92" height="4" className="g-band" /></> : null}
      <RealGlyph kind={a.glyph} />
    </svg>
  );
}
export const pumpShort = (pt: PumpTypeId) => PUMP_TYPES[pt].label.replace(/ \(.*\)$/, '');
