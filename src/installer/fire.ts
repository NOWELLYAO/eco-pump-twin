/** Installations incendie : paramètres par défaut et nom de projet automatique. */
import { APPS } from './catalog';
import type { FireCfg, Installation } from './types';

/** RIA : 20 min (NF S 62-201) ; sprinkleurs : 60 min (risque ordinaire, EN 12845). */
export function fireCfg(i: Installation): FireCfg {
  const kind = i.fire?.kind ?? 'ria';
  return { kind, duration: i.fire?.duration ?? (kind === 'sprinkler' ? 60 : 20), reserve: i.fire?.reserve };
}

const num = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
/** Nom proposé : application + débit (+ type pour l'incendie). */
export const autoNameOf = (i: Installation) =>
  `${i.app === 'incendie' ? (fireCfg(i).kind === 'sprinkler' ? 'Incendie sprinkleurs' : 'Incendie RIA') : APPS[i.app].label} — ${num(i.duty.qReq)} m³/h`;

const AUTO_RE = new RegExp(`^(${[...Object.values(APPS).map((a) => a.label), 'Incendie sprinkleurs', 'Incendie RIA'].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}) — [\\d\\s ,.]+ m³/h$`);

/** Nom vide, ou encore généré automatiquement : on le recalcule à chaque changement d'application ou de débit. */
export function withAutoName(i: Installation): Installation {
  const auto = !i.name?.trim() || i.nameAuto === true || (i.nameAuto !== false && AUTO_RE.test(i.name.trim()));
  if (!auto) return i;
  const name = autoNameOf(i);
  return name === i.name && i.nameAuto ? i : { ...i, name, nameAuto: true };
}
