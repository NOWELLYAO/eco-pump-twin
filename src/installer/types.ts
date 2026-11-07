export type AppId = 'forage' | 'surpression' | 'irrigation' | 'relevage' | 'drainage' | 'transfert' | 'incendie' | 'carburant' | 'piscine';
export type PumpTypeId = 'surface' | 'auto_amorcante' | 'multi_h' | 'multi_v' | 'immergee_forage' | 'submersible_relevage' | 'drainage_immergee';
export type ModeId = 'aspiration' | 'charge' | 'immergee';
export type FluidId = 'eau_claire' | 'eau_forage' | 'eau_brute' | 'eaux_usees' | 'boues' | 'eau_mer' | 'eau_chaude' | 'gasoil' | 'huile' | 'eau_piscine';
export type PipeMatId = 'pvc' | 'pehd' | 'ppr' | 'galva' | 'acier' | 'inox' | 'fonte' | 'cuivre' | 'flexible';
export type PumpMatId = 'fonte' | 'fonte_bronze' | 'inox304' | 'inox316' | 'bronze' | 'thermoplastique' | 'fonte_chrome';
export type Compat = 'ok' | 'warn' | 'bad';

export interface Fluid {
  type: FluidId;
  temp: number; // °C
  rho: number; // kg/m³
  nu: number; // viscosité cinématique (cSt = mm²/s)
  solidsPct: number; // matières en suspension (% massique)
  particleMm: number; // plus grosse particule (mm)
  sandGm3: number; // teneur en sable (g/m³)
  ph: number;
}

export interface PipeRun {
  material: PipeMatId;
  dn: number; // diamètre intérieur (mm)
  pn: number; // pression nominale (bar)
  length: number; // m
  elbows: number; // coudes 90°
}

export interface InstPump {
  qn: number; hn: number; eta: number; // au BEP
  npshr: number; nn: number; motorKw: number;
  dnAsp: number; dnRef: number; // brides de la pompe (mm)
  passage: number; // passage libre (mm)
  material: PumpMatId;
  tmax: number; // °C
  sandMax: number; // g/m³ admissible
  maxStarts: number; // démarrages / h
  diameterMm: number; // diamètre hors-tout (pompes de forage)
  shutoff: number; // H0 / Hn
}

export interface Geometry {
  suctionLift: number; // hauteur d'aspiration : niveau mini SOUS l'axe pompe (m) — mode aspiration
  chargeHead: number; // niveau mini AU-DESSUS de l'axe pompe (m) — mode en charge
  hRef: number; // point de refoulement au-dessus de l'axe pompe (m) ; au-dessus du sol pour un forage
  straight: number; // longueur droite avant l'entrée pompe (m)
  immersion: number; // hauteur d'eau au-dessus de l'entrée de la conduite (m)
  bottom: number; // distance entrée conduite / fond (m)
  // forage
  staticLevel: number; dynamicLevel: number; pumpDepth: number; boreDepth: number; boreDia: number;
  // bâche / fosse
  tankVolume: number; // volume utile (L)
  wetLevel: number; // hauteur d'eau au-dessus de la pompe immergée (m)
  highPoint: boolean;
  altitude: number;
}

export interface Duty {
  qReq: number; // m³/h
  pRes: number; // pression résiduelle au point d'utilisation (bar)
  hoursPerDay: number;
  pricePerKwh: number;
  currency: string;
}

export interface AccState { on: boolean; dn: number; qty: number; opt?: string; vol?: number }

export interface Installation {
  name: string;
  app: AppId;
  pumpType: PumpTypeId;
  mode: ModeId;
  fluid: Fluid;
  pump: InstPump;
  asp: PipeRun;
  ref: PipeRun;
  geo: Geometry;
  duty: Duty;
  acc: Record<string, AccState>;
}

export type Need = 'required' | 'recommended' | 'optional' | 'avoid' | 'na';
export type Sev = 'critical' | 'warning' | 'info';
export type Category = 'hydraulique' | 'aspiration' | 'materiaux' | 'accessoires' | 'securite' | 'energie';

export interface Fix { label: string; apply: (i: Installation) => Installation }

export interface Issue {
  id: string;
  sev: Sev;
  cat: Category;
  title: string;
  detail: string;
  consequences: string[];
  parts: string[];
  solutions: string[];
  fix?: Fix;
}
