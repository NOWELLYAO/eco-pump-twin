import type { Installation } from './types';
import type { SimKind } from './sim';

/** Familles de pannes. */
export type FaultCat = 'hydraulique' | 'eau' | 'accessoire' | 'electrique' | 'reseau' | 'equipement';
export const FAULT_CAT: Record<FaultCat, string> = {
  hydraulique: 'Hydraulique', eau: 'Manque d\'eau', accessoire: 'Accessoires', electrique: 'Électrique', reseau: 'Réseau électrique', equipement: 'Pompe / moteur',
};

/** Symptômes mesurables ou constatables, utilisés pour le diagnostic. */
export type Sym =
  | 'debit_bas' | 'debit_nul' | 'pression_basse' | 'pression_haute' | 'courant_haut' | 'courant_bas'
  | 'depression_forte' | 'cycles_courts' | 'ronfle' | 'ne_demarre_pas' | 'ne_s_arrete_pas'
  | 'debordement' | 'pas_de_tension' | 'marche_a_sec' | 'pression_tombe_arret' | 'bruit' | 'fuite_visible'
  | 'decl_thermique' | 'decl_diff' | 'decl_manque_eau' | 'decl_variateur' | 'tension_basse' | 'marche_sans_commande';

export const SYM_LABEL: Record<Sym, string> = {
  debit_bas: 'Débit plus faible que prévu', debit_nul: 'Pompe en marche sans débit', pression_basse: 'Pression basse',
  pression_haute: 'Pression trop haute', courant_haut: 'Courant moteur élevé', courant_bas: 'Courant moteur faible',
  depression_forte: 'Forte dépression à l\'aspiration', cycles_courts: 'Démarrages trop fréquents',
  decl_thermique: 'Disjoncteur moteur déclenché', decl_diff: 'Différentiel déclenché', decl_manque_eau: 'Relais manque d\'eau déclenché', decl_variateur: 'Variateur en défaut',
  tension_basse: 'Tension mesurée trop basse', marche_sans_commande: 'Moteur en marche, voyant de commande éteint',
  ronfle: 'Moteur qui ronfle sans tourner', ne_demarre_pas: 'La pompe ne démarre pas', ne_s_arrete_pas: 'La pompe ne s\'arrête pas',
  debordement: 'Débordement', pas_de_tension: 'Pas de tension au coffret', marche_a_sec: 'Marche à sec',
  pression_tombe_arret: 'La pression chute pompe arrêtée', bruit: 'Bruit / vibrations anormaux', fuite_visible: 'Fuite de liquide visible',
};

export interface FaultEffect {
  inst?: (i: Installation) => Installation; // effet hydraulique permanent
  ampsK?: number; // courant × k
  tripAfter?: number; // secondes de marche avant déclenchement
  tripMsg?: string;
  tripKind?: 'decl_thermique' | 'decl_diff' | 'decl_variateur';
  tripAtStart?: string; // déclenche dès la mise sous tension du moteur
  noStart?: boolean; // moteur bloqué : ronfle, ne tourne pas
  outage?: number; // coupure secteur (s)
  noStop?: boolean; // contacteur collé
  primeLoss?: boolean; // désamorçage à chaque arrêt
  leak?: number; // fuite sur le réseau (fraction du besoin)
  backflow?: boolean; // retour d'eau à l'arrêt
  vesselK?: number; // part du réservoir encore utile
  sensorZero?: boolean; // capteur de pression lu à 0
  floatPit?: 'high' | 'low'; // flotteur de fosse bloqué
  floatRes?: boolean; // flotteur du réservoir bloqué
  drawdown?: number; // le niveau baisse de N m par heure de pompage
  pswitch?: 'stuck' | 'drift';
  tripLocal?: boolean; // le déclenchement ne concerne qu'une pompe (pas le réseau ni le coffret commun)
}

