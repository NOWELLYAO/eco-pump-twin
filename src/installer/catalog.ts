import type { AppId, Compat, FluidId, Installation, ModeId, Need, PipeMatId, PumpMatId, PumpTypeId } from './types';

export const APPS: Record<AppId, { label: string; desc: string; pumps: PumpTypeId[]; fluid: FluidId; dest: 'reservoir' | 'batiment' | 'irrigation' | 'regard' | 'cuve' | 'bassin' | 'incendie' }> = {
  forage: { label: 'Forage / adduction d\'eau', desc: 'Captage en forage vers château d\'eau ou réseau', pumps: ['immergee_forage'], fluid: 'eau_forage', dest: 'reservoir' },
  surpression: { label: 'Surpression bâtiment', desc: 'Pression constante aux étages', pumps: ['multi_v', 'multi_h', 'surface'], fluid: 'eau_claire', dest: 'batiment' },
  irrigation: { label: 'Irrigation', desc: 'Asperseurs, goutte-à-goutte, pivot', pumps: ['surface', 'multi_h', 'auto_amorcante', 'immergee_forage'], fluid: 'eau_brute', dest: 'irrigation' },
  relevage: { label: 'Relevage eaux usées', desc: 'Poste de relevage, fosse, assainissement', pumps: ['submersible_relevage'], fluid: 'eaux_usees', dest: 'regard' },
  drainage: { label: 'Drainage / épuisement', desc: 'Fouilles, caves, eaux d\'infiltration', pumps: ['drainage_immergee', 'auto_amorcante'], fluid: 'eau_brute', dest: 'regard' },
  transfert: { label: 'Transfert de réservoir', desc: 'Bâche vers réservoir, process', pumps: ['surface', 'multi_h', 'multi_v', 'auto_amorcante'], fluid: 'eau_claire', dest: 'reservoir' },
  incendie: { label: 'Incendie (RIA / sprinklers)', desc: 'Groupe de surpression incendie', pumps: ['surface', 'multi_v'], fluid: 'eau_claire', dest: 'incendie' },
  carburant: { label: 'Transfert d\'hydrocarbures', desc: 'Gasoil, fioul, huiles', pumps: ['auto_amorcante', 'surface'], fluid: 'gasoil', dest: 'cuve' },
  piscine: { label: 'Piscine / filtration', desc: 'Recirculation et filtration', pumps: ['auto_amorcante', 'surface'], fluid: 'eau_piscine', dest: 'bassin' },
};

export const PUMP_TYPES: Record<PumpTypeId, { label: string; modes: ModeId[]; selfPriming: boolean; tmax: number; passage: number; desc: string }> = {
  surface: { label: 'Centrifuge de surface (monobloc normalisée)', modes: ['charge', 'aspiration'], selfPriming: false, tmax: 90, passage: 8, desc: 'Robuste, bon rendement ; ne s\'amorce pas seule.' },
  auto_amorcante: { label: 'Auto-amorçante', modes: ['aspiration', 'charge'], selfPriming: true, tmax: 60, passage: 6, desc: 'S\'amorce seule une fois le corps rempli ; rendement plus faible.' },
  multi_h: { label: 'Multicellulaire horizontale', modes: ['charge', 'aspiration'], selfPriming: false, tmax: 90, passage: 2, desc: 'Haute pression ; sensible au sable et au NPSH.' },
  multi_v: { label: 'Multicellulaire verticale', modes: ['charge', 'aspiration'], selfPriming: false, tmax: 110, passage: 2, desc: 'Compacte, haute pression ; idéale en charge.' },
  immergee_forage: { label: 'Immergée de forage (3" à 12")', modes: ['immergee'], selfPriming: true, tmax: 35, passage: 2, desc: 'Moteur immergé refroidi par l\'eau qui le longe.' },
  submersible_relevage: { label: 'Submersible de relevage (vortex / monocanal)', modes: ['immergee'], selfPriming: true, tmax: 40, passage: 50, desc: 'Grand passage libre pour eaux chargées.' },
  drainage_immergee: { label: 'Pompe de drainage immergée', modes: ['immergee'], selfPriming: true, tmax: 35, passage: 10, desc: 'Épuisement d\'eaux claires ou peu chargées.' },
};

