/** Matières des dessins « réalistes » (dégradés et textures). À placer dans chaque <svg> qui les utilise :
 *  les classes CSS (r-soil, r-tank…) y font référence par leur id, et l'export PDF photographie chaque
 *  dessin séparément (les définitions doivent donc être dans le même <svg>). */
export function RealDefs() {
  const dots = (pts: [number, number, number, string][]) => pts.map(([x, y, r, c], k) => <circle key={k} cx={x} cy={y} r={r} fill={c} />);
  return (
    <defs>
      {/* Terre : fond sableux, grains et petits cailloux */}
      <pattern id="ep-soil" width="46" height="46" patternUnits="userSpaceOnUse">
        <rect width="46" height="46" fill="#d6c19c" />
        {dots([[5, 7, 1.2, '#c4ab82'], [17, 3, .9, '#e6d6b8'], [29, 11, 1.6, '#b89f78'], [40, 5, .8, '#c4ab82'], [9, 22, .9, '#e6d6b8'], [22, 19, 2.2, '#bda37a'], [35, 26, 1, '#c9b38f'], [44, 37, 1.4, '#b89f78'], [3, 38, 1.8, '#c4ab82'], [16, 33, .8, '#e9dcc2'], [27, 40, 1.1, '#bfa57c'], [36, 16, .7, '#e6d6b8']])}
        <ellipse cx="23" cy="19" rx="3" ry="2" fill="#a88f68" opacity=".6" />
      </pattern>
      <pattern id="ep-soil-d" width="46" height="46" patternUnits="userSpaceOnUse">
        <rect width="46" height="46" fill="#4a3f30" />
        {dots([[5, 7, 1.2, '#5a4c39'], [29, 11, 1.6, '#3b3226'], [22, 19, 2.2, '#56493a'], [44, 37, 1.4, '#3b3226'], [3, 38, 1.8, '#5a4c39'], [27, 40, 1.1, '#3f3529']])}
      </pattern>
      {/* Couches du terrain (forage) */}
      <pattern id="ep-topsoil" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#8a6a46" />{dots([[4, 6, 1.4, '#6f5436'], [18, 4, 1, '#a07d55'], [26, 17, 1.6, '#6f5436'], [10, 22, 1.1, '#a07d55'], [21, 27, .9, '#5f472e']])}<path d="M2 14 q3 -4 5 0 M15 12 q2 -3 4 0" stroke="#5d7d3a" strokeWidth="1" fill="none" /></pattern>
      <pattern id="ep-laterite" width="34" height="34" patternUnits="userSpaceOnUse"><rect width="34" height="34" fill="#c47a4c" />{dots([[5, 6, 2.2, '#a85f36'], [20, 4, 1.4, '#d99466'], [29, 15, 2.6, '#9b532d'], [11, 20, 1.6, '#d99466'], [24, 28, 2, '#a85f36'], [4, 29, 1.2, '#b86a3d']])}</pattern>
      <pattern id="ep-clay" width="28" height="12" patternUnits="userSpaceOnUse"><rect width="28" height="12" fill="#b9a585" /><path d="M0 4 H11 M15 4 H28 M5 10 H20" stroke="#9c8a6c" strokeWidth="1.2" /></pattern>
      <pattern id="ep-sand" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#e2cf9e" />{dots([[3, 3, .9, '#c9b27e'], [11, 6, .7, '#b89f6c'], [17, 2, .8, '#c9b27e'], [6, 12, .7, '#b89f6c'], [15, 14, .9, '#c9b27e'], [2, 18, .6, '#b89f6c'], [11, 18, .8, '#c9b27e']])}</pattern>
      <pattern id="ep-aquifer" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="#c9cdb4" />{dots([[3, 3, 1.6, '#a9b39a'], [12, 5, 2.2, '#9aa58c'], [17, 13, 1.8, '#a9b39a'], [6, 14, 2.4, '#8f9b84'], [13, 18, 1.2, '#b7c0a8']])}</pattern>
      <pattern id="ep-rock" width="44" height="26" patternUnits="userSpaceOnUse"><rect width="44" height="26" fill="#8d8f8f" /><path d="M0 0 H44 M0 13 H44 M14 0 V13 M36 0 V13 M6 13 V26 M28 13 V26" stroke="#6f7272" strokeWidth="1.4" />{dots([[8, 6, 1, '#a4a7a7'], [24, 19, 1.2, '#a4a7a7'], [38, 20, .8, '#767979']])}</pattern>
      <pattern id="ep-gravel" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#b9b2a2" />{dots([[3, 3, 2.4, '#d7d0bf'], [9, 4, 2, '#a59e8f'], [5, 9, 2.6, '#cfc8b6'], [11, 10, 1.6, '#988f7e']])}</pattern>
      <pattern id="ep-bore" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#bfae8e" />{dots([[4, 5, 1, '#a99878'], [15, 9, 1.3, '#cbbb9c'], [9, 18, 1.1, '#a99878'], [20, 20, .8, '#cbbb9c']])}</pattern>
      {/* Béton : granulats */}
      <pattern id="ep-concrete" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#a9afb5" />{dots([[4, 5, 1.3, '#959ba1'], [13, 3, .8, '#c0c5ca'], [21, 9, 1.5, '#8f959b'], [8, 15, .9, '#c0c5ca'], [18, 20, 1.2, '#979da3'], [3, 22, .7, '#bcc1c6']])}</pattern>
      <pattern id="ep-pitin" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="#b3a083" />{dots([[5, 6, 1.1, '#9f8d70'], [19, 11, 1.4, '#c4b296'], [10, 23, 1, '#9f8d70'], [25, 25, .9, '#c4b296']])}</pattern>
      {/* Eaux */}
      <linearGradient id="ep-water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7cc6ea" /><stop offset=".25" stopColor="#4fa6d8" /><stop offset=".7" stopColor="#2b7fb8" /><stop offset="1" stopColor="#1a5f93" /></linearGradient>
      {/* Liquide vu en coupe : bords plus sombres (volume du cylindre), rais de lumière, bande claire sous la surface */}
      <linearGradient id="ep-liq-shade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#06304f" stopOpacity=".35" /><stop offset=".14" stopColor="#06304f" stopOpacity="0" /><stop offset=".8" stopColor="#06304f" stopOpacity="0" /><stop offset="1" stopColor="#06304f" stopOpacity=".4" /></linearGradient>
      <pattern id="ep-liq-light" width="140" height="160" patternUnits="userSpaceOnUse">
        <path d="M18 0 L40 0 L8 160 L-14 160 Z M78 0 L88 0 L58 160 L48 160 Z M118 0 L134 0 L104 160 L88 160 Z" fill="#ffffff" opacity=".09" />
        <path d="M30 22 q8 -3 16 0 M86 48 q6 -2 12 0 M40 90 q9 -3 18 0 M104 120 q7 -2 14 0 M14 140 q6 -2 12 0" stroke="#d9f2ff" strokeWidth="1.2" fill="none" opacity=".35" />
      </pattern>
      <linearGradient id="ep-surf-band" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity=".55" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></linearGradient>
      <linearGradient id="ep-dirty" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#a7a473" /><stop offset="1" stopColor="#6b6842" /></linearGradient>
      <linearGradient id="ep-oil" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6c46e" /><stop offset="1" stopColor="#a87d22" /></linearGradient>
      {/* Métaux, cuves (cylindres éclairés de la gauche) */}
      <linearGradient id="ep-tank" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#aeb9c3" /><stop offset=".3" stopColor="#f3f6f8" /><stop offset=".62" stopColor="#d9e0e6" /><stop offset="1" stopColor="#8e9aa5" /></linearGradient>
      <linearGradient id="ep-tank-h" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#aeb9c3" /><stop offset=".28" stopColor="#f3f6f8" /><stop offset=".65" stopColor="#d4dbe2" /><stop offset="1" stopColor="#8a96a1" /></linearGradient>
      <linearGradient id="ep-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8a96a1" /><stop offset=".35" stopColor="#eef2f5" /><stop offset=".7" stopColor="#b9c3cc" /><stop offset="1" stopColor="#7a8692" /></linearGradient>
      <linearGradient id="ep-motor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d8a96" /><stop offset=".35" stopColor="#5d6b78" /><stop offset="1" stopColor="#36414b" /></linearGradient>
      <linearGradient id="ep-pump" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#4fb3e6" /><stop offset=".5" stopColor="#1689c6" /><stop offset="1" stopColor="#0c5f8f" /></linearGradient>
      <linearGradient id="ep-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe7f7" /><stop offset="1" stopColor="#f2f8fc" /></linearGradient>
      <linearGradient id="ep-sky-d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0f1a23" /><stop offset="1" stopColor="#1b2a36" /></linearGradient>
      {/* Bâtiment : enduit et joints de briques */}
      <pattern id="ep-wall" width="24" height="12" patternUnits="userSpaceOnUse"><rect width="24" height="12" fill="#e8dfd0" /><path d="M0 6 H24 M0 12 H24 M12 0 V6 M0 6 V12 M24 6 V12" stroke="#d6cab6" strokeWidth=".8" /></pattern>
    </defs>
  );
}