export interface FaultDef {
  id: string;
  cat: FaultCat;
  label: string;
  what: string; // ce qui s'est passé (affiché après diagnostic)
  applies: (i: Installation, k: SimKind) => boolean;
  effect: FaultEffect;
  sig: Sym[]; // signature attendue
  field: string[]; // constats sur le terrain (bruit, odeur, fuite…)
  checks: string[]; // comment le vérifier
  fix: string[]; // réparation
  parts: string[];
  target: string; // élément à montrer sur le schéma
}

const on = (i: Installation, id: string) => !!i.acc[id]?.on;
const tri = (i: Installation) => i.elec.supply !== 'mono' && i.elec.supply !== 'solaire';
const vfd = (i: Installation) => i.elec.supply === 'solaire' || !!i.acc.variateur?.on;
const surfaceAsp = (i: Installation) => i.mode === 'aspiration';
const pressureKind = (k: SimKind) => k === 'vessel' || k === 'vfd';
const scale = (i: Installation, q: number, h: number, e = 1): Installation => ({ ...i, pump: { ...i.pump, qn: i.pump.qn * q, hn: i.pump.hn * h, eta: i.pump.eta * e } });

export const FAULTS: FaultDef[] = [
  // ---------------- Hydraulique ----------------
  {
    id: 'air_asp', cat: 'hydraulique', label: 'Prise d\'air à l\'aspiration', target: 'asp',
    what: 'Un raccord ou un joint de la conduite d\'aspiration n\'est plus étanche : la pompe aspire de l\'air avec l\'eau.',
    applies: (i) => surfaceAsp(i), effect: { inst: (i) => scale(i, 0.8, 0.78, 0.85), ampsK: 0.85 },
    sig: ['debit_bas', 'pression_basse', 'courant_bas', 'bruit'], field: ['Bruit de « gravier » irrégulier', 'Aiguille du manomètre qui oscille', 'Bulles dans l\'eau au refoulement'],
    checks: ['Arroser les raccords d\'aspiration pompe en marche : le bruit change à l\'endroit de la fuite', 'Contrôler les joints de brides et les colliers', 'Vérifier l\'immersion de la crépine (vortex)'],
    fix: ['Refaire l\'étanchéité (joints, téflon, colle PVC)', 'Remplacer le raccord fissuré', 'Ré-amorcer la pompe'], parts: ['garniture', 'roue'],
  },
  {
    id: 'clapet_pied_fuit', cat: 'hydraulique', label: 'Clapet de pied qui fuit', target: 'acc:clapet_pied',
    what: 'Le clapet de pied ne ferme plus (corps étranger, ressort cassé) : la conduite d\'aspiration se vide à chaque arrêt.',
    applies: (i, k) => surfaceAsp(i) && on(i, 'clapet_pied') && k !== 'continuous', effect: { primeLoss: true },
    sig: ['debit_nul', 'marche_a_sec', 'courant_bas', 'decl_manque_eau'], field: ['Après un arrêt, la pompe redémarre mais ne débite plus', 'Corps de pompe chaud', 'Vacuomètre à zéro'],
    checks: ['Arrêter la pompe et observer le vacuomètre / le niveau dans la conduite', 'Remplir la pompe : si elle se vide en quelques minutes, le clapet fuit', 'Remonter et inspecter le clapet'],
    fix: ['Nettoyer ou remplacer le clapet de pied', 'Protéger par une crépine plus fine', 'Garder la protection manque d\'eau'], parts: ['garniture', 'roue'],
  },
  {
    id: 'clapet_ar_fuit', cat: 'hydraulique', label: 'Clapet anti-retour non étanche', target: 'acc:clapet_ar',
    what: 'Le clapet anti-retour laisse revenir l\'eau vers la pompe quand elle est arrêtée.',
    applies: (i, k) => on(i, 'clapet_ar') && (k === 'vessel' || k === 'tank'), effect: { backflow: true },
    sig: ['pression_tombe_arret', 'cycles_courts'], field: ['La pompe redémarre sans que personne ne puise', 'Bruit d\'écoulement à l\'arrêt', 'La pompe tourne parfois à l\'envers juste après l\'arrêt'],
    checks: ['Fermer la vanne après le clapet pompe arrêtée : si la pression tient, le clapet fuit', 'Observer le manomètre pompe arrêtée'],
    fix: ['Démonter et nettoyer le clapet', 'Remplacer le clapet (ou son joint)'], parts: ['clapet', 'moteur', 'coffret'],
  },
  {
    id: 'roue_bouchee', cat: 'hydraulique', label: 'Roue partiellement bouchée', target: 'pump',
    what: 'Des débris (fibres, feuilles, sable) obstruent les canaux de la roue.',
    applies: () => true, effect: { inst: (i) => scale(i, 0.75, 0.75, 0.8), ampsK: 0.92 },
    sig: ['debit_bas', 'pression_basse', 'bruit'], field: ['Vibrations', 'Débit nettement plus faible qu\'à la mise en service'],
    checks: ['Comparer pression vanne fermée avec la courbe (elle est plus basse)', 'Ouvrir le corps de pompe et inspecter la roue'],
    fix: ['Nettoyer la roue', 'Installer ou nettoyer la crépine / le préfiltre'], parts: ['roue', 'roulements'],
  },
  {
    id: 'vanne_fermee', cat: 'hydraulique', label: 'Vanne de refoulement fermée par erreur', target: 'acc:vanne_ref',
    what: 'Quelqu\'un a refermé (ou presque) la vanne de refoulement.',
    applies: (i, k) => on(i, 'vanne_ref') && k !== 'vfd' && k !== 'solar', effect: { inst: (i) => ({ ...i, acc: { ...i.acc, vanne_ref: { ...i.acc.vanne_ref, on: true, qty: 9000 } } }), ampsK: 0.7 },
    sig: ['debit_nul', 'pression_haute', 'courant_bas'], field: ['Pompe qui chauffe', 'Pression maximale au manomètre, pas d\'eau en sortie'],
    checks: ['Vérifier la position de toutes les vannes', 'Manomètre = pression à débit nul de la courbe'],
    fix: ['Ouvrir la vanne', 'Plomber / étiqueter la vanne en position ouverte'], parts: ['garniture', 'roulements'],
  },
  {
    id: 'fuite_reseau', cat: 'hydraulique', label: 'Fuite ou casse sur le réseau', target: 'ref',
    what: 'Une canalisation est fissurée ou cassée après la pompe.',
    applies: (_i, k) => pressureKind(k) || k === 'tank' || k === 'continuous', effect: { leak: 0.45, inst: (i) => ({ ...i, duty: { ...i.duty, pRes: Math.max(0, i.duty.pRes - 0.8) } }) },
    sig: ['debit_bas', 'pression_basse', 'cycles_courts', 'fuite_visible'], field: ['La pompe tourne beaucoup plus longtemps', 'Zone humide ou affaissement sur le tracé', 'Consommation d\'énergie en hausse'],
    checks: ['Relever le compteur la nuit (aucune consommation normale)', 'Fermer les tronçons un à un pour localiser la fuite', 'Inspecter le tracé'],
    fix: ['Réparer la conduite (manchon de réparation)', 'Contrôler le coup de bélier si la casse est due à une surpression'], parts: ['tuyauterie', 'moteur'],
  },
  // ---------------- Manque d'eau ----------------
  {
    id: 'source_tarie', cat: 'eau', label: 'La source se tarit', target: 'source',
    what: 'Le niveau d\'eau baisse plus vite qu\'il ne se recharge (forage surexploité, bâche non alimentée, saison sèche).',
    applies: (_i, k) => k !== 'pit', effect: { drawdown: 6 },
    sig: ['debit_bas', 'debit_nul', 'marche_a_sec', 'courant_bas', 'decl_manque_eau', 'depression_forte'], field: ['Le débit baisse au fil de la journée puis s\'arrête', 'Eau trouble ou sableuse', 'Bruit de cavitation'],
    checks: ['Mesurer le niveau (sonde lumineuse) pompe en marche', 'Comparer avec le niveau dynamique de l\'essai de pompage', 'Vérifier l\'alimentation de la bâche'],
    fix: ['Réduire le débit (vanne, variateur) ou la durée de pompage', 'Descendre la pompe si le forage le permet', 'Protection manque d\'eau obligatoire'], parts: ['garniture', 'roue', 'moteur', 'diffuseurs'],
  },
  {
    id: 'crepine_colmatee', cat: 'eau', label: 'Crépine ou filtre colmaté', target: 'acc:crepine',
    what: 'La crépine ou le filtre d\'aspiration est bouché par des dépôts : la pompe manque d\'eau.',
    applies: (i) => ['crepine', 'filtre_asp', 'prefiltre', 'clapet_pied'].some((x) => on(i, x)),
    effect: { inst: (i) => { const acc = { ...i.acc }; for (const x of ['crepine', 'filtre_asp', 'prefiltre', 'clapet_pied']) if (acc[x]?.on) acc[x] = { ...acc[x], qty: (acc[x].qty || 1) * 90 }; return { ...i, acc }; } },
    sig: ['debit_bas', 'depression_forte', 'pression_basse', 'bruit'], field: ['Bruit de cavitation (gravier)', 'Vacuomètre très bas'],
    checks: ['Lire le vacuomètre : bien plus bas qu\'à la mise en service', 'Démonter et inspecter la crépine / le filtre'],
    fix: ['Nettoyer la crépine / le panier', 'Planifier un nettoyage périodique', 'Suspendre la crépine au-dessus du fond'], parts: ['roue'],
  },
  // ---------------- Accessoires ----------------
  {
    id: 'vessie_crevee', cat: 'accessoire', label: 'Vessie crevée / précharge perdue', target: 'acc:vessie',
    what: 'La membrane du réservoir est percée ou l\'air de précharge s\'est échappé : le réservoir est plein d\'eau et n\'amortit plus.',
    applies: (i, k) => k === 'vessel' && on(i, 'vessie'), effect: { vesselK: 0.06 },
    sig: ['cycles_courts', 'pression_haute', 'pression_basse'], field: ['La pompe démarre à chaque ouverture de robinet', 'Claquements du contacteur', 'De l\'eau sort par la valve de gonflage'],
    checks: ['Pompe arrêtée et réseau vidé, mesurer la précharge à la valve', 'Appuyer sur la valve : s\'il sort de l\'eau, la vessie est percée', 'Taper sur le réservoir : il sonne « plein »'],
    fix: ['Regonfler à la précharge conseillée (marche − 0,2 bar)', 'Remplacer la vessie ou le réservoir'], parts: ['moteur', 'coffret', 'clapet'],
  },
  {
    id: 'pressostat_colle', cat: 'accessoire', label: 'Pressostat collé (contact soudé)', target: 'acc:pressostat',
    what: 'Le contact du pressostat reste fermé : il ne commande plus l\'arrêt.',
    applies: (i, k) => k === 'vessel' && on(i, 'pressostat'), effect: { pswitch: 'stuck' },
    sig: ['ne_s_arrete_pas', 'pression_haute', 'courant_bas'], field: ['La pompe tourne en permanence', 'Pression maximale au manomètre', 'Pompe et eau qui chauffent'],
    checks: ['Comparer pression lue et seuil d\'arrêt', 'Débrancher le pressostat : contact fermé à l\'ohmmètre alors que la pression dépasse l\'arrêt'],
    fix: ['Remplacer le pressostat', 'Ajouter une sécurité pression haute'], parts: ['garniture', 'roulements', 'moteur'],
  },
  {
    id: 'pressostat_deregle', cat: 'accessoire', label: 'Pressostat déréglé', target: 'acc:pressostat',
    what: 'Les seuils du pressostat ont dérivé de 1 bar vers le bas.',
    applies: (i, k) => k === 'vessel' && on(i, 'pressostat'), effect: { pswitch: 'drift' },
    sig: ['pression_basse'], field: ['Faible pression aux étages', 'Les usagers du haut se plaignent'],
    checks: ['Relever pression de marche et d\'arrêt au manomètre', 'Comparer aux réglages prévus'],
    fix: ['Régler le pressostat (vis de marche puis d\'écart)', 'Ajuster la précharge du réservoir'], parts: [],
  },
  {
    id: 'capteur_hs', cat: 'accessoire', label: 'Capteur de pression en panne', target: 'acc:capteur_p',
    what: 'Le capteur 4-20 mA envoie 0 bar au variateur (câble coupé ou capteur HS).',
    applies: (i, k) => k === 'vfd' && on(i, 'capteur_p'), effect: { sensorZero: true },
    sig: ['pression_haute', 'ne_s_arrete_pas', 'courant_haut'], field: ['Le variateur affiche 0 bar et tourne à 50 Hz', 'Coups de bélier, robinets qui sifflent'],
    checks: ['Comparer l\'affichage du variateur et le manomètre', 'Mesurer le courant du capteur (4 mA = 0 bar)', 'Vérifier le câble du capteur'],
    fix: ['Remplacer le capteur ou le câble', 'Paramétrer un défaut « perte capteur » sur le variateur'], parts: ['tuyauterie', 'joints', 'moteur'],
  },
  {
    id: 'flotteur_haut', cat: 'accessoire', label: 'Flotteur d\'arrêt bloqué en haut', target: 'acc:flotteur_arret',
    what: 'Le flotteur d\'arrêt est coincé (câble emmêlé, graisses) : il ne commande plus l\'arrêt quand la fosse est vide.',
    applies: (_i, k) => k === 'pit', effect: { floatPit: 'high' },
    sig: ['ne_s_arrete_pas', 'marche_a_sec', 'courant_bas'], field: ['Pompe qui tourne fosse vide', 'Bruit d\'aspiration d\'air (« slurp »)', 'Moteur chaud'],
    checks: ['Ouvrir la fosse et regarder le flotteur', 'Basculer le flotteur à la main : la pompe doit s\'arrêter'],
    fix: ['Dégager / nettoyer le flotteur', 'Fixer les câbles sur un support', 'Ajouter un flotteur de sécurité'], parts: ['garniture', 'moteur'],
  },
  {
    id: 'flotteur_bas', cat: 'accessoire', label: 'Flotteur de marche bloqué en bas', target: 'acc:flotteur_marche',
    what: 'Le flotteur de marche est coincé en bas : il ne commande plus le démarrage.',
    applies: (_i, k) => k === 'pit', effect: { floatPit: 'low' },
    sig: ['ne_demarre_pas', 'debordement'], field: ['La fosse se remplit sans que la pompe démarre', 'Alarme niveau très haut'],
    checks: ['Soulever le flotteur à la main : la pompe doit démarrer', 'Mesurer la continuité du flotteur'],
    fix: ['Dégager ou remplacer le flotteur', 'Tester l\'alarme de niveau haut'], parts: [],
  },
  {
    id: 'flotteur_res', cat: 'accessoire', label: 'Flotteur du réservoir bloqué', target: 'acc:flotteur_res',
    what: 'Le flotteur du réservoir haut reste en position « vide » : la pompe ne s\'arrête plus.',
    applies: (i, k) => k === 'tank' && on(i, 'flotteur_res'), effect: { floatRes: true },
    sig: ['ne_s_arrete_pas', 'debordement'], field: ['Le château d\'eau déborde', 'La pompe tourne en continu'],
    checks: ['Monter au réservoir et vérifier le flotteur', 'Contrôler le câble ou la liaison radio du flotteur'],
    fix: ['Dégager ou remplacer le flotteur', 'Ajouter un flotteur de sécurité trop-plein'], parts: [],
  },
  // ---------------- Électrique ----------------
  {
    id: 'perte_phase', cat: 'electrique', label: 'Perte d\'une phase', target: 'cable',
    what: 'Un fusible, une borne ou un pôle du contacteur ne conduit plus : le moteur ne reçoit que deux phases.',
    applies: (i) => tri(i) && !vfd(i), effect: { noStart: true, ampsK: 1.7, tripAfter: 25, tripMsg: 'Disjoncteur moteur déclenché (surcharge : marche sur 2 phases)', tripKind: 'decl_thermique' },
    sig: ['ronfle', 'ne_demarre_pas', 'courant_haut', 'decl_thermique'], field: ['Moteur qui ronfle sans démarrer', 'Odeur de chaud'],
    checks: ['Mesurer la tension entre phases en amont et en aval du contacteur', 'Mesurer le courant sur les 3 phases (une à zéro)', 'Contrôler fusibles et serrage des bornes'],
    fix: ['Remplacer le fusible / resserrer la borne', 'Remplacer le contacteur si un pôle est brûlé', 'Installer un relais de contrôle de phases'], parts: ['moteur', 'coffret', 'cable'],
  },
  {
    id: 'condensateur', cat: 'electrique', label: 'Condensateur de démarrage HS', target: 'cable',
    what: 'Le condensateur du moteur monophasé a perdu sa capacité : le moteur n\'a plus de couple de démarrage.',
    applies: (i) => i.elec.supply === 'mono', effect: { noStart: true, ampsK: 3, tripAfter: 15, tripMsg: 'Protection thermique déclenchée (rotor bloqué)', tripKind: 'decl_thermique' },
    sig: ['ronfle', 'ne_demarre_pas', 'courant_haut', 'decl_thermique'], field: ['Moteur qui ronfle', 'Démarre si on lance l\'arbre à la main'],
    checks: ['Mesurer la capacité du condensateur (µF de la plaque)', 'Condensateur gonflé ou qui fuit'],
    fix: ['Remplacer le condensateur à la même valeur (µF et tension)'], parts: ['moteur', 'coffret'],
  },
  {
    id: 'isolement', cat: 'electrique', label: 'Défaut d\'isolement du câble / moteur', target: 'cable',
    what: 'L\'isolant du câble ou du bobinage est abîmé (humidité, câble blessé) : du courant fuit vers la terre.',
    applies: () => true, effect: { tripAtStart: 'Différentiel déclenché (défaut d\'isolement)', tripKind: 'decl_diff' },
    sig: ['decl_diff', 'ne_demarre_pas'], field: ['Le différentiel saute dès la mise en marche', 'Parfois après une pluie'],
    checks: ['Mesurer l\'isolement au mégohmmètre (500 V) entre chaque phase et la terre : > 2 MΩ attendu', 'Isoler câble et moteur pour localiser'],
    fix: ['Refaire la jonction (kit de jonction immergée)', 'Remplacer le câble ou rebobiner le moteur'], parts: ['cable', 'moteur'],
  },
  {
    id: 'contacteur_colle', cat: 'electrique', label: 'Contacteur collé', target: 'cable',
    what: 'Les contacts du contacteur sont soudés : le moteur reste alimenté même quand l\'automatisme demande l\'arrêt.',
    applies: (i, k) => !vfd(i) && k !== 'continuous', effect: { noStop: true },
    sig: ['ne_s_arrete_pas', 'marche_sans_commande', 'pression_haute', 'debordement'], field: ['Voyant marche éteint mais moteur qui tourne', 'Bruit de contacteur absent à l\'arrêt'],
    checks: ['Couper la commande : si le moteur tourne encore, le contacteur est collé', 'Inspecter les contacts (brûlés, soudés)'],
    fix: ['Remplacer le contacteur', 'Vérifier le calibre (AC-3) et le nombre de démarrages'], parts: ['coffret', 'moteur'],
  },
  {
    id: 'defaut_variateur', cat: 'electrique', label: 'Défaut variateur (surtension)', target: 'cable',
    what: 'Le variateur se met en défaut de surtension du bus continu (décélération trop rapide, réseau instable).',
    applies: (i) => vfd(i), effect: { tripAfter: 600, tripMsg: 'Variateur en défaut OV (surtension bus DC)', tripKind: 'decl_variateur' },
    sig: ['decl_variateur'], field: ['Code défaut affiché sur le variateur (OV, OU…)'],
    checks: ['Lire l\'historique des défauts du variateur', 'Vérifier la rampe de décélération et la tension réseau'],
    fix: ['Allonger la rampe de décélération', 'Activer le réarmement automatique (3 essais)', 'Résistance de freinage si nécessaire'], parts: ['coffret'],
  },
  // ---------------- Réseau électrique ----------------
  {
    id: 'coupure', cat: 'reseau', label: 'Coupure de courant (45 min)', target: 'cable',
    what: 'Coupure du réseau électrique (délestage), puis retour du courant.',
    applies: (i) => i.elec.supply !== 'solaire', effect: { outage: 45 * 60 },
    sig: ['pas_de_tension', 'ne_demarre_pas', 'pression_basse'], field: ['Tous les voyants éteints', 'Plus d\'eau chez les usagers'],
    checks: ['Vérifier la tension en tête de coffret', 'Vérifier le compteur et le disjoncteur général'],
    fix: ['Attendre le retour du courant : redémarrage automatique', 'Prévoir un groupe électrogène ou un réservoir tampon'], parts: [],
  },
  {
    id: 'sous_tension', cat: 'reseau', label: 'Tension trop basse (−15 %)', target: 'cable',
    what: 'Le réseau ne délivre que 85 % de la tension nominale : le moteur absorbe plus de courant pour la même puissance.',
    applies: (i) => i.elec.supply !== 'solaire', effect: { ampsK: 1.2, tripAfter: 50 * 60, tripMsg: 'Disjoncteur moteur déclenché (surchauffe par sous-tension)', tripKind: 'decl_thermique' },
    sig: ['tension_basse', 'courant_haut', 'decl_thermique'], field: ['Lumières qui baissent au démarrage', 'Moteur chaud au toucher'],
    checks: ['Mesurer la tension au coffret, moteur en marche', 'Mesurer la chute de tension dans le câble'],
    fix: ['Signaler au distributeur', 'Augmenter la section du câble', 'Régulateur de tension ou variateur'], parts: ['moteur', 'coffret', 'cable'],
  },
  // ---------------- Pompe / moteur ----------------
  {
    id: 'roulements', cat: 'equipement', label: 'Roulements usés', target: 'pump',
    what: 'Les roulements du moteur sont usés (graisse dégradée, défaut d\'alignement).',
    applies: () => true, effect: { inst: (i) => scale(i, 1, 1, 0.9), ampsK: 1.15, tripAfter: 4 * 3600, tripMsg: 'Disjoncteur moteur déclenché (surcharge mécanique)', tripKind: 'decl_thermique' },
    sig: ['courant_haut', 'bruit', 'decl_thermique'], field: ['Bruit de grondement ou sifflement', 'Vibrations', 'Palier chaud'],
    checks: ['Écouter au stéthoscope / tournevis', 'Mesurer la température des paliers', 'Tourner l\'arbre à la main, moteur consigné : point dur'],
    fix: ['Remplacer les roulements', 'Vérifier l\'alignement et la fixation'], parts: ['roulements', 'arbre'],
  },
  {
    id: 'garniture', cat: 'equipement', label: 'Garniture mécanique qui fuit', target: 'pump',
    what: 'La garniture mécanique est usée (marche à sec, sable) : l\'eau fuit le long de l\'arbre.',
    applies: (i) => i.mode !== 'immergee', effect: { leak: 0.04 },
    sig: ['fuite_visible'], field: ['Goutte-à-goutte ou filet d\'eau sous la pompe', 'Traces de rouille sur la lanterne'],
    checks: ['Observer la lanterne entre pompe et moteur', 'Rechercher des traces de marche à sec'],
    fix: ['Remplacer la garniture mécanique', 'Supprimer la cause (marche à sec, sable)'], parts: ['garniture', 'roulements'],
  },
  {
    id: 'rotation', cat: 'equipement', label: 'Sens de rotation inversé', target: 'pump',
    what: 'Deux phases ont été inversées lors d\'une intervention : la pompe tourne à l\'envers.',
    applies: (i) => tri(i), effect: { inst: (i) => scale(i, 0.55, 0.45, 0.6) },
    sig: ['debit_bas', 'pression_basse', 'courant_bas', 'bruit'], field: ['Le ventilateur tourne dans le mauvais sens (flèche)', 'Bruit inhabituel'],
    checks: ['Comparer le sens de rotation à la flèche du carter', 'Vérifier la pression vanne fermée'],
    fix: ['Inverser deux phases au bornier', 'Installer un relais d\'ordre des phases'], parts: ['roue'],
  },
];

