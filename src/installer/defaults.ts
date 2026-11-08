import type { Installation } from './types';

/** Valeurs de site essentielles : tant qu'elles n'ont pas été saisies, ce sont des valeurs par défaut à vérifier. */
export function trackedFields(i: Installation): { key: string; label: string }[] {
  const forage = i.pumpType === 'immergee_forage';
  const pit = i.mode === 'immergee' && !forage;
  const out: { key: string; label: string }[] = [
    { key: 'duty.qReq', label: 'débit nécessaire' }, { key: 'duty.pRes', label: 'pression au point d\'utilisation' },
    { key: 'geo.hRef', label: forage ? 'hauteur de sortie au-dessus du sol' : 'hauteur de refoulement' },
    { key: 'ref.length', label: 'longueur de refoulement' }, { key: 'elec.cableLen', label: 'longueur du câble moteur' },
  ];
  if (forage) out.push({ key: 'geo.staticLevel', label: 'niveau statique' }, { key: 'geo.dynamicLevel', label: 'niveau dynamique' }, { key: 'geo.pumpDepth', label: 'profondeur de la pompe' }, { key: 'geo.boreDepth', label: 'profondeur du forage' });
  else if (pit) out.push({ key: 'geo.wetLevel', label: 'hauteur d\'eau au-dessus de la pompe' }, { key: 'geo.tankVolume', label: 'volume utile de la fosse' });
  else {
    out.push({ key: 'asp.length', label: 'longueur d\'aspiration' });
    out.push(i.mode === 'aspiration' ? { key: 'geo.suctionLift', label: 'hauteur d\'aspiration' } : { key: 'geo.chargeHead', label: 'charge à l\'aspiration' });
  }
  return out;
}

/** Champs encore à la valeur par défaut (projets anciens ou exemples : pas de suivi). */
export function defaultsLeft(i: Installation) {
  if (!Array.isArray(i.touched)) return [];
  const t = new Set(i.touched);
  return trackedFields(i).filter((f) => !t.has(f.key));
}
export const isDefault = (i: Installation, key: string) => Array.isArray(i.touched) && !i.touched.includes(key) && trackedFields(i).some((f) => f.key === key);

/** Marque des champs comme saisis par l'utilisateur. */
export function touch(i: Installation, keys: string[]): Installation {
  if (!Array.isArray(i.touched)) return i;
  const t = new Set(i.touched);
  let changed = false;
  for (const k of keys) if (!t.has(k)) { t.add(k); changed = true; }
  return changed ? { ...i, touched: [...t] } : i;
}
