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
  count?: number; // pompes installées en parallèle
  standby?: number; // dont pompes de secours
  alternate?: boolean; // permutation automatique
  pts?: import('./pumpcurve').PPt[]; // courbe constructeur (une pompe, vitesse nominale)
  usePts?: boolean; // utiliser la courbe constructeur plutôt que le modèle à un point
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

export interface AccState { on: boolean; dn: number; qty: number; opt?: string; vol?: number; pn?: number; pOn?: number; pOff?: number; pre?: number }

export type SupplyId = 'mono' | 'tri' | 'groupe' | 'solaire';
export type StartId = 'direct' | 'etoile' | 'progressif' | 'variateur';

export interface Solar {
  psh: number; // ensoleillement (kWh/m²/jour = heures équivalentes plein soleil)
  panelWc: number; vmp: number; voc: number; imp: number;
  vdcMax: number; // tension DC maxi du contrôleur
  vmpptMin: number; // tension mini de la plage MPPT
  dailyM3: number; // besoin journalier (m³/j)
  panels: number; // panneaux installés (0 = dimensionnement automatique)
  dcLen: number; dcSec: number; // câble champ PV → contrôleur
  lat?: number; lon?: number; place?: string;
  ghi?: number[]; // ensoleillement moyen par mois (kWh/m²/j), 12 valeurs
  temp?: number[]; // température moyenne par mois (°C)
  months?: boolean[]; // mois d'utilisation
  source?: string;
}

export interface Elec {
  supply: SupplyId;
  voltage: number; // tension moteur (V)
  start: StartId;
  cosphi: number;
  cableLen: number; // coffret → moteur (m)
  cableSec: number; // mm²
  cableMat: 'cu' | 'al';
  genKva: number; // groupe électrogène installé (kVA)
  feedLen?: number; // câble d'alimentation du coffret : compteur / TGBT → coffret (m)
  solar: Solar;
}

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
  elec: Elec;
  commissioning?: import('./commissioning').Commissioning;
  quote?: import('./quote').QuoteMeta;
  touched?: string[]; // champs saisis par l'utilisateur (les autres sont des valeurs par défaut)
  backup?: { on: boolean; volume: number; height: number; autonomyH: number; mode?: 'serie' | 'secours'; float?: 'differentiel' | 'modulant'; low?: number }; // réservoir surélevé (forage) : en série (château d'eau) ou en secours by-pass
}

export type Need = 'required' | 'recommended' | 'optional' | 'avoid' | 'na';
export type Sev = 'critical' | 'warning' | 'info';
export type Category = 'hydraulique' | 'aspiration' | 'materiaux' | 'accessoires' | 'securite' | 'energie' | 'electricite';

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
