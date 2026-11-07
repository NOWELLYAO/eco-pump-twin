/** Caractéristiques constructeur d'une pompe (au point de meilleur rendement, BEP). */
export interface PumpSpec {
  qn: number; // débit nominal au BEP (m³/h)
  hn: number; // hauteur nominale au BEP (m)
  etaBep: number; // rendement hydraulique au BEP (0–1)
  nn: number; // vitesse nominale (tr/min)
  motorKw: number; // puissance moteur plaquée (kW)
  etaMotor: number; // rendement moteur (0–1)
  npshrBep: number; // NPSH requis au BEP (m)
  shutoffRatio: number; // H à débit nul / H nominale (typ. 1,15–1,35)
}

/** Installation (réseau hydraulique) dans laquelle tourne la pompe. */
export interface SystemSpec {
  hStatic: number; // hauteur géométrique (m)
  npsha: number; // NPSH disponible de référence (m)
}

export type FaultKey = 'wear' | 'cavitation' | 'bearing' | 'clogging';

/** Commandes du simulateur (remplacées par les capteurs en conditions réelles). */
export interface SimControls {
  running: boolean;
  speedPct: number; // vitesse variateur (% de nn)
  valvePct: number; // ouverture vanne de refoulement (%)
  faults: Record<FaultKey, number>; // sévérité 0–100
  autoAging: boolean; // l'usure progresse toute seule
}

export interface PumpConfig {
  id: string;
  name: string;
  site: string;
  model: string;
  spec: PumpSpec;
  system: SystemSpec;
  controls: SimControls;
  source: 'sim' | 'csv';
}

/** Ce que mesurent les capteurs. */
export interface Measurement {
  t: number; // heure simulée (h)
  label?: string; // horodatage lisible (import CSV)
  q: number; // débit (m³/h)
  pAsp: number; // pression aspiration relative (bar)
  pRef: number; // pression refoulement relative (bar)
  n: number; // vitesse (tr/min)
  pElec: number; // puissance électrique absorbée (kW)
  vib: number; // vibration (mm/s RMS)
  temp: number; // température palier (°C)
}

/** Ce que le jumeau calcule à partir des mesures. */
export interface Analysis {
  m: Measurement;
  h: number; // hauteur mesurée (m)
  hExp: number; // hauteur attendue d'une pompe saine (m)
  devH: number; // écart hauteur (%)
  eta: number; // rendement mesuré (%)
  etaExp: number; // rendement attendu (%)
  pExp: number; // puissance attendue (kW)
  devP: number; // écart puissance (%)
  x: number; // Q / Q_BEP à la vitesse actuelle
  npsha: number;
  npshr: number;
  margin: number; // marge NPSH (m)
  se: number; // énergie spécifique (kWh/m³)
}

export type Level = 'ok' | 'info' | 'warning' | 'critical';

export interface Diagnostic {
  id: string;
  level: Level;
  title: string;
  cause: string;
  evidence: string[];
  action: string;
}

export interface Settings {
  currency: string;
  pricePerKwh: number;
  hoursPerDay: number;
}
