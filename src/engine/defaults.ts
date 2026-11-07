import type { PumpConfig, Settings, SimControls } from './types';

export const healthyControls = (): SimControls => ({
  running: true,
  speedPct: 100,
  valvePct: 100,
  faults: { wear: 0, cavitation: 0, bearing: 0, clogging: 0 },
  autoAging: false,
});

export const DEFAULT_SETTINGS: Settings = { currency: 'FCFA', pricePerKwh: 110, hoursPerDay: 12 };

export const DEFAULT_PUMPS: PumpConfig[] = [
  {
    id: 'p01', name: 'Forage du village', site: 'Adduction d\'eau potable', model: 'ECO 50-200',
    spec: { qn: 30, hn: 45, etaBep: 0.68, nn: 2900, motorKw: 7.5, etaMotor: 0.9, npshrBep: 2.5, shutoffRatio: 1.25 },
    system: { hStatic: 20, npsha: 7 },
    controls: healthyControls(), source: 'sim',
  },
  {
    id: 'p02', name: 'Irrigation rizicole', site: 'Périmètre agricole', model: 'ECO 125-250',
    spec: { qn: 120, hn: 25, etaBep: 0.78, nn: 1450, motorKw: 15, etaMotor: 0.92, npshrBep: 3, shutoffRatio: 1.2 },
    system: { hStatic: 8, npsha: 8 },
    controls: { ...healthyControls(), faults: { wear: 30, cavitation: 0, bearing: 0, clogging: 0 }, autoAging: true },
    source: 'sim',
  },
  {
    id: 'p03', name: 'Station de relevage', site: 'Assainissement', model: 'ECO 80-160',
    spec: { qn: 60, hn: 18, etaBep: 0.72, nn: 1450, motorKw: 5.5, etaMotor: 0.89, npshrBep: 2, shutoffRatio: 1.3 },
    system: { hStatic: 10, npsha: 4.5 },
    controls: { ...healthyControls(), faults: { wear: 0, cavitation: 62, bearing: 0, clogging: 0 } },
    source: 'sim',
  },
  {
    id: 'p04', name: 'Surpresseur immeuble', site: 'Bâtiment R+8', model: 'ECO 32-250',
    spec: { qn: 15, hn: 60, etaBep: 0.62, nn: 2900, motorKw: 5.5, etaMotor: 0.89, npshrBep: 2, shutoffRatio: 1.2 },
    system: { hStatic: 38, npsha: 9 },
    controls: { ...healthyControls(), valvePct: 45, faults: { wear: 0, cavitation: 0, bearing: 35, clogging: 0 } },
    source: 'sim',
  },
];

export const newPump = (n: number): PumpConfig => ({
  id: `p${Date.now().toString(36)}`,
  name: `Nouvelle pompe ${n}`, site: 'À préciser', model: '—',
  spec: { qn: 40, hn: 30, etaBep: 0.7, nn: 2900, motorKw: 7.5, etaMotor: 0.9, npshrBep: 2.5, shutoffRatio: 1.25 },
  system: { hStatic: 15, npsha: 7 },
  controls: healthyControls(), source: 'sim',
});
