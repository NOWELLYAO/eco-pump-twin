import type { Glyph } from '../catalog';

/** Accessoires dessinés « réalistes », centrés sur (0,0), orientés le long de +x. */
export function RealGlyph({ kind }: { kind: Glyph }) {
  switch (kind) {
    case 'gate':
      return (<g><path d="M-14 -11 L0 0 L-14 11 Z M14 -11 L0 0 L14 11 Z" className="g-metal" /><rect x="-2" y="-26" width="4" height="16" className="g-dark" /><ellipse cx="0" cy="-27" rx="11" ry="3.5" className="g-red" /></g>);
    case 'check':
      return (<g><rect x="-15" y="-11" width="30" height="22" rx="5" className="g-metal" /><path d="M-6 -5 L6 0 L-6 5 Z" className="g-arrow" /><rect x="-17" y="-13" width="4" height="26" rx="1" className="g-dark" /><rect x="13" y="-13" width="4" height="26" rx="1" className="g-dark" /></g>);
    case 'ball':
      return (<g><rect x="-15" y="-10" width="30" height="20" rx="4" className="g-metal" /><circle cx="2" cy="-5" r="9" className="g-metal" /><circle cx="2" cy="-5" r="4" className="g-dark" /></g>);
    case 'foot':
      return (<g><rect x="-11" y="-18" width="22" height="30" rx="3" className="g-metal" /><path d="M-11 -8 H11 M-11 -1 H11 M-11 6 H11 M-5 -18 V12 M2 -18 V12" className="g-mesh" /><rect x="-13" y="-22" width="26" height="6" rx="2" className="g-dark" /></g>);
    case 'strainer':
      return (<g><rect x="-11" y="-14" width="22" height="26" rx="3" className="g-metal" /><path d="M-11 -6 H11 M-11 1 H11 M-11 8 H11 M-4 -14 V12 M4 -14 V12" className="g-mesh" /></g>);
    case 'ystrainer':
      return (<g><rect x="-15" y="-9" width="30" height="18" rx="4" className="g-metal" /><path d="M-2 4 L10 22 L16 18 L5 2 Z" className="g-metal" /><circle cx="13" cy="20" r="3" className="g-dark" /></g>);
    case 'basket':
      return (<g><rect x="-16" y="-14" width="32" height="28" rx="5" className="g-blue" /><rect x="-13" y="-22" width="26" height="9" rx="3" className="g-glass" /><path d="M-9 -5 H9 M-9 1 H9 M-9 7 H9" className="g-mesh light" /></g>);
    case 'eccentric':
      return (<path d="M-13 -11 L13 -11 L13 7 L-13 11 Z" className="g-metal" />);
    case 'concentric':
      return (<path d="M-13 -7 L13 -11 L13 11 L-13 7 Z" className="g-metal" />);
    case 'flex':
      return (<g><rect x="-13" y="-11" width="26" height="22" rx="4" className="g-rubber" /><path d="M-6 -11 V11 M0 -11 V11 M6 -11 V11" className="g-mesh light" /><rect x="-16" y="-13" width="4" height="26" className="g-dark" /><rect x="12" y="-13" width="4" height="26" className="g-dark" /></g>);
    case 'gauge':
      return (<g><rect x="-2" y="-22" width="4" height="16" className="g-dark" /><circle cx="0" cy="-32" r="11" className="g-dial" /><path d="M0 -32 L6 -38" className="g-needle" /><circle cx="0" cy="-32" r="1.6" className="g-needle-c" /></g>);
    case 'flowmeter':
      return (<g><rect x="-17" y="-12" width="34" height="24" rx="3" className="g-blue" /><rect x="-9" y="-30" width="18" height="18" rx="3" className="g-box" /><rect x="-6" y="-26" width="12" height="7" rx="1" className="g-screen" /></g>);
    case 'ptx':
      return (<g><rect x="-2" y="-20" width="4" height="12" className="g-dark" /><rect x="-6" y="-38" width="12" height="18" rx="3" className="g-metal" /><path d="M6 -32 q10 0 12 -8" className="g-cable" /></g>);
    case 'pswitch':
      return (<g><rect x="-2" y="-20" width="4" height="12" className="g-dark" /><rect x="-9" y="-36" width="18" height="16" rx="2" className="g-box" /><circle cx="0" cy="-28" r="3" className="g-red" /></g>);
    case 'vessel':
      return (<g><rect x="-2" y="8" width="4" height="14" className="g-dark" /><rect x="-15" y="22" width="30" height="50" rx="14" className="g-blue" /><rect x="-15" y="40" width="30" height="5" className="g-band" /></g>);
    case 'surge':
      return (<g><rect x="-2" y="-24" width="4" height="14" className="g-dark" /><rect x="-13" y="-70" width="26" height="46" rx="12" className="g-surge" /><text x="0" y="-44" textAnchor="middle" className="g-txt">AB</text></g>);
    case 'airvalve':
      return (<g><rect x="-2" y="-20" width="4" height="10" className="g-dark" /><path d="M-9 -20 Q-9 -36 0 -36 Q9 -36 9 -20 Z" className="g-metal" /><circle cx="0" cy="-37" r="2" className="g-dark" /></g>);
    case 'relief':
      return (<g><rect x="-2" y="-20" width="4" height="8" className="g-dark" /><path d="M-8 -20 L8 -20 L4 -38 L-4 -38 Z" className="g-brass" /><path d="M-3 -24 l6 -3 l-6 -3 l6 -3 l-6 -3" className="g-mesh" /></g>);
    case 'drain':
      return (<g><rect x="-2" y="8" width="4" height="10" className="g-dark" /><rect x="-6" y="18" width="12" height="7" rx="2" className="g-brass" /><rect x="-12" y="15" width="10" height="3" className="g-red" /></g>);
    case 'panel':
      return (<g><rect x="-22" y="-30" width="44" height="58" rx="4" className="g-box" /><rect x="-16" y="-22" width="20" height="10" rx="1" className="g-screen" /><circle cx="12" cy="-17" r="3.5" className="g-green" /><circle cx="12" cy="-6" r="3.5" className="g-red" /><path d="M-16 4 H16 M-16 11 H16 M-16 18 H6" className="g-mesh" /></g>);
    case 'vfd':
      return (<g><rect x="-17" y="-26" width="34" height="50" rx="4" className="g-vfd" /><rect x="-11" y="-19" width="22" height="12" rx="2" className="g-screen" /><text x="0" y="12" textAnchor="middle" className="g-txt light">Hz</text></g>);
    case 'float':
      return (<g><path d="M0 -30 V-8" className="g-cable" /><ellipse cx="0" cy="0" rx="7" ry="10" className="g-float" /></g>);
    case 'probe':
    case 'electrode':
      return (<g><path d="M0 -30 V0" className="g-cable" /><rect x="-3" y="0" width="6" height="18" rx="2" className="g-metal" /></g>);
    case 'atex':
      return (<g><path d="M0 -12 L11 -6 L11 6 L0 12 L-11 6 L-11 -6 Z" className="g-atex" /><text x="0" y="4" textAnchor="middle" className="g-txt dark">Ex</text></g>);
    default:
      return <circle r="6" className="g-metal" />;
  }
}