export const MODES: Record<ModeId, { label: string; desc: string }> = {
  aspiration: { label: 'En aspiration', desc: 'Le liquide est sous la pompe : elle doit l\'aspirer.' },
  charge: { label: 'En charge', desc: 'Le liquide est au-dessus de la pompe : il arrive par gravité.' },
  immergee: { label: 'Immergée', desc: 'La pompe est plongée dans le liquide.' },
};

export interface FluidDef { label: string; rho: number; nu: number; solidsPct: number; particleMm: number; sandGm3: number; ph: number; temp: number; water: boolean; pv?: number; note: string }
export const FLUIDS: Record<FluidId, FluidDef> = {
  eau_claire: { label: 'Eau claire', rho: 998, nu: 1.0, solidsPct: 0, particleMm: 0.1, sandGm3: 0, ph: 7.2, temp: 20, water: true, note: 'Eau potable ou de réseau.' },
  eau_forage: { label: 'Eau de forage', rho: 999, nu: 1.0, solidsPct: 0.01, particleMm: 0.5, sandGm3: 20, ph: 6.8, temp: 27, water: true, note: 'Peut contenir du sable et être agressive.' },
  eau_brute: { label: 'Eau brute (rivière, lac, bassin)', rho: 1000, nu: 1.0, solidsPct: 0.3, particleMm: 5, sandGm3: 80, ph: 7.0, temp: 26, water: true, note: 'Matières en suspension, débris végétaux.' },
  eaux_usees: { label: 'Eaux usées domestiques', rho: 1010, nu: 1.3, solidsPct: 1.5, particleMm: 40, sandGm3: 150, ph: 7.5, temp: 25, water: true, note: 'Fibres, lingettes, H₂S corrosif.' },
  boues: { label: 'Eaux très chargées / boues', rho: 1150, nu: 25, solidsPct: 10, particleMm: 25, sandGm3: 3000, ph: 7.5, temp: 25, water: true, note: 'Abrasives et visqueuses.' },
  eau_mer: { label: 'Eau de mer / saumâtre', rho: 1025, nu: 1.05, solidsPct: 0.05, particleMm: 1, sandGm3: 30, ph: 8.1, temp: 26, water: true, note: 'Chlorures : très corrosive pour fontes et aciers.' },
  eau_chaude: { label: 'Eau chaude', rho: 975, nu: 0.4, solidsPct: 0, particleMm: 0.1, sandGm3: 0, ph: 7.5, temp: 70, water: true, note: 'Tension de vapeur élevée : NPSH critique.' },
  gasoil: { label: 'Gasoil / fioul', rho: 840, nu: 4, solidsPct: 0, particleMm: 0.1, sandGm3: 0, ph: 7, temp: 25, water: false, pv: 0.5, note: 'Inflammable : matériel ATEX, liaison équipotentielle.' },
  huile: { label: 'Huile (hydraulique / moteur)', rho: 880, nu: 100, solidsPct: 0, particleMm: 0.1, sandGm3: 0, ph: 7, temp: 30, water: false, pv: 0.1, note: 'Visqueuse : rendement et débit réduits.' },
  eau_piscine: { label: 'Eau de piscine (chlorée)', rho: 998, nu: 0.9, solidsPct: 0.01, particleMm: 2, sandGm3: 5, ph: 7.3, temp: 27, water: true, note: 'Chlore et sel : corrosion des aciers.' },
};

