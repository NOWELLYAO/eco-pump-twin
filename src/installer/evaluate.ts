import { aquiferOf, withAquifer } from './aquifer';
import { fireCfg } from './fire';
import { FORMATIONS, screenCalc, screenOf } from './borehole';
import { isForage as isForageI } from './hydraulics';
import { ACC, ACCESSORIES, APPS, FLUIDS, PARTS, PIPE_MATS, PUMP_MATS, PUMP_TYPES, nextDn, pipeCompat, pipeFor, withPipe, pumpCompat, withPipesFor, refLen, refStatic } from './catalog';
import { isForage, losses, nRun, patm, pressureHead, pumpHead, pumpNpshr, solve, speedFor, staticHead, suctionZ, vaporPressure, type Hydro } from './hydraulics';
import { effectiveStart, electrical, ensureElec, vessel as vesselCalc, vfdSet, type ElecResult } from './electrical';
import { defaultsLeft } from './defaults';
import { fitBore, proposePump } from './sizing';
import { sizeFor, sizeLabel, sizeOf } from './borepump';
import { backupApplies, backupCalc, backupMode, backupOf, backupProposal, floatKind, floatLow } from './backup';
import type { Category, Installation, Issue, Need, Sev } from './types';

const f1 = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const f0 = (v: number) => Math.round(v).toLocaleString('fr-FR');

const setAcc = (id: string, on = true, extra: Partial<Installation['acc'][string]> = {}) => (i: Installation): Installation => ({
  ...i, acc: { ...i.acc, [id]: { ...((i.acc[id] as Installation['acc'][string] | undefined) ?? { dn: defaultDn(i, id), qty: 1 }), ...extra, on } },
});
export { withPipe };
const bigger = (side: 'asp' | 'ref') => (x: Installation) => withPipe(x, side, nextDn(x[side].dn));

export function defaultDn(i: Installation, id: string) {
  const a = ACC[id];
  if (!a?.inline) return 0;
  if (id === 'cone_exc') return i.asp.dn;
  if (id === 'cone_ref') return i.ref.dn;
  return a.side === 'asp' ? i.asp.dn : i.ref.dn;
}

/** Pourquoi chaque accessoire requis manque, et ce que ça coûte. */
const MISSING: Record<string, { sev: Sev; why: string; consequences: string[]; parts: string[] }> = {
  clapet_pied: { sev: 'critical', why: 'Une pompe non auto-amorçante en aspiration se vide à chaque arrêt.', consequences: ['Désamorçage à chaque arrêt', 'Marche à sec dès le redémarrage', 'Garniture mécanique détruite en quelques minutes'], parts: ['garniture', 'roue', 'bagues'] },
  vanne_asp: { sev: 'warning', why: 'Sans vanne, impossible de démonter la pompe sans vidanger la bâche.', consequences: ['Maintenance longue et coûteuse', 'Vidange complète du réservoir à chaque intervention'], parts: [] },
  cone_exc: { sev: 'warning', why: 'La conduite d\'aspiration est plus grosse que la bride de la pompe.', consequences: ['Raccord improvisé', 'Poche d\'air en partie haute, désamorçages'], parts: ['roue', 'garniture'] },
  prefiltre: { sev: 'warning', why: 'Cheveux et feuilles bloquent la roue d\'une pompe de piscine.', consequences: ['Roue bouchée', 'Baisse de débit de filtration'], parts: ['roue', 'garniture'] },
  cone_ref: { sev: 'info', why: 'La conduite de refoulement est plus grosse que la bride.', consequences: ['Pertes de charge et turbulences au raccord'], parts: [] },
  manometre: { sev: 'warning', why: 'Sans manomètre, aucun diagnostic possible.', consequences: ['Usure et colmatage invisibles', 'Réglage de la vanne à l\'aveugle'], parts: [] },
  clapet_ar: { sev: 'critical', why: 'La colonne d\'eau redescend dans la pompe à chaque arrêt.', consequences: ['Rotation inverse de la pompe', 'Coup de bélier', 'Vidange de la conduite et désamorçage'], parts: ['clapet', 'accouplement', 'arbre', 'garniture', 'tuyauterie'] },
  clapet_boule: { sev: 'critical', why: 'Les eaux chargées redescendent dans la fosse à chaque arrêt.', consequences: ['Cycles marche/arrêt incessants', 'Retour des effluents', 'Usure prématurée du moteur'], parts: ['moteur', 'coffret', 'roue'] },
  vanne_ref: { sev: 'warning', why: 'Pas d\'isolement ni de réglage du point de fonctionnement.', consequences: ['Impossible d\'intervenir sans vidanger le réseau', 'Impossible d\'ajuster le débit'], parts: [] },
  debitmetre: { sev: 'warning', why: 'Le débit doit être mesuré pour cette application.', consequences: ['Impossible de vérifier les performances', 'Surexploitation du forage non détectée'], parts: [] },
  capteur_p: { sev: 'critical', why: 'Le variateur a besoin d\'une mesure de pression pour réguler.', consequences: ['Régulation impossible', 'Pression instable'], parts: ['moteur'] },
  pressostat: { sev: 'critical', why: 'Rien ne commande la marche et l\'arrêt de la pompe.', consequences: ['Pompe en marche permanente vanne fermée', 'Échauffement de l\'eau dans la pompe'], parts: ['garniture', 'roulements', 'moteur'] },
  vessie: { sev: 'critical', why: 'Sans réserve, la pompe démarre à chaque ouverture de robinet.', consequences: ['Dizaines de démarrages par heure', 'Moteur et contacteurs grillés', 'Coups de bélier'], parts: ['moteur', 'coffret', 'clapet'] },
  coffret: { sev: 'critical', why: 'Le moteur n\'est protégé ni contre la surcharge ni contre le court-circuit.', consequences: ['Moteur grillé à la première anomalie', 'Risque électrique pour les personnes'], parts: ['moteur', 'cable'] },
  marche_sec: { sev: 'critical', why: 'Si le niveau baisse, la pompe tourne à sec.', consequences: ['Marche à sec', 'Garniture et paliers détruits', 'Moteur immergé non refroidi qui grille'], parts: ['garniture', 'moteur', 'roue', 'diffuseurs'] },
  flotteur_arret: { sev: 'critical', why: 'Rien n\'arrête la pompe quand la fosse est vide.', consequences: ['Marche à sec', 'Moteur non refroidi'], parts: ['moteur', 'garniture'] },
  flotteur_marche: { sev: 'critical', why: 'Rien ne démarre la pompe quand la fosse se remplit.', consequences: ['Débordement de la fosse'], parts: [] },
  flotteur_alarme: { sev: 'warning', why: 'Une panne de pompe ne serait signalée par aucune alarme.', consequences: ['Débordement non détecté', 'Pollution, dégâts des eaux'], parts: [] },
  barres: { sev: 'warning', why: 'Il faudrait descendre dans la fosse pour sortir la pompe.', consequences: ['Intervention dangereuse (H₂S, espace confiné)', 'Maintenance coûteuse'], parts: [] },
  coffret_inc: { sev: 'critical', why: 'Un coffret ordinaire arrête la pompe sur surcharge ou à la pression d\'arrêt : en plein incendie, c\'est l\'extinction qui s\'arrête.', consequences: ['Pompe arrêtée pendant l\'incendie', 'Non-conformité'], parts: [] },
  alim_inc: { sev: 'critical', why: 'Si la pompe est alimentée après le disjoncteur général, couper le bâtiment (pompiers, court-circuit) coupe aussi la pompe incendie.', consequences: ['Plus d\'eau pour l\'extinction', 'Non-conformité'], parts: ['cable'] },
  alarme_inc: { sev: 'warning', why: 'Un défaut de la pompe incendie doit être vu immédiatement.', consequences: ['Panne découverte le jour de l\'incendie'], parts: [] },
  jockey: { sev: 'warning', why: 'Les petites fuites font baisser la pression : la pompe principale démarre, et comme elle ne s\'arrête qu\'à la main, elle tourne pour rien.', consequences: ['Démarrages intempestifs', 'Pompe principale qui tourne à débit nul'], parts: ['garniture'] },
  amorcage: { sev: 'critical', why: 'En aspiration, un clapet de pied qui fuit vide la pompe : elle ne débiterait pas au moment de l\'incendie.', consequences: ['Pompe désamorcée au démarrage', 'Non-conformité'], parts: ['garniture'] },
  anti_vortex: { sev: 'warning', why: 'Quand la réserve baisse, un tourbillon se forme et fait aspirer de l\'air à la pompe.', consequences: ['Chute de débit en fin de réserve', 'Cavitation'], parts: ['roue'] },
  essai: { sev: 'warning', why: 'Les essais périodiques (débit, pression) sont obligatoires et ne doivent pas vider la réserve.', consequences: ['Performances jamais vérifiées', 'Non-conformité'], parts: [] },
  soupape_circ: { sev: 'warning', why: 'Arrêt manuel uniquement : vanne fermée, la pompe chauffe l\'eau qu\'elle contient jusqu\'à la vaporisation.', consequences: ['Garniture détruite', 'Pompe hors service'], parts: ['garniture', 'roulements'] },
  diesel: { sev: 'critical', why: 'Les deux pompes dépendent du même réseau électrique : une coupure les arrête toutes les deux.', consequences: ['Plus de pompe pendant une coupure', 'Non-conformité sprinkleur'], parts: [] },
  atex: { sev: 'critical', why: 'Liquide inflammable : étincelle et électricité statique interdites.', consequences: ['Risque d\'incendie et d\'explosion', 'Non-conformité réglementaire'], parts: ['moteur'] },
};

const AVOID: Record<string, { why: string; consequences: string[]; parts: string[] }> = {
  clapet_ar: { why: 'Un clapet à ressort se bouche avec des fibres et des boues.', consequences: ['Clapet bloqué ouvert ou fermé', 'Retours d\'effluents'], parts: ['clapet'] },
  filtre_asp: { why: 'Un filtre colmaté priverait d\'eau la pompe incendie au pire moment.', consequences: ['Débit incendie insuffisant', 'Non-conformité'], parts: [] },
  marche_sec: { why: 'Une pompe incendie ne doit pas être arrêtée par une protection manque d\'eau : mieux vaut perdre la pompe que l\'extinction (seule une alarme est admise).', consequences: ['Arrêt de la pompe en plein incendie', 'Non-conformité'], parts: [] },
  variateur: { why: 'Un variateur ajoute un point de panne et réduit la pression en cas de défaut : les pompes incendie tournent à vitesse fixe.', consequences: ['Pompe bridée ou arrêtée par un défaut du variateur', 'Non-conformité'], parts: [] },
};

export interface Evaluation {
  hydro: Hydro;
  issues: Issue[];
  goods: string[];
  score: number;
  verdict: { label: string; level: 'excellent' | 'good' | 'fair' | 'bad'; text: string };
  cats: Record<Category, number>;
  parts: { id: string; label: string; sev: Sev; causes: string[] }[];
  needs: Record<string, Need>;
  elec: ElecResult;
}

/** Libellé de catégorie (« Aspiration & NPSH » devient « Immersion » pour une pompe immergée). */
export const catLabel = (k: Category, imm: boolean) => (imm && k === 'aspiration' ? 'Immersion & niveau d\'eau' : CAT_LABEL[k]);
export const CAT_LABEL: Record<Category, string> = {
  hydraulique: 'Hydraulique', aspiration: 'Aspiration & NPSH', materiaux: 'Matériaux & fluide',
  accessoires: 'Accessoires', securite: 'Sécurité & pression', electricite: 'Électricité', energie: 'Énergie',
};