/** Symboles P&ID (norme ISA simplifiée), traits seuls, centrés sur (0,0). */
export function PidGlyph({ kind }: { kind: Glyph }) {
  switch (kind) {
    case 'gate': return <path d="M-12 -8 L12 8 L12 -8 L-12 8 Z" className="p-sym" />;
    case 'check': return (<g><path d="M-12 -8 L12 8 L12 -8 L-12 8 Z" className="p-sym" /><path d="M0 0 L-12 8 L-12 -8 Z" className="p-fill" /></g>);
    case 'ball': return (<g><path d="M-12 -8 L12 8 L12 -8 L-12 8 Z" className="p-sym" /><circle r="4.5" className="p-fill" /></g>);
    case 'foot': return (<g><path d="M-10 -8 L10 8 L10 -8 L-10 8 Z" className="p-sym" /><path d="M-14 12 H14 M-14 16 H14" className="p-line" /></g>);
    case 'strainer': return (<g><rect x="-10" y="-8" width="20" height="16" className="p-sym" /><path d="M-10 -8 L10 8" className="p-line" /></g>);
    case 'ystrainer': return (<g><path d="M-12 0 H12 M0 0 L8 12" className="p-line" /><path d="M5 9 L11 15" className="p-line thick" /></g>);
    case 'basket': return (<g><rect x="-10" y="-10" width="20" height="20" className="p-sym" /><path d="M-10 10 L10 -10 M-10 0 L0 -10 M0 10 L10 0" className="p-line" /></g>);
    case 'eccentric': return <path d="M-9 -9 H9 V5 L-9 9 Z" className="p-sym" />;
    case 'concentric': return <path d="M-9 -6 L9 -9 V9 L-9 6 Z" className="p-sym" />;
    case 'flex': return <path d="M-10 -7 q3 7 0 14 M-3 -7 q3 7 0 14 M4 -7 q3 7 0 14 M11 -7 q3 7 0 14" className="p-line" />;
    case 'flowmeter': return (<g><rect x="-11" y="-7" width="22" height="14" className="p-sym" /><path d="M-11 7 L11 -7" className="p-line" /></g>);
    case 'vessel': return <rect x="-9" y="10" width="18" height="30" rx="9" className="p-sym" />;
    case 'surge': return <rect x="-9" y="-40" width="18" height="30" rx="9" className="p-sym" />;
    case 'airvalve': return (<g><path d="M0 -8 V-16" className="p-line" /><path d="M-7 -16 H7 L0 -26 Z" className="p-sym" /></g>);
    case 'relief': return (<g><path d="M0 -8 V-14" className="p-line" /><path d="M-8 -14 L8 -30 L8 -14 L-8 -30 Z" className="p-sym" /><path d="M8 -22 H18" className="p-line" /></g>);
    case 'drain': return (<g><path d="M0 8 V14" className="p-line" /><path d="M-6 14 L6 26 L6 14 L-6 26 Z" className="p-sym" /></g>);
    default: return <circle r="8" className="p-sym" />;
  }
}