export const PIPE_MATS: Record<PipeMatId, { label: string; rough: number; celerity: number; tmax: number; color: string }> = {
  pvc: { label: 'PVC pression', rough: 0.0015, celerity: 350, tmax: 45, color: '#8a96a3' },
  pehd: { label: 'PEHD (polyéthylène)', rough: 0.007, celerity: 250, tmax: 40, color: '#2b2f33' },
  ppr: { label: 'PPR (polypropylène)', rough: 0.007, celerity: 300, tmax: 70, color: '#3f9a54' },
  galva: { label: 'Acier galvanisé', rough: 0.15, celerity: 1100, tmax: 80, color: '#a9b4bd' },
  acier: { label: 'Acier noir / carbone', rough: 0.05, celerity: 1200, tmax: 200, color: '#5d5248' },
  inox: { label: 'Inox 316', rough: 0.015, celerity: 1150, tmax: 200, color: '#c9d1d8' },
  fonte: { label: 'Fonte ductile revêtue', rough: 0.03, celerity: 1100, tmax: 100, color: '#4a4f57' },
  cuivre: { label: 'Cuivre', rough: 0.0015, celerity: 1100, tmax: 110, color: '#c27a3a' },
  flexible: { label: 'Flexible spiralé renforcé', rough: 0.05, celerity: 150, tmax: 50, color: '#3a8fd1' },
};

export const PUMP_MATS: Record<PumpMatId, string> = {
  fonte: 'Fonte grise',
  fonte_bronze: 'Fonte, roue bronze',
  inox304: 'Inox 304',
  inox316: 'Inox 316',
  bronze: 'Bronze',
  thermoplastique: 'Thermoplastique',
  fonte_chrome: 'Fonte au chrome (anti-abrasion)',
};

const PUMP_COMPAT: Partial<Record<FluidId, Partial<Record<PumpMatId, Compat>>>> = {
  eau_forage: { fonte: 'warn' },
  eaux_usees: { bronze: 'warn', thermoplastique: 'warn', inox304: 'ok' },
  boues: { fonte: 'warn', inox304: 'warn', inox316: 'warn', bronze: 'bad', thermoplastique: 'bad', fonte_bronze: 'warn' },
  eau_mer: { fonte: 'bad', fonte_chrome: 'bad', fonte_bronze: 'warn', inox304: 'bad', inox316: 'warn' },
  gasoil: { thermoplastique: 'warn' },
  huile: { thermoplastique: 'warn' },
  eau_piscine: { fonte: 'warn', inox304: 'warn', fonte_chrome: 'warn' },
};
const PIPE_COMPAT: Partial<Record<FluidId, Partial<Record<PipeMatId, Compat>>>> = {
  eau_forage: { galva: 'warn', acier: 'warn' },
  eau_brute: { acier: 'warn' },
  eaux_usees: { galva: 'bad', cuivre: 'bad', acier: 'warn' },
  boues: { pvc: 'warn', galva: 'warn', cuivre: 'bad', ppr: 'warn' },
  eau_mer: { galva: 'bad', acier: 'bad', cuivre: 'warn', fonte: 'warn', inox: 'warn' },
  gasoil: { pvc: 'bad', galva: 'bad', pehd: 'warn', ppr: 'warn', flexible: 'warn' },
  huile: { pvc: 'warn', galva: 'warn', flexible: 'warn' },
  eau_piscine: { acier: 'bad', galva: 'warn', cuivre: 'warn' },
};
export const pumpCompat = (f: FluidId, m: PumpMatId): Compat => PUMP_COMPAT[f]?.[m] ?? 'ok';
export const pipeCompat = (f: FluidId, m: PipeMatId): Compat => PIPE_COMPAT[f]?.[m] ?? 'ok';

export const PARTS: Record<string, string> = {
  roue: 'Roue (impulseur)',
  bagues: 'Bagues d\'usure',
  garniture: 'Garniture mécanique',
  roulements: 'Roulements',
  arbre: 'Arbre',
  corps: 'Corps de pompe / volute',
  diffuseurs: 'Étages / diffuseurs',
  moteur: 'Moteur (bobinage)',
  accouplement: 'Accouplement / lanterne',
  clapet: 'Clapet anti-retour',
  crepine: 'Crépine / clapet de pied',
  membrane: 'Membrane du réservoir',
  joints: 'Joints et brides',
  tuyauterie: 'Tuyauteries',
  cable: 'Câble immergé',
  coffret: 'Coffret (contacteur, protections)',
  flotteurs: 'Flotteurs / sondes',
  vanne: 'Vannes',
};