export function evaluate(input: Installation): Evaluation {
  const i = withAquifer(ensureElec(input));
  const h = solve(i);
  const out: Issue[] = [];
  const goods: string[] = [];
  const add = (x: Issue) => out.push(x);
  const pt = PUMP_TYPES[i.pumpType];
  const fl = FLUIDS[i.fluid.type];
  const imm = i.mode === 'immergee';
  const solids = i.fluid.solidsPct > 0.2 || i.fluid.particleMm > 3;
  const rhoG = i.fluid.rho * 9.81;
  const needs: Record<string, Need> = {};
  for (const a of ACCESSORIES) needs[a.id] = a.need(i);

  // ---------- Compatibilité pompe / mode ----------
  if (!pt.modes.includes(i.mode)) {
    add({ id: 'mode', sev: 'critical', cat: 'aspiration', title: `${pt.label} inadaptée au montage « ${i.mode === 'charge' ? 'en charge' : i.mode} »`,
      detail: `Ce type de pompe s'installe : ${pt.modes.map((m) => (m === 'charge' ? 'en charge' : m)).join(', ')}.`,
      consequences: ['Fonctionnement impossible ou très dégradé'], parts: ['moteur', 'garniture'],
      solutions: ['Choisir un type de pompe adapté au montage', 'Ou modifier le montage'] });
  }

  // Avec un variateur (hors solaire) et une pompe qui donne plus que le besoin, la vitesse est réduite
  // jusqu'au débit demandé : c'est ce point régulé qu'il faut juger (rendement, puissance moteur).
  let vfdPt: { hz: number; x: number; pShaft: number; hzMax: number } | null = null;
  if (h.ok && effectiveStart(i) === 'variateur' && i.elec.supply !== 'solaire' && h.q > i.duty.qReq * 1.03) {
    const etaP = Math.max(0.3, h.eta);
    // Vitesse et puissance par pompe pour un débit total q réglé par le variateur
    const at = (q: number) => {
      const qe = q / h.n;
      const hs = staticHead(i) + pressureHead(i) + losses(i, q).total;
      const sp = speedFor(i, q, hs);
      return { sp, p: (i.fluid.rho * 9.81 * (qe / 3600) * hs) / etaP / 1000 };
    };
    const r = at(i.duty.qReq);
    if (Number.isFinite(r.sp) && r.sp > 0.3 && r.sp < 1) {
      // Fréquence maxi à régler pour que le moteur ne dépasse pas 95 % de sa puissance
      let lo = i.duty.qReq, hi = h.q;
      for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (at(m).p <= i.pump.motorKw * 0.95) lo = m; else hi = m; }
      vfdPt = { hz: 50 * r.sp, x: (i.duty.qReq / h.n) / (i.pump.qn * r.sp), pShaft: r.p, hzMax: Math.min(50, 50 * at(lo).sp) };
    }
  }

  // ---------- Hydraulique : point de fonctionnement ----------
  if (!h.ok) {
    add({ id: 'nohead', sev: 'critical', cat: 'hydraulique', title: 'La pompe ne peut pas atteindre la hauteur demandée',
      detail: `Hauteur à débit nul : ${f1(h.h)} m. Hauteur géométrique + pression demandée : ${f1(h.hStatic + h.hPress)} m.`,
      consequences: ['Aucun débit en sortie', 'L\'eau chauffe dans la pompe', 'Garniture et roulements détruits'], parts: ['garniture', 'roulements', 'roue', 'moteur'],
      solutions: ['Choisir une pompe de plus forte HMT (plus d\'étages, roue plus grande)', 'Réduire la pression résiduelle demandée', 'Vérifier les hauteurs saisies'],
      fix: { label: 'Choisir une pompe adaptée', apply: sized } });
  } else {
    const r = h.q / i.duty.qReq;
    // Forage limité volontairement à son débit d'exploitation : ce n'est pas un défaut de la pompe (voir « aq_need »)
    const aq0 = aquiferOf(i, h.q);
    const boreLimited = !!aq0?.known && i.duty.qReq > aq0.qExp * 1.02 && h.q >= aq0.qExp * 0.9;
    if (r < 0.97 && !boreLimited) {
      const crit = r < 0.9;
      const share = h.hLoss / h.h;
      const side: 'asp' | 'ref' = !imm && h.lossAsp > h.lossRef ? 'asp' : 'ref';
      const vSide = side === 'asp' ? h.vAsp : h.vRef;
      const canGrow = share > 0.2 && vSide > 1.0;
      add({ id: 'lowq', sev: crit ? 'critical' : 'warning', cat: 'hydraulique', title: 'Débit insuffisant',
        detail: `L'installation débite ${f1(h.q)} m³/h pour ${f1(i.duty.qReq)} m³/h demandés (${f0(r * 100)} %).`,
        consequences: ['Besoin non couvert', 'Pompe sollicitée en continu'], parts: [],
        solutions: [canGrow ? `Réduire les pertes de charge (${f0(share * 100)} % de la hauteur) : ${side === 'asp' ? 'aspiration' : 'refoulement'} en DN${nextDn(i[side].dn)}` : `Choisir une pompe de plus forte HMT : il faut environ ${f1(h.hStatic + h.hPress + h.hLoss * (i.duty.qReq / Math.max(h.q, 0.1)) ** 2)} m à ${f1(i.duty.qReq)} m³/h`, 'Réduire la pression résiduelle demandée si possible'],
        fix: canGrow ? { label: `${side === 'asp' ? 'Aspiration' : 'Refoulement'} en DN${nextDn(i[side].dn)}`, apply: bigger(side) } : undefined });
    } else if (r > 1.3) {
      add({ id: 'highq', sev: i.acc.variateur?.on ? 'info' : 'warning', cat: 'energie', title: 'Pompe surdimensionnée pour le besoin',
        detail: `${f1(h.q)} m³/h pour ${f1(i.duty.qReq)} m³/h demandés (+${f0((r - 1) * 100)} %).`,
        consequences: ['Énergie gaspillée', 'Usure plus rapide si l\'on étrangle à la vanne'], parts: ['roulements', 'garniture'],
        solutions: [i.acc.variateur?.on ? 'Régler la consigne du variateur sur le besoin réel' : 'Ajouter un variateur de fréquence', 'Rogner la roue ou choisir une pompe plus petite'],
        fix: i.acc.variateur?.on ? undefined : { label: 'Ajouter un variateur', apply: setAcc('variateur') } });
    } else goods.push(`Débit conforme au besoin : ${f1(h.q)} m³/h pour ${f1(i.duty.qReq)} m³/h demandés`);

    // Réservoir à vessie + pressostat : la pompe ne travaille jamais au point « tuyau ouvert » mais entre les pressions
    // de marche et d'arrêt ; son vrai point de fonctionnement est le débit de remplissage à la pression moyenne.
    const ves = !vfdPt && effectiveStart(i) !== 'variateur' && i.acc.pressostat?.on && i.acc.vessie?.on ? vesselCalc(i, h) : null;
    const xv = ves && ves.qFill > 0 ? (ves.qFill / h.n) / i.pump.qn : null;
    const xr = vfdPt ? vfdPt.x : xv ?? h.x;
    const at = vfdPt ? ` avec le variateur réglé sur le besoin (≈ ${f0(vfdPt.hz)} Hz)` : xv != null ? ` entre ${f1(ves!.pOn)} et ${f1(ves!.pOff)} bar (pressostat)` : '';
    if (vfdPt && h.x > 1.2 && xr >= 0.7 && xr <= 1.2) {
      goods.push(`Le variateur ramène la pompe à ${f0(vfdPt.hz)} Hz : ${f0(xr * 100)} % du débit optimal (à 50 Hz elle serait à ${f0(h.x * 100)} %)`);
    } else if (xr < 0.7 || xr > 1.2) {
      const crit = xr < 0.5 || xr > 1.3;
      const low = xr < 1;
      add({ id: 'bep', sev: crit ? 'critical' : 'warning', cat: 'hydraulique', title: low ? 'Pompe trop à gauche de sa courbe (faible débit)' : 'Pompe trop à droite de sa courbe (fort débit)',
        detail: `Point de fonctionnement à ${f0(xr * 100)} % du débit optimal${at} (plage conseillée 70–120 %).${!vfdPt && !low && effectiveStart(i) === 'variateur' && h.q <= i.duty.qReq * 1.03 ? ' Le variateur ne peut pas corriger : la pompe donne déjà moins que le besoin à 50 Hz, ralentir réduirait encore le débit.' : ''}`,
        consequences: low ? ['Recirculation interne, vibrations', 'Échauffement du liquide', 'Efforts radiaux sur l\'arbre'] : ['Risque de cavitation', 'Surcharge du moteur', 'Bruit et vibrations'],
        parts: low ? ['roulements', 'garniture', 'arbre', 'roue'] : ['roue', 'moteur', 'garniture', 'roulements'],
        solutions: low ? ['Choisir une pompe dont le débit optimal est proche du besoin', 'Utiliser un variateur plutôt qu\'une vanne étranglée'] : rightSolutions(i, h, !!vfdPt),
        fix: low ? undefined : { label: `Pompe adaptée : ${f1(sized(i).pump.qn)} m³/h à ${f0(sized(i).pump.hn)} m`, apply: sized } });
    } else if (xr >= 0.85 && xr <= 1.1) goods.push(`Point de fonctionnement proche du rendement optimal (${f0(xr * 100)} % du débit nominal${at})`);

    const share = h.hLoss / h.h;
    if (share > 0.2) {
      const side: 'asp' | 'ref' = !imm && h.lossAsp > h.lossRef ? 'asp' : 'ref';
      const alt = solve(withPipe(i, side, nextDn(i[side].dn)));
      const saveKwh = Math.max(0, h.kwhYear - alt.kwhYear * (h.q / Math.max(alt.q, 0.01)));
      add({ id: 'losses', sev: share > 0.3 ? 'warning' : 'info', cat: 'energie', title: 'Pertes de charge importantes',
        detail: `Les pertes représentent ${f1(h.hLoss)} m, soit ${f0(share * 100)} % de la hauteur fournie (${imm ? `entrée de la pompe ${f1(h.lossAsp)} m` : `aspiration ${f1(h.lossAsp)} m`}, refoulement ${f1(h.lossRef)} m).`,
        consequences: ['Surconsommation électrique permanente', 'Débit réduit'], parts: [],
        solutions: [`Passer ${side === 'asp' ? 'l\'aspiration' : 'le refoulement'} de DN${i[side].dn} à DN${nextDn(i[side].dn)} : environ ${f0(saveKwh)} kWh/an économisés (${f0(saveKwh * i.duty.pricePerKwh)} ${i.duty.currency}/an)`, 'Réduire le nombre de coudes et d\'accessoires à forte perte'],
        fix: (side === 'asp' ? h.vAsp : h.vRef) > 0.9 ? { label: `${side === 'asp' ? 'Aspiration' : 'Refoulement'} en DN${nextDn(i[side].dn)}`, apply: bigger(side) } : undefined });
    } else if (share < 0.15) goods.push(`Pertes de charge maîtrisées (${f0(share * 100)} % de la hauteur)`);

    // ---------- Pompes en parallèle ----------
  const count = Math.max(1, i.pump.count ?? 1);
  const standby = Math.max(0, Math.min(count - 1, i.pump.standby ?? 0));
  if (count > 1 && h.ok && h.n > 1) {
    const one = solve({ ...i, pump: { ...i.pump, standby: count - 1 } });
    if (one.ok && (one.x > 1.25 || one.pShaft > i.pump.motorKw)) {
      const over = one.pShaft > i.pump.motorKw;
      add({ id: 'par_single', sev: over ? 'critical' : 'warning', cat: 'hydraulique', title: 'Une pompe seule part en bout de courbe',
        detail: `Quand une seule pompe tourne (faible demande, panne de l'autre), elle débite ${f1(one.q)} m³/h, soit ${f0(one.x * 100)} % de son débit optimal${over ? `, et absorbe ${f1(one.pShaft, 2)} kW pour un moteur de ${f1(i.pump.motorKw)} kW` : ''}.`,
        consequences: ['Cavitation et vibrations sur la pompe seule', over ? 'Déclenchement du moteur' : 'Usure accélérée'], parts: ['roue', 'moteur', 'roulements', 'garniture'],
        solutions: ['Variateur sur chaque pompe pour limiter le débit d\'une pompe seule', 'Ou moteur dimensionné pour le bout de courbe', 'Ou vanne de réglage / limitation de débit'] });
    }
  }
  if (count > 1) goods.push(`${count} pompes en parallèle : ${h.n} en service${standby ? ` + ${standby} en secours` : ''}${i.pump.alternate ? ', permutation automatique' : ''}`);
  if (standby === 0 && (i.app === 'relevage' || i.app === 'incendie' || i.app === 'surpression')) {
    add({ id: 'par_spare', sev: i.app === 'surpression' ? 'info' : 'warning', cat: 'securite', title: 'Pas de pompe de secours',
      detail: i.app === 'relevage' ? 'Un poste de relevage doit continuer à fonctionner si une pompe tombe en panne.' : i.app === 'incendie' ? 'Une installation incendie doit disposer d\'une pompe de secours.' : 'Une panne de l\'unique pompe prive tout le bâtiment d\'eau.',
      consequences: [i.app === 'relevage' ? 'Débordement de la fosse en cas de panne' : 'Coupure totale en cas de panne'], parts: [],
      solutions: ['Installer une pompe de secours identique avec permutation automatique'],
      fix: { label: '1 pompe de secours', apply: (x) => ({ ...x, pump: { ...x.pump, count: Math.max(1, x.pump.count ?? 1) + 1, standby: (x.pump.standby ?? 0) + 1, alternate: true } }) } });
  }
  if (standby > 0 && !i.pump.alternate) {
    add({ id: 'par_alt', sev: 'info', cat: 'securite', title: 'Pompe de secours sans permutation',
      detail: 'Une pompe qui ne tourne jamais se grippe et sa garniture se dessèche.', consequences: ['Pompe de secours bloquée le jour où on en a besoin'], parts: ['garniture', 'roulements'],
      solutions: ['Activer la permutation automatique à chaque démarrage (ou toutes les 24 h)'], fix: { label: 'Activer la permutation', apply: (x) => ({ ...x, pump: { ...x.pump, alternate: true } }) } });
  }

  // ---------- Vitesses ----------
    if (!imm) {
      if (h.vAsp > 1.5) {
        add({ id: 'vasp', sev: h.vAsp > 2.2 ? 'critical' : 'warning', cat: 'aspiration', title: 'Vitesse trop élevée dans l\'aspiration',
          detail: `${f1(h.vAsp, 2)} m/s en DN${i.asp.dn} (conseillé : 0,6 à 1,5 m/s, idéalement < 1,2 m/s).`,
          consequences: ['NPSH disponible réduit, cavitation', 'Vortex et entrée d\'air'], parts: ['roue', 'garniture'],
          solutions: [`Passer l'aspiration en DN${nextDn(i.asp.dn)}`], fix: { label: `Aspiration en DN${nextDn(i.asp.dn)}`, apply: bigger('asp') } });
      }
    }
    if (h.vRef > 2.5) {
      add({ id: 'vref', sev: h.vRef > 3.5 ? 'critical' : 'warning', cat: 'hydraulique', title: 'Vitesse trop élevée au refoulement',
        detail: `${f1(h.vRef, 2)} m/s en DN${i.ref.dn} (conseillé : 1 à 2,5 m/s).`,
        consequences: ['Pertes de charge et consommation élevées', 'Coups de bélier violents', 'Érosion des coudes et vannes', 'Bruit dans le réseau'], parts: ['tuyauterie', 'clapet', 'vanne', 'joints'],
        solutions: [`Passer le refoulement en DN${nextDn(i.ref.dn)}`], fix: { label: `Refoulement en DN${nextDn(i.ref.dn)}`, apply: bigger('ref') } });
    } else if (solids && h.vRef < 0.7) {
      add({ id: 'vsed', sev: 'warning', cat: 'hydraulique', title: 'Vitesse trop faible : risque de dépôts',
        detail: `${f1(h.vRef, 2)} m/s au refoulement : en dessous de 0,7 m/s les matières se déposent (vitesse d'autocurage).`,
        consequences: ['Sédimentation et bouchage progressif de la conduite', 'Hausse progressive de la hauteur manométrique'], parts: ['tuyauterie', 'clapet'],
        solutions: ['Réduire le diamètre du refoulement', 'Prévoir des chasses ou un regard de nettoyage'] });
    } else if (h.vRef < 0.3) {
      add({ id: 'vlow', sev: 'info', cat: 'hydraulique', title: 'Conduite de refoulement surdimensionnée',
        detail: `${f1(h.vRef, 2)} m/s seulement en DN${i.ref.dn}.`, consequences: ['Surcoût d\'achat', 'Eau stagnante (qualité sanitaire)'], parts: [],
        solutions: ['Un diamètre inférieur suffit'] });
    }
    const vOkA = imm || (h.vAsp >= 0.5 && h.vAsp <= 1.5);
    const vOkR = h.vRef >= 0.6 && h.vRef <= 2.5;
    if (vOkA && vOkR && !out.some((x) => ['vasp', 'vref', 'vsed', 'vlow'].includes(x.id))) goods.push(`Vitesses dans les plages recommandées (${imm ? '' : `aspiration ${f1(h.vAsp, 2)} m/s, `}refoulement ${f1(h.vRef, 2)} m/s)`);

    // ---------- NPSH (pompes de surface seulement : une pompe immergée est noyée, c'est son immersion qui compte) ----------
    const need = Math.max(1, 0.2 * h.npshr);
    if (!imm && h.margin < need) {
      const crit = h.margin < 0.5;
      add({ id: 'npsh', sev: crit ? 'critical' : 'warning', cat: 'aspiration', title: crit ? 'Cavitation certaine' : 'Marge NPSH insuffisante',
        detail: `NPSH disponible ${f1(h.npsha)} m pour ${f1(h.npshr)} m requis : marge ${f1(h.margin)} m (conseillé ≥ ${f1(need)} m). Altitude ${f0(i.geo.altitude)} m, liquide à ${f0(i.fluid.temp)} °C.`,
        consequences: ['Bruit de « gravier » dans la pompe', 'Chute de débit et de pression', 'Érosion de la roue en quelques semaines', 'Vibrations destructrices'],
        parts: ['roue', 'corps', 'garniture', 'roulements', 'bagues'],
        solutions: [
          i.mode === 'aspiration' ? 'Rapprocher la pompe du niveau d\'eau ou l\'installer en charge' : 'Augmenter la hauteur de liquide au-dessus de la pompe',
          !imm ? `Augmenter le diamètre et raccourcir l'aspiration (pertes actuelles ${f1(h.lossAsp)} m)` : 'Descendre la pompe plus bas',
          'Choisir une pompe à NPSH requis plus faible (vitesse 1450 tr/min)',
          i.acc.filtre_asp?.on && i.mode === 'aspiration' ? 'Supprimer le filtre de l\'aspiration' : 'Réduire le débit',
        ],
        fix: i.mode === 'aspiration' && i.geo.suctionLift - (need - h.margin) - 0.3 > 0.3
          ? { label: `Aspiration ramenée à ${f1(i.geo.suctionLift - (need - h.margin) - 0.3)} m`, apply: (x) => ({ ...x, geo: { ...x.geo, suctionLift: Math.round((x.geo.suctionLift - (need - h.margin) - 0.3) * 10) / 10 } }) }
          : i.mode === 'aspiration' ? { label: 'Installer la pompe en charge', apply: (x) => ({ ...x, mode: 'charge', geo: { ...x.geo, chargeHead: 0.5 } }) } : undefined });
    } else if (!imm && h.margin >= 1.5) goods.push(`Marge NPSH confortable : ${f1(h.margin)} m`);
  }

  // ---------- Aspiration : géométrie ----------
  if (i.mode === 'aspiration') {
    if (i.geo.suctionLift > 7) {
      add({ id: 'lift', sev: 'critical', cat: 'aspiration', title: 'Hauteur d\'aspiration irréaliste',
        detail: `${f1(i.geo.suctionLift)} m d'aspiration : au-delà de 6 à 7 m, aucune pompe de surface ne fonctionne durablement.`,
        consequences: ['Désamorçages fréquents', 'Cavitation permanente'], parts: ['roue', 'garniture', 'crepine'],
        solutions: ['Descendre la pompe près du niveau d\'eau', 'Passer à une pompe immergée'],
        fix: { label: 'Aspiration à 4 m', apply: (x) => ({ ...x, geo: { ...x.geo, suctionLift: 4 } }) } });
    } else if (i.geo.suctionLift > 5.5) {
      add({ id: 'lift', sev: 'warning', cat: 'aspiration', title: 'Hauteur d\'aspiration élevée',
        detail: `${f1(i.geo.suctionLift)} m : fonctionnement possible mais fragile (amorçage, cavitation par temps chaud).`,
        consequences: ['Amorçage difficile', 'Sensibilité aux entrées d\'air'], parts: ['garniture', 'crepine'],
        solutions: ['Viser moins de 4 à 5 m d\'aspiration', 'Rendre l\'aspiration parfaitement étanche'],
        fix: { label: 'Aspiration à 4,5 m', apply: (x) => ({ ...x, geo: { ...x.geo, suctionLift: 4.5 } }) } });
    }
    if (i.asp.length > 15) {
      add({ id: 'asplen', sev: 'warning', cat: 'aspiration', title: 'Conduite d\'aspiration trop longue',
        detail: `${f0(i.asp.length)} m d'aspiration (conseillé < 10 à 15 m).`,
        consequences: ['Amorçage long', 'Entrées d\'air par les raccords', 'Pertes de charge'], parts: ['garniture', 'crepine'],
        solutions: ['Rapprocher la pompe de la source et allonger plutôt le refoulement'],
        fix: { label: 'Aspiration de 8 m', apply: (x) => ({ ...x, asp: { ...x.asp, length: 8 }, ref: { ...x.ref, length: x.ref.length + Math.max(0, x.asp.length - 8) } }) } });
    }
    if (PUMP_TYPES[i.pumpType].label.startsWith('Multicellulaire')) {
      add({ id: 'multiasp', sev: 'warning', cat: 'aspiration', title: 'Multicellulaire en aspiration',
        detail: 'Les multicellulaires ont un NPSH requis élevé et tolèrent mal l\'air.', consequences: ['Cavitation', 'Désamorçage'], parts: ['diffuseurs', 'garniture'],
        solutions: ['Installer la pompe en charge (bâche tampon)'] });
    }
  }
  if (!imm) {
    if (i.asp.dn < i.pump.dnAsp) {
      add({ id: 'aspdn', sev: 'warning', cat: 'aspiration', title: 'Aspiration plus petite que la bride de la pompe',
        detail: `Conduite DN${i.asp.dn} sur une bride DN${i.pump.dnAsp}. L'aspiration doit être au moins égale, idéalement un DN au-dessus.`,
        consequences: ['Vitesse élevée et cavitation', 'Débit réduit'], parts: ['roue', 'garniture'],
        solutions: [`Passer l'aspiration en DN${nextDn(i.pump.dnAsp)} avec un cône excentrique`],
        fix: { label: `Aspiration DN${nextDn(i.pump.dnAsp)} + cône`, apply: (x) => setAcc('cone_exc', true, { opt: 'haut', dn: nextDn(x.pump.dnAsp) })(withPipe(x, 'asp', nextDn(x.pump.dnAsp))) } });
    }
    if (i.acc.cone_exc?.on && i.acc.cone_exc.opt === 'bas') {
      add({ id: 'cone', sev: 'warning', cat: 'aspiration', title: 'Cône excentrique monté méplat en bas',
        detail: 'En aspiration, le méplat doit être en haut pour ne pas piéger d\'air.', consequences: ['Poche d\'air permanente', 'Désamorçages, cavitation'], parts: ['roue', 'garniture'],
        solutions: ['Retourner le cône : méplat en haut'], fix: { label: 'Méplat en haut', apply: setAcc('cone_exc', true, { opt: 'haut' }) } });
    }
    const need5 = (5 * i.asp.dn) / 1000;
    if (i.asp.elbows > 0 && i.geo.straight < need5) {
      add({ id: 'straight', sev: 'warning', cat: 'aspiration', title: 'Coude trop proche de l\'entrée de la pompe',
        detail: `${f1(i.geo.straight, 2)} m de longueur droite avant la pompe ; il faut au moins 5 × DN = ${f1(need5, 2)} m.`,
        consequences: ['Écoulement tourbillonnaire à l\'entrée de la roue', 'Cavitation locale, vibrations', 'Efforts dissymétriques sur les roulements'], parts: ['roue', 'roulements', 'garniture'],
        solutions: [`Prévoir au moins ${f1(need5, 2)} m de tube droit avant la bride d'aspiration`],
        fix: { label: `Droit de ${f1(need5, 2)} m`, apply: (x) => ({ ...x, geo: { ...x.geo, straight: Math.ceil(need5 * 10) / 10 } }) } });
    }
    if (h.ok && i.geo.immersion < h.vortexS) {
      add({ id: 'vortex', sev: i.geo.immersion < h.vortexS * 0.5 ? 'critical' : 'warning', cat: 'aspiration', title: 'Immersion insuffisante : vortex',
        detail: `L'entrée de la conduite n'est immergée que de ${f1(i.geo.immersion, 2)} m ; il faut au moins ${f1(h.vortexS, 2)} m à cette vitesse (règle HI 9.8).`,
        consequences: ['Formation de vortex et aspiration d\'air', 'Chute de débit, bruit, désamorçage'], parts: ['roue', 'garniture', 'roulements'],
        solutions: [`Immerger l'entrée d'au moins ${f1(h.vortexS, 2)} m sous le niveau mini`, 'Poser une plaque anti-vortex ou un cône d\'entrée évasé'],
        fix: { label: `Immersion ${f1(h.vortexS, 2)} m`, apply: (x) => ({ ...x, geo: { ...x.geo, immersion: Math.ceil(h.vortexS * 10) / 10 } }) } });
    }
    const minBottom = Math.max(0.05, (0.5 * i.asp.dn) / 1000);
    if (i.geo.bottom < minBottom) {
      add({ id: 'bottom', sev: 'warning', cat: 'aspiration', title: 'Entrée de conduite trop près du fond',
        detail: `${f1(i.geo.bottom, 2)} m du fond (mini ${f1(minBottom, 2)} m).`, consequences: ['Aspiration de sable et de boues', 'Restriction d\'entrée'], parts: ['roue', 'bagues', 'crepine'],
        solutions: [`Relever l'entrée à ${f1(minBottom, 2)} m du fond minimum`],
        fix: { label: `${f1(minBottom, 2)} m du fond`, apply: (x) => ({ ...x, geo: { ...x.geo, bottom: Math.ceil(minBottom * 100) / 100 } }) } });
    }
    if (i.acc.filtre_asp?.on && i.mode === 'aspiration') {
      add({ id: 'filtasp', sev: 'warning', cat: 'aspiration', title: 'Filtre monté sur une aspiration en dépression',
        detail: 'Un filtre en Y qui s\'encrasse ajoute vite plusieurs mètres de pertes là où le NPSH est déjà juste.',
        consequences: ['Cavitation dès que le filtre s\'encrasse'], parts: ['roue', 'garniture'],
        solutions: ['Préférer une crépine à grande surface dans la source', 'Ou poser un vacuomètre et nettoyer le filtre régulièrement'] });
    }
    if (i.acc.clapet_pied?.on && solids) {
      add({ id: 'footclog', sev: 'info', cat: 'aspiration', title: 'Clapet de pied en eau chargée',
        detail: 'Débris et algues bloquent la crépine et empêchent le clapet de se fermer.',
        consequences: ['Désamorçage', 'Baisse de débit progressive'], parts: ['crepine'],
        solutions: ['Crépine à grande surface ou panier de protection', 'Nettoyage périodique', 'Suspendre la crépine au-dessus du fond (flotteur)'] });
    }
    // Diamètres des accessoires d'aspiration
    for (const a of ACCESSORIES.filter((x) => x.side === 'asp' && x.inline && i.acc[x.id]?.on && x.id !== 'cone_exc')) {
      const s = i.acc[a.id];
      if (s.dn && s.dn < i.asp.dn) {
        add({ id: `dn_${a.id}`, sev: 'warning', cat: 'aspiration', title: `${a.label} sous-dimensionné(e)`,
          detail: `DN${s.dn} sur une conduite DN${i.asp.dn}.`, consequences: ['Étranglement côté aspiration', 'Perte de NPSH, cavitation'], parts: ['roue'],
          solutions: [`Prendre l'accessoire au DN${i.asp.dn}`], fix: { label: `Passer en DN${i.asp.dn}`, apply: setAcc(a.id, true, { dn: i.asp.dn }) } });
      }
    }
  }
  for (const a of ACCESSORIES.filter((x) => x.side === 'ref' && x.inline && i.acc[x.id]?.on && x.id !== 'cone_ref')) {
    const s = i.acc[a.id];
    if (s.dn && s.dn < i.ref.dn) {
      add({ id: `dn_${a.id}`, sev: 'info', cat: 'hydraulique', title: `${a.label} plus petit que la conduite`,
        detail: `DN${s.dn} sur une conduite DN${i.ref.dn} : perte de charge locale accrue.`, consequences: ['Pertes de charge, bruit'], parts: ['vanne', 'clapet'],
        solutions: [`Prendre l'accessoire au DN${i.ref.dn}`], fix: { label: `Passer en DN${i.ref.dn}`, apply: setAcc(a.id, true, { dn: i.ref.dn }) } });
    }
  }
  if (i.ref.dn < i.pump.dnRef) {
    add({ id: 'refdn', sev: 'warning', cat: 'hydraulique', title: 'Refoulement plus petit que la bride de la pompe',
      detail: `Conduite DN${i.ref.dn} pour une bride DN${i.pump.dnRef}.`, consequences: ['Vitesse et pertes élevées'], parts: ['tuyauterie'],
      solutions: [`Refoulement au moins en DN${i.pump.dnRef}`], fix: { label: `Refoulement DN${i.pump.dnRef}`, apply: (x) => withPipe(x, 'ref', x.pump.dnRef) } });
  }

  // ---------- Forage ----------
  if (isForage(i)) {
    const sub = i.geo.pumpDepth - i.geo.dynamicLevel;
    if (sub < 3) {
      add({ id: 'sub', sev: sub < 1 ? 'critical' : 'warning', cat: 'aspiration', title: 'Pompe trop peu immergée',
        detail: `La pompe n'est qu'à ${f1(sub)} m sous le niveau dynamique (conseillé ≥ 3 m).`,
        consequences: ['Aspiration d\'air, désamorçage', 'Marche à sec en fin de saison', 'Moteur mal refroidi'], parts: ['moteur', 'diffuseurs', 'roue', 'cable'],
        solutions: [`Descendre la pompe à au moins ${f0(i.geo.dynamicLevel + 3)} m`, 'Réduire le débit pour limiter le rabattement'],
        fix: { label: `Pompe à ${f0(i.geo.dynamicLevel + 3)} m`, apply: (x) => ({ ...x, geo: { ...x.geo, pumpDepth: x.geo.dynamicLevel + 3 } }) } });
    }
    if (i.geo.pumpDepth > i.geo.boreDepth - 3) {
      add({ id: 'bottomf', sev: i.geo.pumpDepth >= i.geo.boreDepth ? 'critical' : 'warning', cat: 'aspiration', title: 'Pompe trop près du fond du forage',
        detail: `Pompe à ${f0(i.geo.pumpDepth)} m pour un forage de ${f0(i.geo.boreDepth)} m (garder ≥ 3 m).`,
        consequences: ['Aspiration de sable et de sédiments', 'Moteur enfoui dans les dépôts, mal refroidi'], parts: ['roue', 'diffuseurs', 'moteur'],
        solutions: ['Remonter la pompe d\'au moins 3 m au-dessus du fond'] });
    }
    { // Gamme de la pompe de forage (3" mono … 12" tri) : débit et moteur dans les limites de la taille choisie
      const z = sizeOf(i);
      if (i.pump.qn > z.qMax * 1.05 || i.pump.motorKw > z.kwMax) {
        const up = sizeFor(i.pump.qn, i.pump.motorKw, 9999);
        add({ id: 'bore_range', sev: 'critical', cat: 'hydraulique', title: `Pas de pompe ${z.inch}" pour ce débit`,
          detail: `Les pompes ${z.inch}" vont jusqu'à ${z.qMax} m³/h et ${z.kwMax} kW ; il faut ${f1(i.pump.qn)} m³/h et ${f1(i.pump.motorKw)} kW, soit une pompe ${up.inch}" (Ø${up.mm} mm, forage Ø${up.mm + 10} mm minimum).`,
          consequences: ['Pompe introuvable chez les fabricants', 'Ou moteur hors gamme'], parts: ['moteur'],
          solutions: [`Pompe ${sizeLabel(up)}`, 'Ou réduire le débit demandé'], fix: { label: `Pompe ${up.inch}"`, apply: (x) => fitBore({ ...x, pump: { ...x.pump, boreIn: up.inch } }) } });
      }
      if (z.phase === 'mono' && i.elec.supply === 'tri') add({ id: 'bore_mono', sev: 'info', cat: 'electricite', title: 'Pompe 3" : moteur monophasé',
        detail: 'Les pompes 3" sont en 230 V monophasé (avec coffret de démarrage à condensateur).', consequences: [], parts: [], solutions: ['Alimentation 230 V'] });
    }
    if (i.geo.boreDia < i.pump.diameterMm + 10) {
      add({ id: 'bore', sev: 'critical', cat: 'aspiration', title: 'Pompe trop grosse pour le forage',
        detail: `Forage Ø${i.geo.boreDia} mm pour une pompe de Ø${i.pump.diameterMm} mm.`, consequences: ['Descente impossible ou pompe coincée', 'Câble arraché'], parts: ['cable', 'moteur'],
        solutions: ['Choisir une pompe de diamètre inférieur (4" = 98 mm)'] });
    } else if (h.ok) {
      const vmin = i.pump.diameterMm < 110 ? 0.08 : 0.16;
      if (h.coolingV < vmin) {
        add({ id: 'cool', sev: h.coolingV < vmin / 2 ? 'critical' : 'warning', cat: 'securite', title: 'Moteur immergé mal refroidi',
          detail: `L'eau longe le moteur à ${f1(h.coolingV, 3)} m/s ; il faut au moins ${f1(vmin, 2)} m/s (forage Ø${i.geo.boreDia} mm trop large pour ce débit).`,
          consequences: ['Surchauffe du moteur', 'Dépôts calcaires sur le moteur', 'Durée de vie divisée'], parts: ['moteur', 'cable'],
          solutions: ['Installer une chemise de refroidissement autour du moteur'], fix: { label: 'Ajouter une chemise', apply: setAcc('chemise') } });
      } else goods.push(`Refroidissement du moteur correct (${f1(h.coolingV, 2)} m/s)`);
    }
    if (i.geo.dynamicLevel < i.geo.staticLevel) {
      add({ id: 'levels', sev: 'info', cat: 'aspiration', title: 'Niveaux du forage incohérents', detail: 'Le niveau dynamique (en pompage) doit être plus bas que le niveau statique.', consequences: [], parts: [], solutions: ['Vérifier les niveaux mesurés lors de l\'essai de pompage'] });
    }
  }

  // ---------- Relevage / bâche ----------
  if (imm && !isForage(i) && h.ok) {
    const maxS = i.pump.maxStarts;
    if (h.startsH > maxS) {
      const vNeed = Math.ceil((h.q / (4 * maxS)) * 1000 / 50) * 50;
      add({ id: 'starts', sev: h.startsH > maxS * 1.5 ? 'critical' : 'warning', cat: 'securite', title: 'Trop de démarrages par heure',
        detail: `Jusqu'à ${f0(h.startsH)} démarrages/h avec ${f0(i.geo.tankVolume)} L utiles ; le moteur en supporte ${maxS}.`,
        consequences: ['Échauffement du bobinage', 'Usure des contacteurs', 'Coups de bélier répétés'], parts: ['moteur', 'coffret', 'clapet'],
        solutions: [`Porter le volume utile de la fosse (entre flotteurs) à ${f0(vNeed)} L`, 'Écarter davantage les flotteurs marche/arrêt'],
        fix: { label: `Volume utile ${f0(vNeed)} L`, apply: (x) => ({ ...x, geo: { ...x.geo, tankVolume: vNeed } }) } });
    }
    if (i.geo.wetLevel < 0.3 && i.pumpType !== 'immergee_forage') {
      add({ id: 'wet', sev: 'warning', cat: 'securite', title: 'Niveau d\'arrêt trop bas', detail: `${f1(i.geo.wetLevel, 2)} m d'eau au-dessus de la pompe au niveau d'arrêt.`,
        consequences: ['Moteur hors d\'eau, mal refroidi', 'Aspiration d\'air'], parts: ['moteur', 'garniture'], solutions: ['Régler le flotteur d\'arrêt pour garder le moteur noyé (≥ 0,3 m ou selon notice)'] });
    }
    if (i.fluid.type === 'eaux_usees' && i.pump.passage < 40) {
      add({ id: 'passage_eu', sev: 'warning', cat: 'materiaux', title: 'Passage libre faible pour des eaux usées',
        detail: `${i.pump.passage} mm de passage ; 40 mm minimum en eaux usées brutes, sinon une pompe dilacératrice.`,
        consequences: ['Bouchage par les lingettes et fibres'], parts: ['roue', 'moteur'], solutions: ['Pompe vortex ou monocanal à 40-50 mm de passage', 'Ou pompe dilacératrice'] });
    }
    if (i.ref.dn < i.pump.passage * 1.2) {
      add({ id: 'refpass', sev: 'warning', cat: 'hydraulique', title: 'Refoulement trop étroit pour les solides', detail: `DN${i.ref.dn} pour des solides jusqu'à ${i.pump.passage} mm.`,
        consequences: ['Bouchage de la conduite ou du clapet'], parts: ['clapet', 'tuyauterie'], solutions: ['Refoulement ≥ DN65 à DN80 en eaux usées'] });
    }
  }
  if (i.fluid.type === 'eaux_usees' && !['submersible_relevage', 'drainage_immergee'].includes(i.pumpType)) {
    add({ id: 'eutype', sev: 'warning', cat: 'materiaux', title: 'Pompe inadaptée aux eaux usées', detail: 'Une pompe à roue fermée se bouche avec les fibres.',
      consequences: ['Bouchages fréquents', 'Surcharge moteur'], parts: ['roue', 'garniture', 'moteur'], solutions: ['Pompe submersible vortex ou monocanal'] });
  }
  // ---------- Matériaux & fluide ----------
  const pc = pumpCompat(i.fluid.type, i.pump.material);
  if (pc !== 'ok') {
    add({ id: 'pmat', sev: pc === 'bad' ? 'critical' : 'warning', cat: 'materiaux', title: `${PUMP_MATS[i.pump.material]} et ${fl.label.toLowerCase()} : mauvaise association`,
      detail: fl.note, consequences: ['Corrosion ou abrasion de la pompe', 'Fuites, perte de rendement'], parts: ['corps', 'roue', 'bagues', 'garniture'],
      solutions: [i.fluid.type === 'eau_mer' ? 'Bronze, duplex ou thermoplastique' : i.fluid.type === 'boues' ? 'Fonte au chrome anti-abrasion' : 'Inox 316 ou bronze selon le fluide'] });
  }
  for (const [side, run] of [['aspiration', i.asp], ['refoulement', i.ref]] as const) {
    if (side === 'aspiration' && imm) continue;
    const c = pipeCompat(i.fluid.type, run.material);
    if (c !== 'ok') {
      add({ id: `pipe_${side}`, sev: c === 'bad' ? 'critical' : 'warning', cat: 'materiaux', title: `${PIPE_MATS[run.material].label} déconseillé au ${side} pour ce fluide`,
        detail: fl.note, consequences: i.fluid.type === 'gasoil' ? ['Non-conformité incendie', 'Dégradation et fuite d\'hydrocarbure'] : ['Corrosion, rouille dans l\'eau', 'Fuites et casse'], parts: ['tuyauterie', 'joints'],
        solutions: [i.fluid.type === 'gasoil' || i.fluid.type === 'huile' ? 'Acier noir ou inox, flexibles agréés hydrocarbures' : 'PEHD, PVC pression ou inox 316 selon la pression'],
        fix: pipeFor(i, side === 'aspiration' ? 'asp' : 'ref') !== run.material ? { label: `Conduites en ${PIPE_MATS[pipeFor(i, side === 'aspiration' ? 'asp' : 'ref')].label}`, apply: withPipesFor } : undefined });
    }
    const tm = PIPE_MATS[run.material].tmax;
    if (i.fluid.temp > tm) {
      add({ id: `ptemp_${side}`, sev: 'critical', cat: 'materiaux', title: `Fluide trop chaud pour le ${PIPE_MATS[run.material].label} (${side})`,
        detail: `${f0(i.fluid.temp)} °C pour un matériau limité à ${tm} °C.`, consequences: ['Ramollissement, fluage', 'Éclatement de la conduite'], parts: ['tuyauterie', 'joints'],
        solutions: ['PPR, cuivre, acier ou inox selon la température'],
        fix: pipeFor(i, side === 'aspiration' ? 'asp' : 'ref') !== run.material ? { label: `Conduites en ${PIPE_MATS[pipeFor(i, side === 'aspiration' ? 'asp' : 'ref')].label}`, apply: withPipesFor } : undefined });
    } else if (i.fluid.temp > tm * 0.8 && ['pvc', 'pehd', 'ppr'].includes(run.material)) {
      add({ id: `ptempw_${side}`, sev: 'warning', cat: 'materiaux', title: `Pression admissible réduite par la température (${side})`,
        detail: `À ${f0(i.fluid.temp)} °C, un ${PIPE_MATS[run.material].label} perd une partie de sa tenue en pression (PN${run.pn}).`, consequences: ['Fluage à long terme'], parts: ['tuyauterie'],
        solutions: ['Prendre une classe PN supérieure'] });
    }
  }
  if (i.fluid.temp > i.pump.tmax) {
    add({ id: 'temp', sev: 'critical', cat: 'materiaux', title: 'Liquide trop chaud pour la pompe',
      detail: `${f0(i.fluid.temp)} °C pour une pompe limitée à ${i.pump.tmax} °C.`, consequences: ['Garniture et joints détruits', 'Moteur immergé en surchauffe'], parts: ['garniture', 'joints', 'moteur', 'roulements'],
      solutions: ['Pompe et garniture prévues pour cette température'] });
  }
  if (i.fluid.sandGm3 > i.pump.sandMax) {
    add({ id: 'sand', sev: i.fluid.sandGm3 > 3 * i.pump.sandMax ? 'critical' : 'warning', cat: 'materiaux', title: 'Teneur en sable trop élevée',
      detail: `${f0(i.fluid.sandGm3)} g/m³ pour ${f0(i.pump.sandMax)} g/m³ admissibles.`,
      consequences: ['Abrasion rapide des roues et diffuseurs', 'Chute de débit en quelques mois', 'Garniture rayée'], parts: ['roue', 'diffuseurs', 'bagues', 'garniture', 'roulements'],
      solutions: isForage(i) ? ['Développer le forage (soufflage) et vérifier le massif filtrant', 'Réduire le débit pour limiter la venue de sable', 'Pompe à roues flottantes / anti-sable'] : ['Dessableur ou décanteur en amont', 'Pompe en fonte au chrome'] });
  }
  // Particules : ce qui arrive à la pompe est limité par le filtre monté en amont (maille du tamis, du panier, de la crépine)
  const mesh = Math.min(i.acc.filtre_asp?.on ? 1 : 99, i.acc.prefiltre?.on ? 2.5 : 99, i.acc.crepine?.on || i.acc.clapet_pied?.on ? 5 : 99);
  const pEff = Math.min(i.fluid.particleMm, mesh);
  if (pEff > i.pump.passage) {
    const canFilter = !imm && i.app !== 'incendie' && i.pump.passage >= 1 && !i.acc.filtre_asp?.on;
    add({ id: 'particle', sev: 'critical', cat: 'materiaux', title: 'Particules plus grosses que le passage de la pompe',
      detail: `Solides jusqu'à ${f0(pEff)} mm${mesh < i.fluid.particleMm ? ' (après la crépine)' : ''} pour ${i.pump.passage} mm de passage libre.`, consequences: ['Bouchage de la roue', 'Blocage et surcharge moteur'], parts: ['roue', 'moteur', 'garniture'],
      solutions: canFilter ? ['Filtre à tamis en Y (maille ≈ 1 mm) à l\'aspiration, à nettoyer régulièrement', 'Ou pompe à plus grand passage (vortex, centrifuge de surface)'] : ['Pompe à plus grand passage (vortex)', 'Ou crépine / dégrillage adapté en amont'],
      fix: canFilter ? { label: 'Ajouter un filtre à tamis', apply: setAcc('filtre_asp', true, { dn: i.asp.dn }) } : undefined });
  } else if (i.fluid.particleMm > i.pump.passage && i.fluid.solidsPct >= 0.1) {
    add({ id: 'particle_filter', sev: 'warning', cat: 'accessoires', title: 'Filtre indispensable : il va se colmater vite',
      detail: `Le filtre arrête des solides (jusqu'à ${f0(i.fluid.particleMm)} mm) que la pompe (${i.pump.passage} mm de passage) ne supporterait pas ; avec ${f1(i.fluid.solidsPct)} % de matières en suspension, il se charge vite.`,
      consequences: ['Débit qui baisse au fil des jours', 'Cavitation si le filtre est à l\'aspiration et colmaté'], parts: ['filtre'],
      solutions: ['Nettoyer le filtre chaque semaine (manomètre ou vacuomètre de part et d\'autre pour suivre le colmatage)', 'Pompe à plus grand passage pour s\'en passer'] });
  }
  if (i.fluid.nu > 150) {
    add({ id: 'visc', sev: 'critical', cat: 'materiaux', title: 'Liquide trop visqueux pour une pompe centrifuge',
      detail: `${f0(i.fluid.nu)} cSt : rendement corrigé ${f0(h.corr.ceta * 100)} % de la valeur sur eau.`, consequences: ['Débit très réduit', 'Surconsommation'], parts: ['moteur'],
      solutions: ['Pompe volumétrique (engrenages, vis, lobes)'] });
  } else if (i.fluid.nu > 20) {
    add({ id: 'visc', sev: 'warning', cat: 'energie', title: 'Liquide visqueux : performances réduites',
      detail: `${f0(i.fluid.nu)} cSt : hauteur × ${f1(h.corr.ch, 2)}, rendement × ${f1(h.corr.ceta, 2)} (déjà pris en compte).`,
      consequences: ['Puissance absorbée accrue'], parts: ['moteur'], solutions: ['Vérifier la puissance moteur', 'Chauffer le liquide ou passer en volumétrique'] });
  }
  const ferrous = (m: string) => ['fonte', 'galva', 'acier', 'cuivre', 'fonte_chrome'].includes(m);
  if ((i.fluid.ph < 6.5 || i.fluid.ph > 9) && (ferrous(i.pump.material) || ferrous(i.ref.material))) {
    add({ id: 'ph', sev: 'warning', cat: 'materiaux', title: `Eau ${i.fluid.ph < 6.5 ? 'acide' : 'basique'} (pH ${f1(i.fluid.ph)})`,
      detail: 'Fontes, aciers et cuivre se corrodent hors de la plage pH 6,5 à 9.', consequences: ['Corrosion, eau rouge', 'Perçage des conduites'], parts: ['corps', 'tuyauterie'],
      solutions: ['Pompe inox 316, conduites PEHD/PVC', 'Ou neutraliser l\'eau'] });
  }
  if ((i.fluid.type === 'gasoil' || i.fluid.type === 'huile') && (isForage(i) || i.pumpType === 'submersible_relevage' || i.pumpType === 'drainage_immergee')) {
    add({ id: 'hydroimm', sev: 'critical', cat: 'securite', title: 'Pompe à eau immergée dans un hydrocarbure',
      detail: 'Ces moteurs ne sont ni étanches aux hydrocarbures ni ATEX.', consequences: ['Destruction du moteur', 'Risque d\'explosion'], parts: ['moteur', 'cable', 'joints'],
      solutions: ['Pompe de transfert ATEX de surface'] });
  }
  if (!out.some((x) => x.cat === 'materiaux')) goods.push(`Matériaux compatibles avec le fluide (${PUMP_MATS[i.pump.material]}, ${PIPE_MATS[i.ref.material].label})`);

  // ---------- Sécurité & pression ----------
  if (h.pMaxBar > i.ref.pn) {
    add({ id: 'pn', sev: 'critical', cat: 'securite', title: 'Pression maximale supérieure à la PN de la conduite',
      detail: `Vanne fermée, la pompe peut monter à ${f1(h.pMaxBar)} bar pour une conduite PN${i.ref.pn}.`, consequences: ['Éclatement de la conduite ou des raccords', 'Inondation'], parts: ['tuyauterie', 'joints', 'vanne'],
      solutions: [`Conduite PN${[6, 10, 16, 25, 40].find((p) => p > h.pMaxBar) ?? 40}`, 'Ou soupape de décharge tarée sous la PN'],
      fix: { label: `Conduite PN${[6, 10, 16, 25, 40].find((p) => p > h.pMaxBar) ?? 40}`, apply: (x) => ({ ...x, ref: { ...x.ref, pn: [6, 10, 16, 25, 40].find((p) => p > h.pMaxBar) ?? 40 } }) } });
  } else goods.push(`Tenue en pression vérifiée : ${f1(h.pMaxBar)} bar maxi pour PN${i.ref.pn}`);

  if (h.ok) {
    const prot = i.acc.anti_belier?.on || (i.acc.vessie?.on && refLen(i) < 300);
    const surgeEff = h.surge * (prot ? 0.35 : 1);
    const pSurge = ((refStatic(i) + surgeEff) * rhoG) / 1e5;
    const pLimit = i.ref.pn * 1.0;
    if (pSurge > pLimit || (!prot && (refLen(i) > 150 || refStatic(i) > 30) && h.surge > 25)) {
      add({ id: 'surge', sev: pSurge > pLimit * 1.3 ? 'critical' : 'warning', cat: 'securite', title: 'Risque de coup de bélier',
        detail: `À l'arrêt brutal, la surpression peut atteindre ${f0(h.surge)} m (célérité ${PIPE_MATS[i.ref.material].celerity} m/s × ${f1(h.vRef, 2)} m/s). Pression transitoire estimée : ${f1(pSurge)} bar ${prot ? '(avec protection)' : ''} pour PN${i.ref.pn}.`,
        consequences: ['Claquement du clapet', 'Joints arrachés, conduite fissurée', 'Dépression et cavitation dans la conduite'], parts: ['clapet', 'tuyauterie', 'joints', 'membrane', 'vanne'],
        solutions: ['Ballon anti-bélier dimensionné ou soupape anti-bélier', 'Clapet à fermeture rapide (ressort)', 'Démarrage/arrêt progressif par variateur ou démarreur'],
        fix: prot ? undefined : { label: 'Ajouter un anti-bélier', apply: setAcc('anti_belier') } });
    }
    // Anti-bélier en plus du réservoir à vessie : sur un refoulement court, la vessie suffit à amortir l'arrêt
    if (i.acc.anti_belier?.on && i.acc.vessie?.on && refLen(i) < 300) {
      const pVes = ((refStatic(i) + h.surge * 0.35) * rhoG) / 1e5;
      if (pVes <= pLimit) add({ id: 'dup_ab', sev: 'info', cat: 'accessoires', title: 'Anti-bélier en double avec le réservoir à vessie',
        detail: `Le réservoir à vessie, placé juste après la pompe, amortit déjà le coup de bélier : pointe estimée ${f1(pVes)} bar pour PN${i.ref.pn} sur ${f0(refLen(i))} m de refoulement. Un ballon anti-bélier séparé n'apporte rien de plus ici.`,
        consequences: ['Coût et entretien d\'un second ballon (précharge à contrôler)'], parts: [],
        solutions: ['Retirer : Anti-bélier (ballon ou soupape)'], fix: { label: 'Retirer l\'anti-bélier', apply: setAcc('anti_belier', false) } });
    }
    if (h.pShaft > i.pump.motorKw * 0.95 && vfdPt && vfdPt.pShaft <= i.pump.motorKw * 0.95) {
      add({ id: 'motor', sev: 'warning', cat: 'securite', title: 'Moteur trop juste à 50 Hz : limiter le variateur',
        detail: `Réglée sur le besoin (≈ ${f0(vfdPt.hz)} Hz), la pompe absorbe ${f1(vfdPt.pShaft, 2)} kW : le moteur de ${f1(i.pump.motorKw)} kW suffit. Mais si le variateur monte à 50 Hz (consigne perdue, capteur en défaut, mode manuel), elle absorberait ${f1(h.pShaft, 2)} kW.`,
        consequences: ['Surcharge et déclenchement si le variateur passe à pleine vitesse'], parts: ['moteur'],
        solutions: [`Régler la fréquence maxi du variateur à ${f0(Math.floor(vfdPt.hzMax))} Hz et sa limite de courant au courant nominal du moteur`, `Ou moteur d'au moins ${f1(h.pShaft * 1.15)} kW pour pouvoir tourner à 50 Hz`] });
    } else if (h.pShaft > i.pump.motorKw) {
      add({ id: 'motor', sev: 'critical', cat: 'securite', title: 'Moteur sous-dimensionné',
        detail: `La pompe absorbe ${f1(h.pShaft, 2)} kW sur l'arbre pour un moteur de ${f1(i.pump.motorKw)} kW${i.fluid.rho > 1050 ? ` (liquide de densité ${f1(i.fluid.rho / 1000, 2)})` : ''}.`,
        consequences: ['Déclenchements du disjoncteur', 'Bobinage qui chauffe et grille'], parts: ['moteur', 'coffret', 'cable'],
        solutions: [`Moteur d'au moins ${f1(h.pShaft * 1.15)} kW`, 'Ou limiter le débit'] });
    } else if (h.pShaft > i.pump.motorKw * 0.95) {
      add({ id: 'motor', sev: 'warning', cat: 'securite', title: 'Moteur à sa limite', detail: `${f1(h.pShaft, 2)} kW absorbés pour ${f1(i.pump.motorKw)} kW.`,
        consequences: ['Échauffement en été, déclenchements'], parts: ['moteur'], solutions: ['Prévoir 10 à 15 % de réserve de puissance'] });
    } else if (h.pShaftMax > i.pump.motorKw * 1.05) {
      add({ id: 'motorrun', sev: 'info', cat: 'securite', title: 'Moteur non surdimensionné en bout de courbe',
        detail: `Si le réseau s'ouvre (casse, vidange), la puissance peut monter à ${f1(h.pShaftMax, 2)} kW.`, consequences: ['Déclenchement en cas de fuite importante'], parts: ['moteur'],
        solutions: ['Accepter (protection par disjoncteur) ou prendre la taille de moteur au-dessus'] });
    } else goods.push(`Moteur correctement dimensionné (${f1(h.pShaft, 2)} kW absorbés / ${f1(i.pump.motorKw)} kW)`);
  }

  // ---------- Accessoires ----------
  let missingReq = 0;
  for (const a of ACCESSORIES) {
    const n = needs[a.id];
    const on = !!i.acc[a.id]?.on;
    if (n === 'required' && !on) {
      missingReq++;
      const m = MISSING[a.id] ?? { sev: 'warning' as Sev, why: a.desc, consequences: [], parts: [] };
      const sev = a.id === 'clapet_ar' && refStatic(i) < 3 ? 'warning' : m.sev;
      add({ id: `miss_${a.id}`, sev, cat: a.side === 'ctrl' ? 'securite' : 'accessoires', title: `Manque : ${a.label}`, detail: m.why,
        consequences: m.consequences, parts: m.parts, solutions: [`Ajouter : ${a.label}`], fix: { label: 'Ajouter', apply: setAcc(a.id) } });
    } else if (n === 'recommended' && !on) {
      add({ id: `rec_${a.id}`, sev: 'info', cat: 'accessoires', title: `Conseillé : ${a.label}`, detail: a.desc, consequences: [], parts: [],
        solutions: [`Ajouter : ${a.label}`], fix: { label: 'Ajouter', apply: setAcc(a.id) } });
    } else if (n === 'avoid' && on) {
      const m = AVOID[a.id] ?? { why: 'Accessoire déconseillé pour cette application.', consequences: [], parts: [] };
      add({ id: `avoid_${a.id}`, sev: 'warning', cat: 'accessoires', title: `Déconseillé ici : ${a.label}`, detail: m.why, consequences: m.consequences, parts: m.parts,
        solutions: [`Retirer : ${a.label}`], fix: { label: 'Retirer', apply: setAcc(a.id, false) } });
    }
  }
  if (missingReq === 0) goods.push('Tous les accessoires requis pour cette application sont présents');

  // ---------- Énergie globale ----------
  if (h.ok && h.pElec > 0) {
    const useful = (i.fluid.rho * 9.81 * (h.q / 3600) * (h.hStatic + h.hPress)) / 1000;
    const glob = useful / h.pElec;
    if (glob < 0.3 && !out.some((x) => x.id === 'nohead')) {
      add({ id: 'eff', sev: 'warning', cat: 'energie', title: 'Rendement global faible',
        detail: `Seulement ${f0(glob * 100)} % de l'électricité sert à élever le liquide (le reste part en pertes et en rendement pompe ${f0(h.eta * 100)} %).`,
        consequences: [`Facture d'environ ${f0(h.costYear)} ${i.duty.currency}/an`], parts: [],
        solutions: ['Réduire les pertes de charge', 'Choisir une pompe au meilleur rendement sur le point réel', 'Variateur si le besoin varie'] });
    }
  }

  // ---------- Nappe phréatique : ce que le forage peut donner ----------
  const aq = aquiferOf(i, h.q);
  if (aq) {
    const g = i.geo, above = g.pumpDepth - g.dynamicLevel;
    if (!aq.known) {
      add({ id: 'aq_unknown', sev: 'info', cat: 'hydraulique', title: 'Débit de l\'essai de pompage non renseigné',
        detail: `Le niveau dynamique saisi (${f1(g.dynamicLevel)} m) est supposé mesuré au débit de la pompe (${f1(h.q)} m³/h). Sans le débit de l'essai, on ne peut pas vérifier que le forage suit, ni recalculer le niveau à un autre débit.`,
        consequences: ['Risque de dénoyer la pompe si le forage donne moins'], parts: [],
        solutions: ['Renseigner le débit de l\'essai de pompage (Conception › Site, niveaux et distances)'] });
    } else {
      const deeper = Math.ceil(g.staticLevel + h.q / aq.c + 3);
      if (h.q > aq.qMax + 0.05 || above < 2) {
        add({ id: 'aq_over', sev: 'critical', cat: 'hydraulique', title: 'La pompe pompe plus que le forage ne donne',
          detail: `Le forage donne ${f1(aq.qTest)} m³/h à l'essai pour ${f1(aq.dynTest - g.staticLevel)} m de rabattement (${f1(aq.c, 2)} m³/h par mètre). À ${f1(h.q)} m³/h, l'eau descend à ${f1(g.dynamicLevel)} m, ${above > 0 ? `à ${f1(above)} m seulement au-dessus` : 'sous l\'entrée'} de la pompe (${f1(g.pumpDepth)} m). Débit maxi pour garder 2 m d'eau au-dessus : ${f1(aq.qMax)} m³/h.`,
          consequences: ['La pompe se dénoie et aspire de l\'air', 'Marche à sec, moteur mal refroidi', 'Ensablement et colmatage du forage'], parts: ['moteur', 'garniture'],
          solutions: [`Pompe plus petite, ≈ ${f1(aq.qExp)} m³/h (80 % du débit d'essai)`, deeper <= g.boreDepth - 3 ? `Ou descendre la pompe à ${deeper} m` : 'Le forage n\'est pas assez profond pour descendre la pompe', 'Électrodes de manque d\'eau indispensables'],
          fix: deeper <= g.boreDepth - 3 ? { label: `Pompe à ${deeper} m`, apply: (x) => ({ ...x, geo: { ...x.geo, pumpDepth: deeper } }) } : undefined });
      } else if (h.q > aq.qTest * 1.02) {
        add({ id: 'aq_test', sev: 'warning', cat: 'hydraulique', title: 'Débit au-delà de l\'essai de pompage',
          detail: `La pompe donne ${f1(h.q)} m³/h, plus que les ${f1(aq.qTest)} m³/h de l'essai : le rabattement (${f1(g.dynamicLevel - g.staticLevel)} m) est extrapolé et l'eau entre plus vite dans le forage, ce qui entraîne du sable et colmate la crépine avec le temps.`,
          consequences: ['Vieillissement accéléré du forage', 'Eau chargée de sable'], parts: [],
          solutions: [`Exploiter à ${f1(aq.qExp)} m³/h au plus (80 % de l'essai)`, 'Faire un essai de pompage par paliers pour connaître le débit critique'] });
      }
      const bkA = backupOf(i);
      if (i.duty.qReq > aq.qExp * 1.02) {
        const dailyNeed = i.duty.qReq * 0.27 * 24, dailyBore = aq.qExp * 20;
        const tower = !!bkA && backupMode(bkA) === 'serie';
        add({ id: 'aq_need', sev: dailyNeed > dailyBore ? 'critical' : tower ? 'info' : 'warning', cat: 'hydraulique', title: dailyNeed > dailyBore ? 'Le forage ne couvre pas la consommation journalière' : 'Pointe de consommation supérieure au débit du forage',
          detail: dailyNeed > dailyBore
            ? `Il faut ≈ ${f0(dailyNeed)} m³ par jour, le forage en donne ≈ ${f0(dailyBore)} (${f1(aq.qExp)} m³/h pendant 20 h) : aucun réservoir ne compense.`
            : `La pointe (${f1(i.duty.qReq)} m³/h) dépasse ce que le forage donne durablement (${f1(aq.qExp)} m³/h), mais la journée est couverte (${f0(dailyNeed)} m³ pour ${f0(dailyBore)} possibles). ${tower ? 'Le château d\'eau absorbe les pointes : c\'est la bonne solution.' : 'Un château d\'eau en série absorberait les pointes, la pompe tournant à débit modéré.'}`,
          consequences: dailyNeed > dailyBore ? ['Pénurie quotidienne'] : tower ? [] : ['Pompe dénoyée aux heures de pointe'], parts: [],
          solutions: dailyNeed > dailyBore ? ['Second forage', 'Réduire la consommation'] : tower ? ['Pompe dimensionnée sur le débit d\'exploitation, pas sur la pointe'] : ['Château d\'eau en série (Conception › Réservoir surélevé)'] });
      }
      if (h.q <= aq.qMax && above >= 2) goods.push(`Forage : ${f1(aq.qTest)} m³/h à l'essai (${f1(aq.c, 2)} m³/h par mètre de rabattement) ; à ${f1(h.q)} m³/h, l'eau se stabilise à ${f1(g.dynamicLevel)} m, ${f1(above)} m au-dessus de la pompe`);
    }
  }

  // ---------- Incendie : règles des installations de pompage incendie ----------
  if (i.app === 'incendie') {
    const fc = fireCfg(i);
    const std = fc.kind === 'sprinkler' ? 'EN 12845 / APSAD R1' : 'NF S 62-201 (RIA)';
    // Aspiration : hauteur limitée, une conduite par pompe, vitesse et diamètre minimaux
    if (i.mode === 'aspiration') {
      if (i.geo.suctionLift > 3.2) add({ id: 'fire_lift', sev: 'critical', cat: 'aspiration', title: 'Hauteur d\'aspiration trop grande pour une pompe incendie',
        detail: `${f1(i.geo.suctionLift)} m entre le niveau bas de la réserve et l'axe de la pompe : une pompe incendie en aspiration est limitée à 3,2 m (${std}). Au-delà, le moindre défaut d'étanchéité la désamorce.`,
        consequences: ['Pompe désamorcée au moment de l\'incendie', 'Non-conformité'], parts: ['garniture', 'roue'],
        solutions: ['Poser les pompes en charge, sous le niveau bas de la réserve (solution à privilégier)', 'Sinon : abaisser les pompes à 3,2 m au plus du niveau bas'],
        fix: { label: 'Pompes en charge', apply: (x) => ({ ...x, mode: 'charge', geo: { ...x.geo, chargeHead: Math.max(0.5, x.geo.chargeHead || 0.5) } }) } });
      if (nRun(i) + (i.pump.standby ?? 0) > 1) add({ id: 'fire_asp_sep', sev: 'info', cat: 'aspiration', title: 'Une aspiration par pompe',
        detail: 'En aspiration, chaque pompe incendie doit avoir sa propre conduite, son clapet de pied et son réservoir d\'amorçage : une fuite sur une aspiration commune désamorcerait toutes les pompes. Le devis en tient compte.',
        consequences: [], parts: [], solutions: [`${(i.pump.count ?? 1)} conduites d'aspiration indépendantes`] });
    }
    if (i.mode !== 'immergee' && (h.vAsp > 1.5 || i.asp.dn < 65)) add({ id: 'fire_vasp', sev: 'warning', cat: 'aspiration', title: 'Conduite d\'aspiration incendie trop petite',
      detail: `DN${i.asp.dn}, ${f1(h.vAsp, 2)} m/s : une aspiration incendie doit faire au moins DN65 avec une vitesse de 1,5 m/s au plus.`,
      consequences: ['Pertes à l\'aspiration, NPSH réduit au débit maximal'], parts: [],
      solutions: [`Aspiration en DN${Math.max(65, nextDn(i.asp.dn))}`], fix: { label: `Aspiration DN${Math.max(65, nextDn(i.asp.dn))}`, apply: (x) => withPipe(x, 'asp', Math.max(65, nextDn(x.asp.dn))) } });
    // Courbe : à 140 % du débit nominal, au moins 70 % de la pression, et NPSH suffisant
    if (h.ok) {
      const q0 = i.duty.qReq, q14 = 1.4 * q0, n = nRun(i);
      const h0 = pumpHead(i, q0), h14 = pumpHead(i, q14);
      const npsha14 = ((patm(i.geo.altitude) - vaporPressure(i)) * 1000) / rhoG + suctionZ(i) - losses(i, q14).asp;
      const npshr14 = pumpNpshr(i, q14 / n);
      if (h14 < 0.7 * h0) add({ id: 'fire_140', sev: 'warning', cat: 'hydraulique', title: 'Courbe trop plongeante à 140 % du débit',
        detail: `À ${f1(q14)} m³/h (140 %), la pompe ne donne plus que ${f0(h14)} m, soit ${f0((h14 / Math.max(1, h0)) * 100)} % de sa hauteur au débit nominal : il en faut au moins 70 % (${std}).`,
        consequences: ['Pression insuffisante si plus de têtes ou de RIA s\'ouvrent que prévu'], parts: [], solutions: ['Pompe à courbe plus plate (roue plus large, autre modèle)'] });
      if (npsha14 < npshr14 + 1) add({ id: 'fire_npsh140', sev: i.mode === 'aspiration' ? 'critical' : 'warning', cat: 'aspiration', title: 'Cavitation à 140 % du débit',
        detail: `À ${f1(q14)} m³/h, NPSH disponible ${f1(npsha14)} m pour ${f1(npshr14)} m requis (+1 m de marge) : la pompe cavite précisément quand l'incendie demande le plus d'eau.`,
        consequences: ['Chute de débit en plein incendie', 'Roue érodée'], parts: ['roue'], solutions: ['Pompes en charge', 'Aspiration plus grosse et plus courte'] });
    }
    // Réserve d'eau : débit × durée
    const need = (i.duty.qReq * fc.duration) / 60;
    if (fc.reserve == null) add({ id: 'fire_reserve_unk', sev: 'info', cat: 'hydraulique', title: 'Réserve d\'eau incendie à vérifier',
      detail: `Il faut au moins ${f1(need)} m³ utiles (${f1(i.duty.qReq)} m³/h pendant ${fc.duration} min), au-dessus de la plaque anti-vortex.`, consequences: [], parts: [], solutions: ['Renseigner la réserve disponible (Conception › Besoin et énergie)'] });
    else if (fc.reserve < need) add({ id: 'fire_reserve', sev: 'critical', cat: 'hydraulique', title: 'Réserve d\'eau incendie insuffisante',
      detail: `${f1(fc.reserve)} m³ pour ${f1(need)} m³ nécessaires (${f1(i.duty.qReq)} m³/h pendant ${fc.duration} min) : l'eau manquerait avant la fin de l'intervention.`,
      consequences: ['Plus d\'eau avant la fin de l\'extinction'], parts: [], solutions: [`Réserve d'au moins ${Math.ceil(need)} m³ utiles`] });
    // Pompe de secours électrique sur le même réseau (sans diesel)
    if ((i.pump.standby ?? 0) > 0 && !i.acc.diesel?.on && fc.kind === 'sprinkler') { /* couvert par « Manque : motopompe diesel » */ }
    const okList = ['coffret_inc', 'alim_inc', 'jockey', 'essai', 'soupape_circ', 'alarme_inc'].every((k) => i.acc[k]?.on);
    if (okList && (i.pump.standby ?? 0) > 0 && (i.mode !== 'aspiration' || i.geo.suctionLift <= 3.2)) goods.push(`Installation incendie (${std}) : pompe de secours${i.acc.diesel?.on ? ' diesel' : ''}, pompe jockey, démarrage automatique et arrêt manuel, circuit d'essai, alimentation prioritaire`);
  }

  // ---------- Crépine du forage : position de la pompe, fentes, vitesse d'entrée ----------
  const scr = screenOf(i);
  if (isForageI(i) && !scr) add({ id: 'scr_unknown', sev: 'info', cat: 'hydraulique', title: 'Crépine du forage non renseignée',
    detail: 'Sans la position et l\'ouverture de la crépine (rapport de forage), on ne peut pas vérifier que la pompe est posée au bon endroit, que la crépine reste noyée ni qu\'elle ne se colmatera pas.',
    consequences: [], parts: [], solutions: ['Renseigner la crépine (Conception › Site, niveaux et distances)'] });
  if (scr && h.ok) {
    const c = screenCalc(i, scr, h.q), g = i.geo;
    const cm = (v: number) => (v * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 });
    const upTo = Math.floor(scr.top - 2);
    const canRaise = upTo >= g.dynamicLevel + 3;
    if (c.pos === 'inside') add({ id: 'scr_inside', sev: i.acc.chemise?.on ? 'info' : 'warning', cat: 'hydraulique', title: 'Pompe posée dans la zone crépinée',
      detail: `La pompe (${f0(g.pumpDepth)} m) est entre ${f0(scr.top)} et ${f0(scr.bottom)} m, au droit des fentes : l'eau arrive de côté et ne longe plus le moteur${i.acc.chemise?.on ? ' (la chemise de refroidissement compense)' : ''}, la pompe aspire les fines et le sable, et la crépine se colmate plus vite.`,
      consequences: i.acc.chemise?.on ? ['Entraînement de fines'] : ['Moteur mal refroidi', 'Eau sableuse', 'Colmatage accéléré'], parts: ['moteur', 'roue'],
      solutions: [canRaise ? `Remonter la pompe à ${upTo} m (2 m au-dessus de la crépine)` : 'Le niveau dynamique est trop bas pour remonter la pompe au-dessus de la crépine', 'Sinon : chemise de refroidissement obligatoire'],
      fix: canRaise ? { label: `Pompe à ${upTo} m`, apply: (x) => ({ ...x, geo: { ...x.geo, pumpDepth: upTo } }) } : !i.acc.chemise?.on ? { label: 'Ajouter une chemise', apply: (x) => ({ ...x, acc: { ...x.acc, chemise: { ...(x.acc.chemise ?? { dn: 0, qty: 1 }), on: true } } }) } : undefined });
    if (c.pos === 'below') add({ id: 'scr_below', sev: 'warning', cat: 'hydraulique', title: 'Pompe sous la crépine, dans le décanteur',
      detail: `La pompe (${f0(g.pumpDepth)} m) est sous le bas de la crépine (${f0(scr.bottom)} m), là où se déposent le sable et les boues.`,
      consequences: ['Pompe qui s\'ensable', 'Usure rapide de la roue'], parts: ['roue', 'bagues'],
      solutions: [canRaise ? `Remonter la pompe à ${upTo} m` : 'Remonter la pompe au-dessus du décanteur'], fix: canRaise ? { label: `Pompe à ${upTo} m`, apply: (x) => ({ ...x, geo: { ...x.geo, pumpDepth: upTo } }) } : undefined });
    if (c.sump < 3) add({ id: 'scr_sump', sev: 'info', cat: 'hydraulique', title: 'Pompe proche du fond du forage',
      detail: `${f1(c.sump)} m seulement entre la pompe et le fond : les dépôts finissent par l'atteindre.`, consequences: ['Pompe qui s\'ensable avec le temps'], parts: [], solutions: ['Garder au moins 3 m sous la pompe'] });
    const aqS = aquiferOf(i, h.q);
    if (c.dewater > 0.5) {
      const qDew = aqS ? aqS.c * Math.max(0, scr.top - g.staticLevel) : 0;
      add({ id: 'scr_dewater', sev: 'warning', cat: 'hydraulique', title: 'La crépine se dénoie en pompage',
        detail: `À ${f1(h.q)} m³/h, l'eau descend à ${f1(g.dynamicLevel)} m, sous le haut de la crépine (${f0(scr.top)} m) : ${f1(c.dewater)} m de fentes sont à l'air. L'oxygène fait précipiter le fer et le calcaire, les bactéries ferrugineuses s'y installent : la crépine se colmate et le forage perd son débit.`,
        consequences: ['Colmatage par incrustations', 'Débit du forage qui baisse d\'année en année', 'Eau rouge (fer)'], parts: [],
        solutions: [qDew > 0.3 ? `Limiter le débit à ${f1(qDew)} m³/h pour garder la crépine noyée` : 'Réduire le débit', 'Pompage plus long à débit plus faible (variateur, château d\'eau)'] });
    }
    if (c.vIn > 0.03) add({ id: 'scr_vin', sev: c.vIn > 0.05 ? 'warning' : 'info', cat: 'hydraulique', title: 'L\'eau entre trop vite dans la crépine',
      detail: `Vitesse d'entrée ${cm(c.vIn)} cm/s pour 3 cm/s au plus (${f1(c.len)} m de crépine ${scr.type === 'inox' ? 'inox à fil enroulé' : 'PVC fendue'}, ${f0(c.openRatio * 100)} % de vide) : pertes de charge, entraînement de fines, colmatage et incrustation rapides.`,
      consequences: ['Rabattement plus fort', 'Colmatage accéléré', 'Eau sableuse'], parts: [],
      solutions: [`Pomper au plus ${f1(c.qVmax)} m³/h`, 'Crépine plus longue ou inox à fil enroulé (3 à 4 fois plus de vide) au prochain forage'] });
    if (c.slotK > 1.5) add({ id: 'scr_slot_big', sev: 'warning', cat: 'hydraulique', title: 'Fentes de crépine trop larges pour le terrain',
      detail: `Fentes de ${f1(scr.slot, 2)} mm pour ${f1(c.slotRec, 2)} mm conseillés (${FORMATIONS[scr.formation].label.toLowerCase()}${scr.pack ? ', avec massif filtrant' : ', sans massif filtrant'}) : le terrain passe à travers, le forage produit du sable.`,
      consequences: ['Eau sableuse', 'Usure rapide de la roue et des bagues', 'Pompe qui s\'ensable'], parts: ['roue', 'bagues'],
      solutions: ['Débit réduit et progressif au démarrage', 'Pompe tolérante au sable, posée bien au-dessus de la crépine', 'Décanteur ou dessableur en surface'] });
    else if (c.slotK < 0.6) add({ id: 'scr_slot_fine', sev: 'info', cat: 'hydraulique', title: 'Fentes de crépine fines',
      detail: `Fentes de ${f1(scr.slot, 2)} mm pour ${f1(c.slotRec, 2)} mm conseillés : elles retiennent bien le terrain mais freinent l'eau et se colmatent plus vite.`,
      consequences: ['Colmatage plus rapide'], parts: [], solutions: ['Nettoyage / régénération du forage plus fréquents'] });
    if (c.pos === 'above' && c.dewater <= 0.5 && c.vIn <= 0.03 && c.slotK >= 0.6 && c.slotK <= 1.5)
      goods.push(`Crépine ${f0(scr.top)}–${f0(scr.bottom)} m, fentes ${f1(scr.slot, 2)} mm adaptées au terrain, vitesse d'entrée ${cm(c.vIn)} cm/s, pompe ${f1(c.gap)} m au-dessus : crépine noyée, moteur bien refroidi`);
  }

  // ---------- Électricité, réservoir à vessie, solaire ----------
  const el = electrical(i, h);
  out.push(...el.issues);
  goods.push(...el.goods);

  // ---------- Réservoir de secours en by-pass (forage sous pression) ----------
  if (backupApplies(i)) {
    const b = backupOf(i);
    if (!b) {
      const pr = backupProposal(i);
      add({ id: 'rec_backup', sev: 'info', cat: 'accessoires', title: 'Réservoir surélevé (château d\'eau) conseillé',
        detail: `La maison dépend uniquement de la pompe : en cas de panne, de coupure ou de manque d'eau dans le forage, plus une goutte. Un réservoir surélevé de ${pr.volume.toLocaleString('fr-FR')} L rempli par la pompe (robinet à flotteur, pressostat) servirait la maison par gravité et donnerait environ ${pr.autonomyH} h de réserve ; la pompe ne tournerait que pour le remplir, en longs cycles.`,
        consequences: ['Aucune réserve en cas de panne ou de coupure'], parts: [],
        solutions: [`Ajouter un réservoir de ${pr.volume.toLocaleString('fr-FR')} L sur un support de ${pr.height} m`],
        fix: { label: `Ajouter un château d'eau de ${pr.volume.toLocaleString('fr-FR')} L`, apply: (x) => ({ ...x, backup: backupProposal(x) }) } });
    } else {
      const c = backupCalc(i, b);
      // La cuve se remplit par le haut (robinet à flotteur) : la pompe doit pouvoir y monter, au-dessus de la pression
      // d'arrêt moins une marge, sinon elle ne se remplit qu'en fin de cycle, ou jamais.
      const vr = el.r.vessel;
      const vfd = !!(i.acc.variateur?.on && i.acc.capteur_p?.on);
      const pHi = vr ? (vfd ? vfdSet(el.r) : vr.pOff) : 3;
      const hMax = Math.floor(((pHi - 0.4) * 1e5) / rhoG - Math.max(0, i.geo.hRef) - c.tankH - 0.3);
      if (c.headTop >= pHi - 0.2) {
        const canRaise = !!vr && !vfd && c.headTop + 0.4 <= vr.pMax - 0.2;
        const pOn2 = vr ? Math.ceil((c.headTop - 0.3) * 10) / 10 : 0, pOff2 = vr ? Math.min(Math.floor((vr.pMax - 0.2) * 10) / 10, Math.ceil((c.headTop + 0.6) * 10) / 10) : 0;
        add({ id: 'bk_pon', sev: 'critical', cat: 'hydraulique', title: 'Le réservoir ne peut pas se remplir',
          detail: `Pour remplir une cuve posée à ${f0(b.height)} m (${f0(Math.max(0, i.geo.hRef))} m plus haut que la tête de forage), il faut ${f1(c.headTop)} bar en tête de forage, alors que ${vfd ? 'la consigne du variateur' : 'le pressostat coupe'} à ${f1(pHi)} bar : le robinet à flotteur ne reçoit presque rien.`,
          consequences: ['Réserve vide le jour d\'une panne'], parts: [],
          solutions: [hMax >= c.hMin ? `Baisser le réservoir à ${hMax} m` : `Hauteur maxi ${Math.max(0, hMax)} m : trop bas pour une bonne pression`, canRaise ? `Ou régler le pressostat à ${f1(pOn2)} / ${f1(pOff2)} bar (la pompe monte à ${f1(vr!.pMax)} bar)` : 'Ou une pompe plus haute en pression'],
          fix: canRaise && hMax < c.hMin ? { label: `Pressostat ${f1(pOn2)} / ${f1(pOff2)} bar`, apply: (x) => ({ ...x, acc: { ...x.acc, vessie: { ...x.acc.vessie, on: true, pOn: pOn2, pOff: pOff2, pre: Math.round((pOn2 - 0.2) * 10) / 10 } } }) }
            : hMax >= c.hMin ? { label: `Réservoir à ${hMax} m`, apply: (x) => ({ ...x, backup: { ...b, height: hMax } }) } : undefined });
      }
      if (b.height < c.hMin) add({ id: 'bk_low', sev: 'warning', cat: 'hydraulique', title: 'Réservoir de secours trop bas',
        detail: `Posé à ${f0(b.height)} m, il ne donnerait que ${f1(c.pHouse)} bar aux robinets : un filet d'eau.`,
        consequences: ['Débit très faible aux robinets pendant une panne'], parts: [],
        solutions: [`Support d'au moins ${c.hMin} m (conseillé ${c.hRec} m)`], fix: { label: `Support de ${c.hRec} m`, apply: (x) => ({ ...x, backup: { ...b, height: c.hRec } }) } });
      if (b.volume < c.volRec * 0.7) add({ id: 'bk_small', sev: 'warning', cat: 'hydraulique', title: 'Réservoir de secours trop petit',
        detail: `${b.volume.toLocaleString('fr-FR')} L tiennent environ ${f1(c.autonomyH)} h à la consommation moyenne (${f1(c.avgM3h, 2)} m³/h), pour ${b.autonomyH} h souhaitées.`,
        consequences: ['Autonomie insuffisante en cas de panne'], parts: [],
        solutions: [`Réservoir de ${c.volRec.toLocaleString('fr-FR')} L`], fix: { label: `${c.volRec.toLocaleString('fr-FR')} L`, apply: (x) => ({ ...x, backup: { ...b, volume: c.volRec } }) } });
      const serie = backupMode(b) === 'serie';
      // Château d'eau en série : flotteur ouvert, la pression en tête de forage tombe à la charge du réservoir.
      // Le pressostat doit relancer AU-DESSUS de cette charge, sinon la pompe ne repart jamais.
      if (serie && vr && !vfd && vr.pOn < c.headTop + 0.1) {
        const pOn2 = Math.ceil((c.headTop + 0.3) * 10) / 10, pOff2 = Math.min(Math.floor((vr.pMax - 0.2) * 10) / 10, Math.round((pOn2 + 1) * 10) / 10);
        const ok2 = pOff2 >= pOn2 + 0.5;
        add({ id: 'bk_restart', sev: 'critical', cat: 'hydraulique', title: 'La pompe ne redémarrera pas quand le réservoir baisse',
          detail: `Flotteur ouvert, la pression en tête de forage descend jusqu'à la charge du réservoir (${f1(c.headTop)} bar) et s'y arrête, alors que le pressostat ne relance qu'à ${f1(vr.pOn)} bar : la cuve se vide et la pompe reste arrêtée.`,
          consequences: ['Réservoir vide, plus d\'eau à la maison'], parts: [],
          solutions: [ok2 ? `Régler le pressostat à ${f1(pOn2)} / ${f1(pOff2)} bar (précharge ${f1(pOn2 - 0.2)} bar)` : `Baisser le réservoir à ${hMax} m ou pompe plus haute en pression`],
          fix: ok2 ? { label: `Pressostat ${f1(pOn2)} / ${f1(pOff2)} bar`, apply: (x) => ({ ...x, acc: { ...x.acc, vessie: { ...x.acc.vessie, on: true, pOn: pOn2, pOff: pOff2, pre: Math.round((pOn2 - 0.2) * 10) / 10 } } }) } : undefined });
      }
      if (!serie && h.ok && h.q < i.duty.qReq + c.fillM3h * 0.5) add({ id: 'bk_fill', sev: 'info', cat: 'hydraulique', title: 'Remplissage du réservoir de secours lent',
        detail: `La pompe donne ${f1(h.q)} m³/h : en pointe, il reste peu de débit pour remplir le réservoir (${f1(c.fillH)} h pour un remplissage complet hors pointe).`,
        consequences: ['Réserve incomplète après une longue panne'], parts: [], solutions: ['Robinet à flotteur réglé pour un remplissage hors pointe, ou pompe un peu plus forte'] });
      if (serie && b.height >= c.hMin && b.volume >= c.volRec * 0.7 && c.headTop < pHi - 0.2 && (!vr || vfd || vr.pOn >= c.headTop + 0.1))
        goods.push(`Château d'eau ${b.volume.toLocaleString('fr-FR')} L à ${f0(b.height)} m en série : maison toujours servie par gravité (${f1(c.pHouse)} bar), ${f1(c.autonomyH)} h de réserve en cas de panne, la pompe ne tourne que pour le remplir${floatKind(b) === 'differentiel' ? ` (cycles longs de ${floatLow(b) * 100 | 0} à 100 %)` : ''}`);
      else if (!serie && b.height >= c.hMin && b.volume >= c.volRec * 0.7 && c.headTop < pHi - 0.2)
        goods.push(`Réservoir de secours ${b.volume.toLocaleString('fr-FR')} L à ${f0(b.height)} m : ${f1(c.autonomyH)} h d'autonomie, ${f1(c.pHouse)} bar aux robinets en cas de panne`);
    }
  }

  // ---------- Valeurs par défaut non vérifiées (n'entre pas dans la note) ----------
  const dl = defaultsLeft(i);
  if (dl.length) add({ id: 'defaults', sev: 'info', cat: 'hydraulique', title: `${dl.length} valeur${dl.length > 1 ? 's' : ''} par défaut à vérifier`,
    detail: `Ces valeurs n'ont pas encore été saisies : ${dl.map((x) => x.label).join(', ')}. Les résultats en dépendent directement.`,
    consequences: ['Calculs faux si le site est différent'], parts: [], solutions: ['Mesurer sur site et remplacer chaque valeur marquée « par défaut » dans la page Conception'] });

  // ---------- Note ----------
  const W: Record<Sev, number> = { critical: 16, warning: 6, info: 1 };
  let score = 100 - out.filter((x) => x.id !== 'defaults' && x.id !== 'aq_unknown' && x.id !== 'scr_unknown').reduce((s, x) => s + W[x.sev], 0);
  const nCrit = out.filter((x) => x.sev === 'critical').length;
  if (nCrit) score = Math.min(score, 54 - (nCrit - 1) * 6);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const cats = Object.fromEntries((Object.keys(CAT_LABEL) as Category[]).map((c) => {
    const s = 100 - out.filter((x) => x.cat === c).reduce((t, x) => t + ({ critical: 45, warning: 18, info: 4 } as const)[x.sev], 0);
    return [c, Math.max(0, s)];
  })) as Record<Category, number>;
  const verdict = score >= 85
    ? { label: 'Excellente installation', level: 'excellent' as const, text: 'Installation conforme aux règles de l\'art. Quelques optimisations restent possibles.' }
    : score >= 70 ? { label: 'Bonne installation', level: 'good' as const, text: 'Installation correcte, à améliorer sur les points signalés.' }
      : score >= 55 ? { label: 'Acceptable avec réserves', level: 'fair' as const, text: 'Fonctionnera, mais avec une usure ou une consommation excessive. Corrigez les alertes.' }
        : { label: 'Mauvaise installation', level: 'bad' as const, text: 'Des défauts critiques vont provoquer des pannes. À corriger avant mise en service.' };

  // ---------- Pièces exposées ----------
  const rank: Record<Sev, number> = { critical: 0, warning: 1, info: 2 };
  const pm = new Map<string, { sev: Sev; causes: string[] }>();
  for (const x of out) for (const p of x.parts) {
    const cur = pm.get(p);
    if (!cur) pm.set(p, { sev: x.sev, causes: [x.title] });
    else { if (rank[x.sev] < rank[cur.sev]) cur.sev = x.sev; if (!cur.causes.includes(x.title)) cur.causes.push(x.title); }
  }
  const parts = [...pm.entries()].map(([id, v]) => ({ id, label: PARTS[id] ?? id, ...v }))
    .sort((a, b) => rank[a.sev] - rank[b.sev] || b.causes.length - a.causes.length);

  out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  // Un bouton « Corriger » qui ne changerait rien est retiré
  const ref = JSON.stringify(i);
  for (const x of out) if (x.fix) { try { if (JSON.stringify(ensureElec(x.fix.apply(i))) === ref) x.fix = undefined; } catch { x.fix = undefined; } }
  return { hydro: h, issues: out, goods, score, verdict, cats, parts, needs, elec: el.r };
}