export const faultById = (id: string) => FAULTS.find((f) => f.id === id);
/** Pannes propres à une pompe / un départ : avec plusieurs pompes, les autres prennent le relais. */
export const LOCAL_FAULTS = new Set(['perte_phase', 'condensateur', 'contacteur_colle', 'defaut_variateur', 'roulements', 'rotation', 'roue_bouchee', 'garniture']);

/** Applique les effets hydrauliques permanents des pannes actives. */
export function applyFaults(i: Installation, ids: string[]): Installation {
  let x = i;
  for (const id of ids) { const f = faultById(id); if (f?.effect.inst) x = f.effect.inst(x); }
  return x;
}

/** Effet combiné des pannes actives. */
export function combined(ids: string[]): FaultEffect & { ids: string[] } {
  const e: FaultEffect & { ids: string[] } = { ids };
  for (const id of ids) {
    const f = faultById(id);
    if (!f) continue;
    const x = f.effect;
    if (x.ampsK) e.ampsK = (e.ampsK ?? 1) * x.ampsK;
    if (x.tripAfter != null && x.tripAfter < (e.tripAfter ?? Infinity)) { e.tripAfter = x.tripAfter; e.tripMsg = x.tripMsg; e.tripKind = x.tripKind; e.tripLocal = LOCAL_FAULTS.has(id); }
    if (x.tripAtStart) { e.tripAtStart = x.tripAtStart; e.tripKind = x.tripKind; }
    if (x.noStart) e.noStart = true;
    if (x.outage) e.outage = x.outage;
    if (x.noStop) e.noStop = true;
    if (x.primeLoss) e.primeLoss = true;
    if (x.leak) e.leak = (e.leak ?? 0) + x.leak;
    if (x.backflow) e.backflow = true;
    if (x.vesselK) e.vesselK = x.vesselK;
    if (x.sensorZero) e.sensorZero = true;
    if (x.floatPit) e.floatPit = x.floatPit;
    if (x.floatRes) e.floatRes = true;
    if (x.drawdown) e.drawdown = x.drawdown;
    if (x.pswitch) e.pswitch = x.pswitch;
  }
  return e;
}