export const DN_LIST = [15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300];
export const nextDn = (dn: number) => DN_LIST.find((d) => d > dn) ?? dn;

export type Side = 'asp' | 'ref' | 'ctrl';
export type Glyph = 'gate' | 'check' | 'ball' | 'foot' | 'strainer' | 'ystrainer' | 'basket' | 'eccentric' | 'concentric' | 'flex' | 'gauge' | 'flowmeter' | 'ptx' | 'pswitch' | 'vessel' | 'surge' | 'airvalve' | 'relief' | 'drain' | 'panel' | 'vfd' | 'float' | 'probe' | 'electrode' | 'jacket' | 'rails' | 'atex';

export interface AccDef {
  id: string;
  label: string;
  side: Side;
  k: number; // coefficient de perte singulière (à son DN)
  glyph: Glyph;
  tag?: string; // préfixe P&ID
  desc: string;
  inline: boolean; // monté sur la conduite (DN pertinent)
  need: (i: Installation) => Need;
}

const isImm = (i: Installation) => i.mode === 'immergee';
const solids = (i: Installation) => i.fluid.solidsPct > 0.2 || i.fluid.particleMm > 3;
const surpr = (i: Installation) => i.app === 'surpression' || i.app === 'incendie';
const lift = (i: Installation) => (i.app === 'relevage' || i.app === 'drainage');
const fire = (i: Installation) => i.app === 'incendie';
const sprinkler = (i: Installation) => fire(i) && i.fire?.kind === 'sprinkler';
/** Applications à réseau sous pression : les seules où pressostat, réservoir à vessie et capteur de pression ont un sens. */
const PRESSURE_APPS = new Set<Installation['app']>(['surpression', 'incendie', 'irrigation', 'forage', 'transfert']);

