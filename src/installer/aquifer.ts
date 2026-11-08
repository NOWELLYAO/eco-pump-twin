/** Nappe phréatique d'un forage : le niveau dynamique dépend du débit pompé.
 *  L'essai de pompage donne un niveau dynamique mesuré à un débit connu (débit d'essai) : on en tire la
 *  capacité spécifique C = Q_essai / (ND_essai − NS) en m³/h par mètre de rabattement. Au débit Q,
 *  le rabattement vaut Q / C : le niveau dynamique réel est NS + Q / C (modèle linéaire de Thiem/Dupuit). */
import { isForage, solve } from './hydraulics';
import type { Installation } from './types';

export interface Aquifer {
  qTest: number; // débit de l'essai de pompage (m³/h)
  dynTest: number; // niveau dynamique mesuré à ce débit (m)
  c: number; // capacité spécifique (m³/h par m de rabattement)
  qMax: number; // débit qui amènerait l'eau à 2 m au-dessus de la pompe (m³/h)
  qExp: number; // débit d'exploitation conseillé : 80 % du débit d'essai, et pas plus que qMax (m³/h)
  known: boolean; // débit d'essai renseigné (sinon : le niveau dynamique saisi est supposé mesuré au débit de la pompe)
}

/** Capacité spécifique du forage ; qRef = débit de la pompe si le débit d'essai est inconnu. */
export function aquiferOf(i: Installation, qRef?: number): Aquifer | null {
  if (!isForage(i)) return null;
  const g = i.geo;
  const dynTest = g.dynTest ?? g.dynamicLevel;
  const known = (g.boreQ ?? 0) > 0;
  const qTest = known ? g.boreQ! : Math.max(0.1, qRef ?? 0);
  const s = Math.max(0.2, dynTest - g.staticLevel);
  const c = qTest / s;
  const qMax = Math.max(0, c * (g.pumpDepth - 2 - g.staticLevel));
  return { qTest, dynTest, c, qMax, qExp: Math.min(qTest * 0.8, qMax), known };
}

/** Installation avec le niveau dynamique recalculé au débit réel de la pompe (point de fonctionnement). */
export function withAquifer(i: Installation): Installation {
  if (!isForage(i) || !((i.geo.boreQ ?? 0) > 0)) return i;
  const dynTest = i.geo.dynTest ?? i.geo.dynamicLevel;
  const a = aquiferOf({ ...i, geo: { ...i.geo, dynTest } })!;
  let lvl = dynTest, x = i;
  for (let k = 0; k < 12; k++) {
    x = { ...i, geo: { ...i.geo, dynTest, dynamicLevel: lvl } };
    const h = solve(x);
    const next = i.geo.staticLevel + (h.ok ? h.q : 0) / a.c;
    // La pompe ne peut pas faire descendre l'eau sous son entrée : au pire elle y aspire de l'air
    const capped = Math.min(next, i.geo.pumpDepth - 0.3);
    if (Math.abs(capped - lvl) < 0.01) { lvl = capped; break; }
    lvl = lvl + (capped - lvl) * 0.6;
  }
  return { ...i, geo: { ...i.geo, dynTest, dynamicLevel: Math.round(lvl * 100) / 100 } };
}