export { APPS };

/** Pompe redimensionnée sur le besoin (débit demandé, hauteur réelle du réseau) */
function sized(i: Installation): Installation { return proposePump(i); }

/** Que faire quand la pompe est trop à droite de sa courbe (débit > 120 % de son optimum) */
function rightSolutions(i: Installation, h: Hydro, vfdHelps: boolean): string[] {
  const nr = Math.max(1, (i.pump.count ?? 1) - (i.pump.standby ?? 0));
  const p = sized(i).pump;
  const f1 = (v: number) => v.toFixed(1).replace('.', ',');
  const out: string[] = [];
  out.push(`Choisir une pompe dont le débit optimal est proche du besoin : environ ${f1(p.qn)} m³/h à ${Math.round(p.hn)} m${nr > 1 ? ' par pompe' : ''} (moteur ${String(p.motorKw).replace('.', ',')} kW), au lieu de ${f1(i.pump.qn)} m³/h à ${Math.round(i.pump.hn)} m`);
  const over = h.q > i.duty.qReq * 1.05;
  if (over && !vfdHelps) {
    // Le variateur n'aide que si, ralentie jusqu'au besoin, la pompe revient dans sa plage (70–120 %)
    const sp = speedFor(i, i.duty.qReq, staticHead(i) + pressureHead(i) + losses(i, i.duty.qReq).total);
    const xv = Number.isFinite(sp) && sp > 0.3 && sp < 1 ? (i.duty.qReq / h.n) / (i.pump.qn * sp) : NaN;
    if (xv >= 0.7 && xv <= 1.2) out.push(i.acc.variateur?.on ? 'Régler la consigne du variateur sur le besoin réel' : `Ou ajouter un variateur réglé sur ${f1(i.duty.qReq)} m³/h (≈ ${Math.round(50 * sp)} Hz) : la pompe revient à ${Math.round(xv * 100)} % de son débit optimal`);
    else out.push(`Un variateur ne suffirait pas : ralentie jusqu'au besoin, la pompe resterait à ${Number.isFinite(xv) ? `${Math.round(xv * 100)} %` : 'plus de 120 %'} de son débit optimal. Une vanne non plus : elle ne ramène le débit qu'au besoin (${Math.round((i.duty.qReq / h.n / i.pump.qn) * 100)} % de l'optimum). Il faut une autre pompe`);
  }
  if (over && (i.duty.qReq / h.n) / i.pump.qn <= 1.2) out.push('En dépannage seulement : fermer partiellement la vanne de refoulement jusqu\'au débit demandé (consomme de l\'énergie, à remplacer par une pompe adaptée)');
  if (!over) out.push(`Le débit obtenu (${f1(h.q)} m³/h) ne dépasse pas le besoin : freiner ne servirait à rien, c'est la pompe qui est trop petite en débit pour ce point`);
  if (h.pShaft > i.pump.motorKw * 0.95) out.push(`Vérifier la puissance moteur : ${f1(h.pShaft)} kW absorbés pour ${String(i.pump.motorKw).replace('.', ',')} kW installés`);
  return out;
}