/** Classe les pannes possibles selon les symptômes observés. */
export function diagnose(obs: Sym[], candidates: FaultDef[]): { f: FaultDef; score: number; match: Sym[] }[] {
  if (!obs.length) return [];
  const o = new Set(obs);
  if (o.has('debit_nul')) o.add('debit_bas');
  const scored = candidates.map((f) => {
    const sig = new Set(f.sig);
    const match = f.sig.filter((s) => o.has(s));
    const miss = obs.filter((s) => !sig.has(s) && !(s === 'debit_nul' && sig.has('debit_bas'))).length;
    const raw = match.length === 0 ? 0 : match.length / f.sig.length + match.length / obs.length - 0.15 * miss;
    return { f, score: Math.max(0, raw), match };
  }).filter((x) => x.score > 0.15).sort((a, b) => b.score - a.score);
  const tot = scored.slice(0, 4).reduce((a, b) => a + b.score, 0) || 1;
  return scored.slice(0, 4).map((x) => ({ ...x, score: x.score / tot }));
}

/** Gravité des symptômes, pour la note en service. */
export const SYM_WEIGHT: Record<Sym, number> = {
  decl_thermique: 25, decl_diff: 30, decl_manque_eau: 25, decl_variateur: 25, pas_de_tension: 25, marche_a_sec: 25, debit_nul: 20,
  debordement: 20, ne_s_arrete_pas: 18, ronfle: 18, ne_demarre_pas: 12, pression_haute: 10, cycles_courts: 10, depression_forte: 8,
  courant_haut: 8, pression_basse: 8, debit_bas: 8, pression_tombe_arret: 6, courant_bas: 4, bruit: 5, fuite_visible: 5,
  tension_basse: 8, marche_sans_commande: 15,
};

