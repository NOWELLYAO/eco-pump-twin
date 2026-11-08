/** Gammes Grundfos correspondant à chaque élément (pour les photos réelles). null = Grundfos ne fait pas cet élément. */
import type { Installation } from './types';

export interface BrandRange {
  /** Nom de la gamme, affiché */
  range: string;
  /** Ce que c'est, en clair */
  desc: string;
  /** Recherches photo, essayées dans l'ordre */
  q: string[];
}

const G = (range: string, desc: string, ...q: string[]): BrandRange => ({ range, desc, q: q.length ? q : [`Grundfos ${range}`] });

const WATER_APPS = new Set(['forage', 'surpression', 'irrigation', 'transfert', 'incendie', 'drainage']);

function pumpRange(i: Installation): BrandRange | null {
  const many = (i.pump.count ?? 1) > 1;
  switch (i.pumpType) {
    case 'immergee_forage':
      if (i.elec.supply === 'solaire') return G('SQFlex', 'pompe de forage solaire', 'Grundfos SQFlex', 'Grundfos SQ');
      if (i.pump.diameterMm <= 80) return G('SQ', 'pompe de forage 3"', 'Grundfos SQ', 'Grundfos SP');
      return G('SP', 'pompe immergée de forage, tout inox (4" à 12")', 'Grundfos SP submersible', 'Grundfos SP', 'Grundfos submersible pump');
    case 'multi_v':
      if (many && i.app === 'surpression') return G('Hydro MPC', 'surpresseur multi-pompes (pompes CR)', 'Grundfos Hydro MPC', 'Grundfos Hydro', 'Grundfos CR');
      return G('CR', 'pompe multicellulaire verticale in-line', 'Grundfos CR pump', 'Grundfos CR', 'Grundfos multistage');
    case 'multi_h':
      return G('CM', 'pompe multicellulaire horizontale compacte', 'Grundfos CM', 'Grundfos CMB', 'Grundfos multistage');
    case 'surface':
      if (!WATER_APPS.has(i.app)) return null;
      return G('NB / NBG', 'pompe centrifuge monobloc normalisée (EN 733)', 'Grundfos NB', 'Grundfos NBG', 'Grundfos NK', 'Grundfos end suction');
    case 'auto_amorcante':
      if (!WATER_APPS.has(i.app)) return null;
      return G('JP', 'pompe auto-amorçante (jet)', 'Grundfos JP', 'Grundfos jet pump');
    case 'submersible_relevage':
      return G('SL / SE / SEG', 'pompe submersible eaux usées (vortex, monocanal, dilacératrice)', 'Grundfos SEG', 'Grundfos SL', 'Grundfos SE', 'Grundfos sewage pump');
    case 'drainage_immergee':
      return G('Unilift', 'pompe de drainage submersible', 'Grundfos Unilift', 'Grundfos KP', 'Grundfos drainage pump');
  }
  return null;
}

/** Accessoires que Grundfos fabrique. Les autres : photos génériques. */
const ACC_RANGE: Record<string, BrandRange> = {
  vessie: G('GT-U / GT-H', 'réservoir à vessie', 'Grundfos GT-U', 'Grundfos GT-H', 'Grundfos pressure tank', 'Grundfos tank'),
  pressostat: G('PM 1 / PM 2', 'pressostat électronique (pressure manager)', 'Grundfos PM2', 'Grundfos PM 2', 'Grundfos PM1', 'Grundfos pressure manager'),
  capteur_p: G('Direct Sensors RPI', 'capteur de pression 4-20 mA', 'Grundfos RPI', 'Grundfos Direct Sensors', 'Grundfos sensor'),
  variateur: G('CUE', 'variateur de fréquence pour pompes', 'Grundfos CUE', 'Grundfos frequency converter'),
  coffret: G('Control MP 204', 'coffret et protection moteur', 'Grundfos MP 204', 'Grundfos MP204', 'Grundfos control'),
  marche_sec: G('LiqTec / MP 204', 'protection contre la marche à sec', 'Grundfos LiqTec', 'Grundfos MP 204'),
  flotteur_arret: G('Interrupteur à flotteur', 'flotteur de niveau', 'Grundfos float switch', 'Grundfos float'),
  flotteur_marche: G('Interrupteur à flotteur', 'flotteur de niveau', 'Grundfos float switch', 'Grundfos float'),
  flotteur_alarme: G('Interrupteur à flotteur', 'flotteur de niveau', 'Grundfos float switch', 'Grundfos float'),
  flotteur_res: G('Interrupteur à flotteur', 'flotteur de niveau', 'Grundfos float switch', 'Grundfos float'),
  barres: G('Auto-coupling', 'pied d\'assise et barres de guidage', 'Grundfos auto coupling', 'Grundfos SEG'),
  chemise: G('Chemise de refroidissement', 'chemise pour moteur immergé', 'Grundfos cooling sleeve', 'Grundfos flow sleeve'),
};

/** Gamme Grundfos pour une cible du schéma (pompe, accessoire, coffret…) */
export function grundfosFor(target: string, i: Installation): BrandRange | null {
  if (target === 'pump') return pumpRange(i);
  if (target === 'cable') return i.elec.supply === 'solaire' ? null : ACC_RANGE.coffret;
  if (target === 'pv' && i.pumpType === 'immergee_forage') return G('SQFlex', 'système de pompage solaire', 'Grundfos SQFlex', 'Grundfos solar');
  if (target.startsWith('acc:')) {
    const id = target.slice(4);
    if (id === 'marche_sec' && i.pumpType === 'immergee_forage') return G('MP 204', 'protection moteur avec détection marche à sec', 'Grundfos MP 204', 'Grundfos MP204');
    return ACC_RANGE[id] ?? null;
  }
  return null;
}
