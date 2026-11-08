/** Réservoir de secours en by-pass (forage avec pressostat ou variateur).
 *  En marche normale, la pompe alimente la maison et remplit le réservoir surélevé par un robinet à flotteur.
 *  La sortie vers la maison passe par une électrovanne NORMALEMENT OUVERTE (tenue fermée par le coffret) et un clapet :
 *  en cas de coupure (plus de courant = vanne ouverte), de disjonction, de manque d'eau ou de pression restée basse,
 *  elle s'ouvre et le réservoir alimente la maison par gravité. La hauteur du réservoir ne gêne donc pas le pressostat. */
import type { Installation } from './types';

export interface Backup { on: boolean; volume: number; height: number; autonomyH: number; mode?: BackupMode; float?: FloatKind; low?: number }
/** differentiel : robinet à flotteur à niveau différentiel (vanne altimétrique) : s'ouvre en grand quand le niveau descend
 *                 à « low » % et se ferme à 100 % — longs cycles de remplissage, peu de démarrages ;
 *  modulant : robinet à flotteur classique, il s'entrouvre dès que le niveau baisse de quelques centimètres. */
export type FloatKind = 'differentiel' | 'modulant';
export const floatKind = (b?: { float?: FloatKind } | null): FloatKind => b?.float ?? 'differentiel';
export const floatLow = (b?: { low?: number } | null) => Math.max(30, Math.min(95, b?.low ?? 80)) / 100;
/** serie : la pompe remplit le réservoir par un robinet à flotteur, la maison est TOUJOURS servie par le réservoir (gravité) ;
 *          le flotteur fermé fait monter la pression et le pressostat arrête la pompe, il la relance quand le flotteur se rouvre.
 *  secours : la pompe sert la maison sous pression, le réservoir en by-pass ne sert qu'en cas de panne (électrovanne NO). */
export type BackupMode = 'serie' | 'secours';
export const backupMode = (b?: { mode?: BackupMode } | null): BackupMode => b?.mode ?? 'serie';

/** Cuves du commerce (L) */
export const BACKUP_SIZES = [500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000, 75000, 100000, 150000, 200000, 300000];
/** Au-delà de 50 m³ : réservoir acier à panneaux boulonnés ou béton (plus de cuve PEHD d'une pièce) */
export const BIG_TANK = 50000;
const G = 9.81;

/** Le réservoir de secours en by-pass a du sens : forage qui alimente directement une maison sous pression. */
export const backupApplies = (i: Installation) =>
  i.pumpType === 'immergee_forage' && (!!i.acc.pressostat?.on || !!i.acc.vessie?.on || (!!i.acc.capteur_p?.on && !!i.acc.variateur?.on));

export const backupOf = (i: Installation): Backup | null => (i.backup?.on && backupApplies(i) ? i.backup : null);

export interface BackupCalc {
  dailyM3: number; // consommation journalière (m³/j)
  avgM3h: number; // consommation moyenne pendant une panne (m³/h)
  volRec: number; // volume conseillé (L, taille du commerce)
  hMin: number; // hauteur mini sous le réservoir (m)
  hRec: number; // hauteur conseillée (m)
  pHouse: number; // pression aux robinets alimentés par le réservoir (bar, réservoir à moitié plein)
  headBar: number; // pression créée par le réservoir au niveau de la maison (bar)
  headV: number; // la même, ramenée au niveau du pressostat / réservoir à vessie (tête de forage) : le clapet s'ouvre sous cette pression
  headTop: number; // pression nécessaire en tête de forage pour remplir la cuve par le haut (robinet à flotteur)
  autonomyH: number; // autonomie réelle à la consommation moyenne (h)
  fillM3h: number; // débit de remplissage par le robinet à flotteur (m³/h)
  fillH: number; // temps de remplissage complet (h)
  fillDn: number; // DN du robinet à flotteur / by-pass
  outDn: number; // DN de la sortie vers la maison
  tankH: number; // hauteur d'eau dans la cuve (m)
}

/** Dimensionnement : volume selon l'autonomie voulue, hauteur selon la pression voulue aux robinets. */
export function backupCalc(i: Installation, b: Backup = i.backup ?? { on: true, volume: 0, height: 8, autonomyH: 12 }): BackupCalc {
  // Consommation moyenne d'un réseau domestique : 27 % du débit de pointe (même profil journalier que la simulation)
  const avgM3h = Math.max(0.02, i.duty.qReq * 0.27);
  const dailyM3 = avgM3h * 24;
  const need = avgM3h * Math.max(1, b.autonomyH) * 1000;
  const volRec = BACKUP_SIZES.find((v) => v >= need) ?? BACKUP_SIZES[BACKUP_SIZES.length - 1];
  // Pression mini 0,5 bar aux robinets : 5 m + 2 m (robinet au-dessus du sol, pertes) — conseillé 1 bar
  const hMin = 7, hRec = 10;
  const tankH = Math.max(1, Math.min(3, (b.volume / 1000) ** (1 / 3) * 1.1)); // hauteur d'eau dans la cuve (m)
  const rhoG = i.fluid.rho * G;
  const pHouse = Math.max(0, ((b.height + tankH / 2 - 2) * rhoG) / 1e5);
  const headBar = ((b.height + tankH / 2) * rhoG) / 1e5;
  const headV = headBar + (Math.max(0, i.geo.hRef) * rhoG) / 1e5;
  const headTop = ((b.height + tankH + 0.3 + Math.max(0, i.geo.hRef)) * rhoG) / 1e5;
  // En série, le robinet à flotteur passe tout le débit de la pompe ; en secours, un petit débit de remplissage suffit
  const serie = backupMode(b) === 'serie';
  const fillM3h = serie ? Math.max(0.5, i.duty.qReq * 1.1) : Math.max(0.3, Math.min(i.duty.qReq * 0.5, 6));
  const fillDn = [[1.5, 20], [3, 25], [6, 32], [10, 40], [18, 50], [30, 65], [50, 80], [Infinity, 100]].find(([q]) => fillM3h <= q)![1];
  const outDn = [[3, 32], [8, 40], [15, 50], [30, 65], [55, 80], [Infinity, 100]].find(([q]) => i.duty.qReq <= q)![1];
  return {
    dailyM3, avgM3h, volRec, hMin, hRec, pHouse, headBar, headV, headTop, tankH,
    autonomyH: b.volume / 1000 / Math.max(0.01, avgM3h),
    fillM3h, fillH: b.volume / 1000 / fillM3h, fillDn, outDn,
  };
}

/** Réservoir de secours proposé pour cette installation. */
export function backupProposal(i: Installation, autonomyH = 12): Backup {
  const c = backupCalc(i, { on: true, volume: 0, height: 10, autonomyH, mode: backupMode(i.backup) });
  return { on: true, volume: c.volRec, height: 10, autonomyH, mode: backupMode(i.backup), float: floatKind(i.backup), low: i.backup?.low ?? 80 };
}