/** Catalogue d'accessoires, dans l'ordre de montage depuis la source vers l'utilisation. */
export const ACCESSORIES: AccDef[] = [
  // ----- Aspiration -----
  { id: 'clapet_pied', label: 'Clapet de pied crépine', side: 'asp', k: 2.5, glyph: 'foot', desc: 'Garde la conduite d\'aspiration pleine à l\'arrêt.', inline: true,
    need: (i) => isImm(i) ? 'na' : i.mode === 'aspiration' ? (PUMP_TYPES[i.pumpType].selfPriming && !fire(i) ? 'optional' : 'required') : 'na' },
  { id: 'crepine', label: 'Crépine d\'aspiration', side: 'asp', k: 1.0, glyph: 'strainer', desc: 'Arrête les débris à l\'entrée de la conduite.', inline: true,
    need: (i) => isImm(i) ? 'na' : i.mode === 'charge' ? (i.app === 'piscine' ? 'na' : 'recommended') : (i.acc.clapet_pied?.on ? 'na' : 'recommended') },
  { id: 'vanne_asp', label: 'Vanne d\'isolement aspiration', side: 'asp', k: 0.2, glyph: 'gate', tag: 'HV', desc: 'Isole la pompe pour la maintenance. Toujours grande ouverte en service.', inline: true,
    need: (i) => isImm(i) ? 'na' : i.mode === 'charge' || fire(i) ? 'required' : 'optional' },
  { id: 'filtre_asp', label: 'Filtre à tamis en Y', side: 'asp', k: 3.0, glyph: 'ystrainer', desc: 'Protège la pompe des particules.', inline: true,
    need: (i) => isImm(i) || i.app === 'piscine' || lift(i) || i.fluid.type === 'eaux_usees' || i.fluid.type === 'boues' ? 'na' : i.app === 'incendie' ? 'avoid' : (i.mode === 'charge' && (i.app === 'carburant' || solids(i))) || i.fluid.particleMm > PUMP_TYPES[i.pumpType].passage ? 'recommended' : 'optional' },
  { id: 'prefiltre', label: 'Préfiltre à panier', side: 'asp', k: 1.5, glyph: 'basket', desc: 'Retient cheveux et feuilles avant la pompe.', inline: true,
    need: (i) => isImm(i) || i.app === 'carburant' || i.app === 'incendie' || i.fluid.type === 'eaux_usees' || i.fluid.type === 'boues' ? 'na' : i.app === 'piscine' ? 'required' : 'optional' },
  { id: 'manchon_asp', label: 'Manchon anti-vibratile (aspiration)', side: 'asp', k: 0.1, glyph: 'flex', desc: 'Évite de transmettre vibrations et efforts à la pompe.', inline: true,
    need: (i) => isImm(i) ? 'na' : surpr(i) ? 'recommended' : 'optional' },
  { id: 'vacuometre', label: 'Manovacuomètre + robinet', side: 'asp', k: 0, glyph: 'gauge', tag: 'PI', desc: 'Mesure la pression à l\'aspiration (indispensable au diagnostic).', inline: false,
    need: (i) => isImm(i) ? 'na' : fire(i) ? 'required' : 'recommended' },
  { id: 'cone_exc', label: 'Cône de réduction excentrique', side: 'asp', k: 0.15, glyph: 'eccentric', desc: 'Raccorde la conduite à la bride d\'aspiration sans poche d\'air.', inline: true,
    need: (i) => isImm(i) ? 'na' : i.asp.dn > i.pump.dnAsp ? 'required' : 'na' },
  // ----- Refoulement -----
  { id: 'cone_ref', label: 'Cône concentrique de refoulement', side: 'ref', k: 0.25, glyph: 'concentric', desc: 'Passe du DN de la pompe au DN de la conduite.', inline: true,
    need: (i) => i.ref.dn > i.pump.dnRef ? 'required' : 'na' },
  { id: 'manometre', label: 'Manomètre glycériné + robinet', side: 'ref', k: 0, glyph: 'gauge', tag: 'PI', desc: 'Lecture de la pression de refoulement.', inline: false,
    need: (i) => surpr(i) || i.app === 'forage' ? 'required' : 'recommended' },
  { id: 'manchon_ref', label: 'Manchon anti-vibratile (refoulement)', side: 'ref', k: 0.1, glyph: 'flex', desc: 'Découple la pompe du réseau.', inline: true,
    need: (i) => isImm(i) ? 'na' : surpr(i) ? 'recommended' : 'optional' },
  { id: 'clapet_ar', label: 'Clapet anti-retour à ressort', side: 'ref', k: 2.0, glyph: 'check', desc: 'Empêche le retour d\'eau et la rotation inverse.', inline: true,
    need: (i) => i.fluid.type === 'eaux_usees' || i.fluid.type === 'boues' ? 'na' : lift(i) ? 'avoid' : 'required' },
  { id: 'clapet_boule', label: 'Clapet à boule', side: 'ref', k: 1.0, glyph: 'ball', desc: 'Anti-retour à passage intégral pour eaux chargées.', inline: true,
    need: (i) => lift(i) || i.fluid.type === 'boues' ? 'required' : solids(i) || i.fluid.type === 'eaux_usees' ? 'optional' : 'na' },
  { id: 'vanne_ref', label: 'Vanne d\'isolement / réglage', side: 'ref', k: 0.2, glyph: 'gate', tag: 'HV', desc: 'Isole et permet d\'ajuster le point de fonctionnement.', inline: true,
    need: () => 'required' },
  { id: 'debitmetre', label: 'Débitmètre / compteur', side: 'ref', k: 0.05, glyph: 'flowmeter', tag: 'FT', desc: 'Suivi du débit (5 DN droits avant, 3 DN après).', inline: true,
    need: (i) => i.app === 'incendie' || i.app === 'forage' ? 'required' : i.app === 'irrigation' || i.app === 'carburant' ? 'recommended' : 'optional' },
  { id: 'capteur_p', label: 'Capteur de pression 4-20 mA', side: 'ref', k: 0, glyph: 'ptx', tag: 'PT', desc: 'Pilote le variateur et alimente le jumeau numérique.', inline: false,
    need: (i) => !PRESSURE_APPS.has(i.app) ? 'na' : i.acc.variateur?.on && (surpr(i) || i.app === 'irrigation') ? 'required' : 'optional' },
  { id: 'pressostat', label: 'Pressostat marche / arrêt', side: 'ref', k: 0, glyph: 'pswitch', tag: 'PS', desc: 'Démarre et arrête la pompe selon la pression.', inline: false,
    need: (i) => !PRESSURE_APPS.has(i.app) ? 'na' : (i.app === 'surpression' && !i.acc.variateur?.on) || fire(i) ? 'required' : 'optional' },
  { id: 'vessie', label: 'Réservoir à vessie', side: 'ref', k: 0, glyph: 'vessel', desc: 'Limite les démarrages et amortit les variations de pression.', inline: false,
    need: (i) => !PRESSURE_APPS.has(i.app) ? 'na' : i.app === 'surpression' ? 'required' : i.acc.pressostat?.on ? 'required' : 'optional' },
  { id: 'anti_belier', label: 'Anti-bélier (ballon ou soupape)', side: 'ref', k: 0, glyph: 'surge', desc: 'Protège la conduite des surpressions à l\'arrêt brutal.', inline: false,
    need: (i) => i.app === 'piscine' ? 'na' : i.acc.vessie?.on && refLen(i) < 300 ? 'optional' : refLen(i) > 150 || refStatic(i) > 30 ? 'recommended' : 'optional' },
  { id: 'ventouse', label: 'Ventouse / purgeur d\'air', side: 'ref', k: 0, glyph: 'airvalve', desc: 'Évacue l\'air aux points hauts.', inline: false,
    need: (i) => i.app === 'piscine' ? 'na' : i.geo.highPoint ? 'required' : refLen(i) > 300 ? 'recommended' : 'optional' },
  { id: 'soupape', label: 'Soupape de décharge / by-pass', side: 'ref', k: 0, glyph: 'relief', desc: 'Limite la pression maximale (vanne fermée).', inline: false,
    need: (i) => lift(i) || i.app === 'piscine' ? 'na' : i.app === 'carburant' ? 'recommended' : 'optional' },
  { id: 'vidange', label: 'Robinet de vidange', side: 'ref', k: 0, glyph: 'drain', desc: 'Vidange et purge pour la maintenance.', inline: false,
    need: () => 'optional' },
  // ----- Commande & protection -----
  { id: 'coffret', label: 'Coffret de commande + disjoncteur moteur', side: 'ctrl', k: 0, glyph: 'panel', desc: 'Protection contre surcharges et courts-circuits.', inline: false,
    need: () => 'required' },
  { id: 'variateur', label: 'Variateur de fréquence', side: 'ctrl', k: 0, glyph: 'vfd', desc: 'Adapte la vitesse au besoin : énergie, démarrage doux.', inline: false,
    need: (i) => fire(i) ? 'avoid' : i.app === 'surpression' || i.app === 'irrigation' ? 'recommended' : 'optional' },
  { id: 'marche_sec', label: 'Protection manque d\'eau (électrodes / relais)', side: 'ctrl', k: 0, glyph: 'electrode', tag: 'LSLL', desc: 'Arrête la pompe si elle tourne à sec.', inline: false,
    need: (i) => lift(i) ? 'na' : fire(i) ? 'avoid' : i.app === 'forage' || i.app === 'surpression' ? 'required' : 'recommended' },
  { id: 'flotteur_arret', label: 'Flotteur d\'arrêt (niveau bas)', side: 'ctrl', k: 0, glyph: 'float', tag: 'LSL', desc: 'Arrête la pompe avant qu\'elle ne dénoie.', inline: false,
    need: (i) => lift(i) ? 'required' : 'na' },
  { id: 'flotteur_marche', label: 'Flotteur de marche (niveau haut)', side: 'ctrl', k: 0, glyph: 'float', tag: 'LSH', desc: 'Démarre la pompe quand la fosse est pleine.', inline: false,
    need: (i) => lift(i) ? 'required' : 'na' },
  { id: 'flotteur_alarme', label: 'Flotteur d\'alarme (niveau très haut)', side: 'ctrl', k: 0, glyph: 'float', tag: 'LAHH', desc: 'Prévient d\'un débordement imminent.', inline: false,
    need: (i) => i.app === 'relevage' ? 'required' : i.app === 'drainage' ? 'recommended' : 'na' },
  { id: 'flotteur_res', label: 'Flotteur / sonde du réservoir d\'arrivée', side: 'ctrl', k: 0, glyph: 'float', tag: 'LSH', desc: 'Arrête la pompe quand le réservoir est plein.', inline: false,
    need: (i) => i.app === 'forage' || i.app === 'transfert' || i.app === 'carburant' ? 'recommended' : i.app === 'irrigation' ? 'optional' : 'na' },
  { id: 'sonde_niveau', label: 'Sonde de niveau piézométrique', side: 'ctrl', k: 0, glyph: 'probe', tag: 'LT', desc: 'Suit le niveau dynamique du forage.', inline: false,
    need: (i) => i.app === 'forage' ? 'recommended' : 'na' },
  { id: 'chemise', label: 'Chemise de refroidissement', side: 'ctrl', k: 0, glyph: 'jacket', desc: 'Force l\'eau à longer le moteur immergé.', inline: false,
    need: (i) => i.pumpType === 'immergee_forage' ? 'optional' : 'na' },
  { id: 'barres', label: 'Pied d\'assise + barres de guidage', side: 'ctrl', k: 0, glyph: 'rails', desc: 'Remontée de la pompe sans descendre dans la fosse.', inline: false,
    need: (i) => i.app === 'relevage' ? 'required' : i.pumpType === 'submersible_relevage' ? 'recommended' : 'na' },
  // ----- Incendie (EN 12845 / APSAD R1 pour les sprinkleurs, NF S 62-201 pour les RIA) -----
  { id: 'coffret_inc', label: 'Coffret incendie (démarrage automatique, arrêt manuel, thermique en alarme)', side: 'ctrl', k: 0, glyph: 'panel', desc: 'Une pompe incendie démarre seule sur chute de pression et ne s\'arrête qu\'à la main ; une surcharge donne une alarme, jamais un arrêt.', inline: false,
    need: (i) => fire(i) ? 'required' : 'na' },
  { id: 'alim_inc', label: 'Alimentation prioritaire en amont du général + câble résistant au feu (CR1)', side: 'ctrl', k: 0, glyph: 'panel', desc: 'La pompe incendie doit rester alimentée quand on coupe le bâtiment.', inline: false,
    need: (i) => fire(i) ? 'required' : 'na' },
  { id: 'alarme_inc', label: 'Report des alarmes (pompe en marche, défaut, manque de tension)', side: 'ctrl', k: 0, glyph: 'panel', desc: 'Les alarmes doivent arriver dans un local surveillé en permanence.', inline: false,
    need: (i) => fire(i) ? 'required' : 'na' },
  { id: 'jockey', label: 'Pompe de maintien de pression (jockey)', side: 'ctrl', k: 0, glyph: 'pswitch', desc: 'Compense les petites fuites du réseau : sans elle, la pompe principale démarre pour rien et ne s\'arrête plus.', inline: false,
    need: (i) => fire(i) ? 'required' : 'na' },
  { id: 'amorcage', label: 'Réservoir d\'amorçage (un par pompe)', side: 'ctrl', k: 0, glyph: 'vessel', desc: 'Garde la pompe et son aspiration pleines : une pompe incendie en aspiration doit pouvoir démarrer à tout instant.', inline: false,
    need: (i) => fire(i) && i.mode === 'aspiration' ? 'required' : 'na' },
  { id: 'anti_vortex', label: 'Plaque anti-vortex à l\'aspiration', side: 'ctrl', k: 0, glyph: 'strainer', desc: 'Empêche le tourbillon qui aspire de l\'air quand la réserve baisse.', inline: false,
    need: (i) => fire(i) && !isImm(i) ? 'required' : 'na' },
  { id: 'essai', label: 'Circuit d\'essai avec débitmètre (retour à la réserve)', side: 'ctrl', k: 0, glyph: 'flowmeter', desc: 'Permet de vérifier régulièrement le débit et la pression de la pompe sans vider la réserve.', inline: false,
    need: (i) => fire(i) ? 'required' : 'na' },
  { id: 'soupape_circ', label: 'Soupape de circulation (débit minimal)', side: 'ctrl', k: 0, glyph: 'relief', desc: 'Laisse passer un petit débit vers la réserve : la pompe, qui ne s\'arrête qu\'à la main, ne chauffe pas à débit nul.', inline: false,
    need: (i) => fire(i) ? 'required' : 'na' },
  { id: 'diesel', label: 'Motopompe diesel de secours', side: 'ctrl', k: 0, glyph: 'panel', desc: 'Source d\'énergie indépendante du réseau électrique pour la pompe de secours.', inline: false,
    need: (i) => sprinkler(i) ? 'required' : fire(i) ? 'recommended' : 'na' },
  { id: 'atex', label: 'Moteur ATEX + liaison équipotentielle', side: 'ctrl', k: 0, glyph: 'atex', desc: 'Obligatoire pour les liquides inflammables.', inline: false,
    need: (i) => i.fluid.type === 'gasoil' || i.app === 'carburant' ? 'required' : 'na' },
];

export const ACC = Object.fromEntries(ACCESSORIES.map((a) => [a.id, a])) as Record<string, AccDef>;

/** Longueur totale de refoulement (y compris colonne d'exhaure d'un forage). */
export const refLen = (i: Installation) => i.ref.length + (i.mode === 'immergee' && i.pumpType === 'immergee_forage' ? i.geo.pumpDepth : 0);
/** Hauteur statique côté refoulement, depuis la pompe. */
export const refStatic = (i: Installation) =>
  i.pumpType === 'immergee_forage' ? i.geo.pumpDepth + i.geo.hRef : i.geo.hRef;

export const NEED_LABEL: Record<Need, string> = { required: 'Requis', recommended: 'Conseillé', optional: 'Optionnel', avoid: 'Déconseillé', na: '' };

/** Matériau de conduite adapté au liquide (compatibilité chimique et température) : on garde l'actuel s'il convient. */
export function pipeFor(i: Installation, side: 'asp' | 'ref'): PipeMatId {
  const cur = i[side].material;
  const okM = (m: PipeMatId) => pipeCompat(i.fluid.type, m) === 'ok' && PIPE_MATS[m].tmax * 0.8 >= i.fluid.temp;
  if (okM(cur)) return cur;
  const order: PipeMatId[] = side === 'asp' ? ['pvc', 'pehd', 'ppr', 'acier', 'inox', 'cuivre', 'galva', 'fonte'] : ['pehd', 'pvc', 'ppr', 'acier', 'inox', 'cuivre', 'galva', 'fonte'];
  return order.find(okM) ?? order.find((m) => pipeCompat(i.fluid.type, m) !== 'bad' && PIPE_MATS[m].tmax >= i.fluid.temp) ?? cur;
}
/** Conduites passées dans le matériau adapté (PN 16 pour l'acier). */
export function withPipesFor(i: Installation): Installation {
  const put = (side: 'asp' | 'ref') => { const m = pipeFor(i, side); return m === i[side].material ? i[side] : { ...i[side], material: m, pn: m === 'acier' || m === 'inox' ? 16 : i[side].pn }; };
  return { ...i, asp: put('asp'), ref: put('ref') };
}

/** Change le DN d'une conduite ; les accessoires qui étaient au DN de la conduite suivent. */
export function withPipe(i: Installation, side: 'asp' | 'ref', dn: number): Installation {
  const old = i[side].dn;
  const acc = { ...i.acc };
  for (const a of ACCESSORIES) {
    const st = acc[a.id];
    if (a.inline && a.side === side && st && (st.dn === old || !st.dn)) acc[a.id] = { ...st, dn };
  }
  return { ...i, [side]: { ...i[side], dn }, acc };
}

/** Réseaux pilotés en pression (pressostat / variateur possibles) — mêmes applications que la simulation. */
export const pressNet = (i: Installation) => ['surpression', 'incendie', 'forage', 'irrigation', 'transfert'].includes(i.app);
