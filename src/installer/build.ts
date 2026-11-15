/** « Le Chantier » : construction d'une installation en posant ses éléments (source, pompe, accessoires,
 *  destination, énergie). Ce module traduit le chantier en installation calculable et donne les conseils :
 *  élément inutile ici, déconseillé, manquant, mal placé. */
import { ACC, ACCESSORIES, APPS, DN_LIST, PUMP_TYPES, withPipe } from './catalog';
import { ensureElec } from './electrical';
import { evaluate } from './evaluate';
import { vel } from './hydraulics';
import { empty, makeFluid } from './presets';
import { proposePump } from './sizing';
import type { AccState, AppId, FluidId, Installation, ModeId, Need, PipeMatId, PumpTypeId, StartId, SupplyId } from './types';
import { DUTY0, PUMPS0 } from './ui/Wizard';

export type SrcId = 'bache_charge' | 'bache_asp' | 'forage' | 'fosse' | 'riviere' | 'cuve_carb' | 'bassin';
export type DestId = 'chateau' | 'batiment' | 'irrigation' | 'incendie' | 'egout' | 'cuve' | 'piscine';
export type Zone = 'src' | 'asp' | 'pump' | 'ref' | 'dest' | 'ctrl' | 'energy' | 'scene';

export const SOURCES: Record<SrcId, { label: string; desc: string; mode: ModeId; fluid: FluidId }> = {
  bache_charge: { label: 'Bâche au-dessus de la pompe', desc: 'Réservoir ou citerne dont l\'eau arrive seule dans la pompe (en charge).', mode: 'charge', fluid: 'eau_claire' },
  bache_asp: { label: 'Bâche sous la pompe', desc: 'Puisard, citerne enterrée : la pompe aspire l\'eau plus bas qu\'elle.', mode: 'aspiration', fluid: 'eau_claire' },
  forage: { label: 'Forage', desc: 'Puits foré : pompe immergée descendue dans le tubage.', mode: 'immergee', fluid: 'eau_forage' },
  fosse: { label: 'Fosse / regard', desc: 'Fosse de relevage ou fouille à épuiser : pompe posée au fond.', mode: 'immergee', fluid: 'eaux_usees' },
  riviere: { label: 'Rivière, lac, bassin', desc: 'Eau brute aspirée depuis la berge.', mode: 'aspiration', fluid: 'eau_brute' },
  cuve_carb: { label: 'Cuve de carburant', desc: 'Gasoil ou fioul stocké en cuve.', mode: 'aspiration', fluid: 'gasoil' },
  bassin: { label: 'Bassin de piscine', desc: 'Eau de la piscine reprise par les skimmers et la bonde de fond.', mode: 'charge', fluid: 'eau_piscine' },
};
export const DESTS: Record<DestId, { label: string; desc: string }> = {
  chateau: { label: 'Réservoir / château d\'eau', desc: 'L\'eau tombe dans un réservoir à l\'air libre.' },
  batiment: { label: 'Robinets d\'un bâtiment', desc: 'Réseau sous pression : maisons, immeuble, hôtel.' },
  irrigation: { label: 'Irrigation', desc: 'Asperseurs, goutte-à-goutte, pivot.' },
  incendie: { label: 'Réseau incendie', desc: 'Robinets d\'incendie armés (RIA) ou sprinkleurs.' },
  egout: { label: 'Regard / égout', desc: 'Rejet gravitaire vers le réseau d\'assainissement ou un fossé.' },
  cuve: { label: 'Cuve de stockage', desc: 'Réservoir de carburant ou d\'huile.' },
  piscine: { label: 'Retour piscine', desc: 'Refoulements de la piscine, après le filtre.' },
};
export const ENERGIES: Record<SupplyId, { label: string; desc: string }> = {
  mono: { label: 'Réseau monophasé 230 V', desc: 'Petites pompes (jusqu\'à 2,2 kW environ).' },
  tri: { label: 'Réseau triphasé 400 V', desc: 'Le plus courant pour les pompes de plus de 2 kW.' },
  groupe: { label: 'Groupe électrogène', desc: 'Là où il n\'y a pas de réseau, ou en secours.' },
  solaire: { label: 'Panneaux solaires', desc: 'Pompage au fil du soleil, avec contrôleur MPPT.' },
};

/** Ordre de montage conseillé (de la source vers la pompe, puis de la pompe vers la destination). */
export const ASP_ORDER = ['clapet_pied', 'crepine', 'vanne_asp', 'filtre_asp', 'prefiltre', 'manchon_asp', 'vacuometre', 'cone_exc'];
export const REF_ORDER = ['cone_ref', 'manometre', 'manchon_ref', 'clapet_ar', 'clapet_boule', 'vanne_ref', 'vidange', 'anti_belier', 'vessie', 'pressostat', 'capteur_p', 'debitmetre', 'soupape', 'ventouse'];

/** Paramètres réglés dans le chantier (le reste vient des valeurs par défaut de l'application). */
export interface BuildParams {
  q?: number; pRes?: number; hours?: number; hRef?: number;
  aspLen?: number; refLen?: number; aspDn?: number; refDn?: number; aspMat?: PipeMatId; refMat?: PipeMatId; aspElbows?: number; refElbows?: number;
  lift?: number; charge?: number; staticLevel?: number; dynamicLevel?: number; pumpDepth?: number; boreDepth?: number; tankVolume?: number;
  fluid?: FluidId; temp?: number;
  count?: number; standby?: number; qn?: number; hn?: number; kw?: number;
  cableLen?: number; start?: StartId; genKva?: number; fireKind?: 'ria' | 'sprinkler';
  acc?: Record<string, Partial<AccState>>;
}
export interface Build {
  src?: SrcId; pump?: PumpTypeId; dest?: DestId; energy?: SupplyId;
  asp: string[]; ref: string[]; ctrl: string[];
  autoPump: boolean; p: BuildParams;
}
export const EMPTY_BUILD: Build = { asp: [], ref: [], ctrl: [], autoPump: true, p: {} };

/** Application déduite de la source et de la destination. */
export function inferApp(b: Build): AppId {
  const { src, dest } = b;
  if (dest === 'incendie') return 'incendie';
  if (src === 'cuve_carb' || dest === 'cuve') return 'carburant';
  if (src === 'bassin' || dest === 'piscine') return 'piscine';
  if (src === 'fosse') return b.p.fluid && !['eaux_usees', 'boues'].includes(b.p.fluid) ? 'drainage' : 'relevage';
  if (dest === 'egout') return 'drainage';
  if (dest === 'irrigation') return 'irrigation';
  if (src === 'forage') return 'forage';
  if (dest === 'batiment') return 'surpression';
  if (b.pump === 'immergee_forage') return 'forage';
  if (b.pump === 'submersible_relevage') return 'relevage';
  if (b.pump === 'drainage_immergee') return 'drainage';
  return 'transfert';
}

/** Une pompe peut-elle travailler avec cette source ? (immergée ↔ forage / fosse) */
export function pumpFitsSource(pt: PumpTypeId, src: SrcId): boolean {
  const imm = PUMP_TYPES[pt].modes.includes('immergee');
  if (src === 'forage') return pt === 'immergee_forage';
  if (src === 'fosse') return pt === 'submersible_relevage' || pt === 'drainage_immergee';
  return !imm;
}

const dnFor = (q: number, vmax: number) => DN_LIST.find((d) => d >= 25 && vel(q, d) <= vmax) ?? DN_LIST[DN_LIST.length - 1];

/** Installation calculable correspondant au chantier (avec des valeurs par défaut pour ce qui manque encore). */
export function derive(b: Build): Installation {
  const app = inferApp(b), p = b.p, z = DUTY0[app], base = empty(app);
  const allowed = APPS[app].pumps;
  let pt: PumpTypeId = b.pump && allowed.includes(b.pump) ? b.pump : b.pump && b.src && pumpFitsSource(b.pump, b.src) ? b.pump : allowed[0];
  if (b.src && !pumpFitsSource(pt, b.src)) pt = allowed.find((x) => pumpFitsSource(x, b.src!)) ?? pt;
  const srcMode = b.src ? SOURCES[b.src].mode : undefined;
  const mode: ModeId = srcMode && PUMP_TYPES[pt].modes.includes(srcMode) ? srcMode : PUMP_TYPES[pt].modes[0];
  const fluidId: FluidId = p.fluid ?? (b.src ? SOURCES[b.src].fluid : APPS[app].fluid);
  const q = p.q ?? z.q;
  const forage = pt === 'immergee_forage';
  const matDef: PipeMatId = app === 'carburant' ? 'acier' : forage || app === 'relevage' ? 'pehd' : 'pvc';
  let i: Installation = {
    ...base, pumpType: pt, mode, fluid: makeFluid(fluidId, p.temp),
    duty: { ...base.duty, qReq: q, pRes: p.pRes ?? (b.dest === 'chateau' || b.dest === 'egout' ? 0 : b.dest === 'batiment' && app === 'forage' ? 2.5 : z.p), hoursPerDay: p.hours ?? z.h },
    geo: {
      ...base.geo, hRef: p.hRef ?? z.hRef,
      suctionLift: p.lift ?? base.geo.suctionLift, chargeHead: p.charge ?? base.geo.chargeHead,
      staticLevel: p.staticLevel ?? base.geo.staticLevel, dynamicLevel: p.dynamicLevel ?? base.geo.dynamicLevel,
      pumpDepth: p.pumpDepth ?? base.geo.pumpDepth, boreDepth: p.boreDepth ?? base.geo.boreDepth, tankVolume: p.tankVolume ?? base.geo.tankVolume,
    },
    asp: { ...base.asp, material: p.aspMat ?? (matDef === 'pehd' ? 'pvc' : matDef), length: p.aspLen ?? base.asp.length, elbows: p.aspElbows ?? base.asp.elbows, pn: matDef === 'acier' ? 16 : 10 },
    ref: { ...base.ref, material: p.refMat ?? matDef, length: p.refLen ?? base.ref.length, elbows: p.refElbows ?? base.ref.elbows, pn: matDef === 'acier' ? 16 : 10 },
    pump: { ...base.pump, ...PUMPS0[app], ...(p.count != null ? { count: p.count, standby: p.standby ?? 0, alternate: (p.count ?? 1) > 1 } : {}) },
  };
  i = withPipe(withPipe(i, 'asp', p.aspDn ?? dnFor(q, 1.2)), 'ref', p.refDn ?? dnFor(q, forage ? 2 : 1.5));
  // Accessoires : exactement ceux posés sur le chantier
  const placed = new Set([...b.asp, ...b.ref, ...b.ctrl]);
  const acc: Record<string, AccState> = {};
  for (const a of ACCESSORIES) {
    const dn = a.side === 'asp' ? i.asp.dn : i.ref.dn;
    acc[a.id] = { on: placed.has(a.id), dn, qty: 1, ...(a.id === 'cone_exc' ? { opt: 'haut' } : {}), ...(p.acc?.[a.id] ?? {}) };
  }
  i = { ...i, acc };
  if (app === 'incendie') i = { ...i, fire: { kind: p.fireKind ?? i.fire?.kind ?? 'ria', duration: i.fire?.duration ?? 60, reserve: i.fire?.reserve } };
  // Énergie
  const supply = b.energy ?? 'tri';
  const vfd = placed.has('variateur') || supply === 'solaire';
  i = { ...i, elec: { ...i.elec, supply, voltage: supply === 'mono' ? 230 : 400, start: supply === 'solaire' ? 'variateur' : p.start ?? (vfd ? 'variateur' : 'direct'), cableLen: p.cableLen ?? i.elec.cableLen, genKva: p.genKva ?? 0,
    solar: supply === 'solaire' ? { ...i.elec.solar, dailyM3: Math.round(q * (p.hours ?? z.h)), panels: 0 } : i.elec.solar } };
  if (supply === 'solaire') i = { ...i, acc: { ...i.acc, variateur: { ...i.acc.variateur, on: false } } };
  // Pompe : choisie par l'application d'après le besoin, ou caractéristiques saisies
  if (b.autoPump) i = proposePump(ensureElec(i));
  else i = { ...i, pump: { ...i.pump, qn: p.qn ?? i.pump.qn, hn: p.hn ?? i.pump.hn, motorKw: p.kw ?? i.pump.motorKw } };
  i = ensureElec(i);
  // Corrections évidentes faites d'office : conduite de PN suffisante pour la pression maxi de la pompe
  for (let k = 0; k < 2; k++) { const fx = evaluate(i).issues.find((x) => x.id === 'pn' && x.fix); if (!fx?.fix) break; i = ensureElec(fx.fix.apply(i)); }
  const ev = evaluate(i);
  return { ...i, name: `${APPS[app].label} — chantier`, elec: { ...i.elec, cableSec: ev.elec.secRec } };
}

const needBase = (i: Installation, id: string): Need => ACC[id]?.need(i) ?? 'optional';
/** Besoin d'un accessoire sur CE chantier : celui du catalogue, précisé par la destination choisie
 *  (un forage qui alimente directement des robinets est un réseau sous pression, pas un château d'eau). */
export function needOf(i: Installation, id: string, b?: Build): Need {
  const n = needBase(i, id);
  if (!b || i.app !== 'forage') return n;
  const vfd = !!i.acc.variateur?.on || i.elec.supply === 'solaire';
  if (b.dest === 'batiment') {
    if (id === 'flotteur_res') return 'na';
    if (id === 'pressostat' || id === 'vessie') return vfd && id === 'pressostat' ? 'optional' : 'required';
    if (id === 'capteur_p') return vfd ? 'required' : 'optional';
  }
  if (b.dest === 'chateau' && (id === 'pressostat' || id === 'vessie' || id === 'capteur_p')) return 'na';
  if (b.dest === 'chateau' && id === 'flotteur_res') return 'required';
  return n;
}
export const NEED_LABEL: Record<Need, string> = { required: 'Obligatoire', recommended: 'Conseillé', optional: 'Facultatif', avoid: 'Déconseillé', na: 'Inutile ici' };

/** Pourquoi un accessoire n'a pas sa place (besoin « na » ou « avoid ») sur cette installation. */
export function whyNot(i: Installation, id: string, b?: Build): string {
  if (b?.dest === 'chateau' && i.app === 'forage' && ['pressostat', 'vessie', 'capteur_p'].includes(id)) return 'L\'eau tombe à l\'air libre dans le réservoir : c\'est le flotteur du réservoir qui commande la pompe, pas la pression.';
  if (b?.dest === 'batiment' && i.app === 'forage' && id === 'flotteur_res') return 'Pas de réservoir d\'arrivée : la pompe alimente directement les robinets, c\'est la pression qui la commande.';
  const imm = i.mode === 'immergee', a = ACC[id], app = APPS[i.app].label.toLowerCase();
  const eu = i.fluid.type === 'eaux_usees' || i.fluid.type === 'boues';
  const lift = i.app === 'relevage' || i.app === 'drainage';
  const R: Record<string, () => string | null> = {
    clapet_pied: () => (imm ? null : i.mode === 'charge' ? 'En charge, l\'eau arrive seule dans la pompe : pas besoin de clapet de pied.' : null),
    crepine: () => (i.acc.clapet_pied?.on ? 'Le clapet de pied a déjà sa crépine.' : i.app === 'piscine' ? 'La piscine a déjà ses skimmers et son préfiltre.' : null),
    filtre_asp: () => (i.app === 'incendie' ? 'Un filtre colmaté priverait la pompe d\'eau pendant l\'incendie.' : eu || lift ? 'Un filtre se boucherait aussitôt avec ce liquide.' : null),
    prefiltre: () => (i.app === 'incendie' ? 'Un panier colmaté priverait la pompe d\'eau pendant l\'incendie.' : eu ? 'Un panier se boucherait aussitôt avec ce liquide.' : i.app === 'carburant' ? 'Sur du carburant, on filtre avec un filtre adapté, pas un panier à eau.' : null),
    cone_exc: () => 'La conduite d\'aspiration a le même diamètre que la bride de la pompe : pas de cône.',
    cone_ref: () => 'La conduite de refoulement a le même diamètre que la bride de la pompe : pas de cône.',
    clapet_ar: () => (eu ? 'Avec des eaux usées, un clapet à ressort se colmate : on pose un clapet à boule.' : lift ? 'En relevage, un clapet à ressort se colmate : préférez le clapet à boule.' : null),
    clapet_boule: () => 'Réservé aux eaux chargées : pour de l\'eau claire, un clapet anti-retour à ressort.',
    capteur_p: () => 'Pas de réseau sous pression à réguler ici : l\'eau part à l\'air libre.',
    pressostat: () => 'Pas de réseau sous pression à réguler ici : l\'eau part à l\'air libre.',
    vessie: () => 'Pas de réseau sous pression : un réservoir à vessie ne servirait à rien.',
    variateur: () => (i.app === 'incendie' ? 'Interdit sur une pompe incendie : elle démarre en direct, sans électronique qui pourrait tomber en panne.' : null),
    marche_sec: () => (i.app === 'incendie' ? 'Une pompe incendie ne doit jamais être arrêtée par une sécurité : elle tourne jusqu\'au bout.' : lift ? 'Dans une fosse, ce sont les flotteurs qui arrêtent la pompe avant qu\'elle ne dénoie.' : null),
    flotteur_arret: () => 'Les flotteurs de fosse ne servent qu\'au relevage et au drainage.',
    flotteur_marche: () => 'Les flotteurs de fosse ne servent qu\'au relevage et au drainage.',
    flotteur_alarme: () => 'L\'alarme de débordement concerne les fosses de relevage et de drainage.',
    flotteur_res: () => 'Pas de réservoir d\'arrivée à surveiller avec ce montage.',
    sonde_niveau: () => 'La sonde piézométrique se pose dans un forage.',
    chemise: () => 'La chemise de refroidissement ne concerne que les pompes immergées de forage.',
    barres: () => 'Les barres de guidage servent aux pompes posées au fond d\'une fosse.',
    atex: () => 'Le moteur ATEX n\'est exigé que pour les liquides inflammables.',
    soupape: () => (lift ? 'Une soupape de décharge se boucherait avec des eaux chargées.' : i.app === 'piscine' ? 'Inutile sur une filtration de piscine.' : null),
  };
  if (a?.side === 'asp' && imm) return 'Pompe immergée : il n\'y a pas de conduite d\'aspiration.';
  if (['coffret_inc', 'alim_inc', 'alarme_inc', 'jockey', 'amorcage', 'anti_vortex', 'essai', 'soupape_circ', 'diesel'].includes(id)) {
    if (i.app !== 'incendie') return 'Équipement propre aux installations incendie.';
    if (id === 'amorcage') return 'Le réservoir d\'amorçage ne sert qu\'aux pompes incendie qui aspirent.';
    if (id === 'anti_vortex') return 'Pas de prise d\'eau à protéger du vortex avec ce montage.';
  }
  return R[id]?.() ?? (needOf(i, id, b) === 'avoid' ? `Déconseillé pour ${app}.` : `Ne sert pas pour ${app} avec ce montage.`);
}

/** Où poser un accessoire : sa zone (aspiration, refoulement, commande). */
export const zoneOf = (id: string): 'asp' | 'ref' | 'ctrl' => (ACC[id]?.side ?? 'ctrl');

/** Position conseillée d'un accessoire dans sa liste, d'après l'ordre de montage. */
export function insertAt(list: string[], id: string, order: string[]): number {
  const r = order.indexOf(id);
  if (r < 0) return list.length;
  const k = list.findIndex((x) => order.indexOf(x) > r);
  return k < 0 ? list.length : k;
}

/** Conseils de placement : éléments dans le mauvais ordre. */
export function orderTips(b: Build): { msg: string; ids: string[] }[] {
  const tips: { msg: string; ids: string[] }[] = [];
  const before = (l: string[], a: string, c: string) => l.includes(a) && l.includes(c) && l.indexOf(a) < l.indexOf(c);
  const R = b.ref, A = b.asp;
  if (before(R, 'vanne_ref', 'clapet_ar') || before(R, 'vanne_ref', 'clapet_boule')) tips.push({ msg: 'Mettez la vanne APRÈS le clapet : on peut alors démonter le clapet sans vider la conduite.', ids: ['vanne_ref'] });
  if ((before(R, 'clapet_ar', 'manometre') || before(R, 'clapet_boule', 'manometre'))) tips.push({ msg: 'Le manomètre se monte entre la pompe et le clapet : il lit la pression de la pompe (essai vanne fermée, diagnostic).', ids: ['manometre'] });
  if (R.includes('cone_ref') && R[0] !== 'cone_ref') tips.push({ msg: 'Le cône de refoulement se monte directement sur la bride de la pompe.', ids: ['cone_ref'] });
  if (A.includes('cone_exc') && A[A.length - 1] !== 'cone_exc') tips.push({ msg: 'Le cône excentrique se monte directement sur l\'entrée de la pompe (côté plat en haut, pour ne pas piéger d\'air).', ids: ['cone_exc'] });
  if (A.includes('clapet_pied') && A[0] !== 'clapet_pied') tips.push({ msg: 'Le clapet de pied se pose tout au bout de l\'aspiration, dans l\'eau.', ids: ['clapet_pied'] });
  if (A.includes('crepine') && A[0] !== 'crepine' && !A.includes('clapet_pied')) tips.push({ msg: 'La crépine se pose au bout de l\'aspiration, dans l\'eau.', ids: ['crepine'] });
  if (before(A, 'vacuometre', 'filtre_asp') || before(A, 'vacuometre', 'prefiltre')) tips.push({ msg: 'Le vacuomètre se monte juste avant la pompe, après le filtre : il voit alors le colmatage du filtre.', ids: ['vacuometre'] });
  const k = R.indexOf('debitmetre');
  if (k >= 0 && k > 0 && ['clapet_ar', 'clapet_boule', 'cone_ref'].includes(R[k - 1])) tips.push({ msg: 'Laissez des longueurs droites avant le débitmètre (5 DN) : ne le collez pas derrière un clapet ou un cône.', ids: ['debitmetre'] });
  if (R.includes('ventouse') && R[R.length - 1] !== 'ventouse') tips.push({ msg: 'La ventouse se pose au point haut de la conduite, en général loin de la pompe.', ids: ['ventouse'] });
  return tips;
}

/** Accessoires obligatoires pas encore posés. */
export function missing(i: Installation, b: Build): string[] {
  const placed = new Set([...b.asp, ...b.ref, ...b.ctrl]);
  return ACCESSORIES.filter((a) => !placed.has(a.id) && needOf(i, a.id, b) === 'required' && !(a.id === 'variateur' && i.elec.supply === 'solaire')).map((a) => a.id);
}

/** Ajoute un accessoire à sa place conseillée. */
export function autoPlace(b: Build, id: string): Build {
  const z = zoneOf(id);
  if (b[z].includes(id)) return b;
  const list = [...b[z]];
  const at = z === 'asp' ? insertAt(list, id, ASP_ORDER) : z === 'ref' ? insertAt(list, id, REF_ORDER) : list.length;
  list.splice(at, 0, id);
  return { ...b, [z]: list };
}
export const sortZone = (list: string[], order: string[]) => [...list].sort((a, c) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(c) < 0 ? 99 : order.indexOf(c)));

/** Chantier de départ à partir d'une installation existante. */
export function fromInstallation(i: Installation): Build {
  const src: SrcId = i.app === 'carburant' ? 'cuve_carb' : i.app === 'piscine' ? 'bassin' : i.pumpType === 'immergee_forage' ? 'forage'
    : i.mode === 'immergee' ? 'fosse' : i.mode === 'charge' ? 'bache_charge' : i.fluid.type === 'eau_brute' ? 'riviere' : 'bache_asp';
  const dest: DestId = i.app === 'incendie' ? 'incendie' : i.app === 'carburant' ? 'cuve' : i.app === 'piscine' ? 'piscine' : i.app === 'irrigation' ? 'irrigation'
    : i.app === 'relevage' || i.app === 'drainage' ? 'egout' : i.app === 'surpression' || i.acc.pressostat?.on || i.acc.capteur_p?.on ? 'batiment' : 'chateau';
  const on = ACCESSORIES.filter((a) => i.acc[a.id]?.on);
  const accCfg: Record<string, Partial<AccState>> = {};
  for (const a of on) { const s = i.acc[a.id]; accCfg[a.id] = { vol: s.vol, pOn: s.pOn, pOff: s.pOff, pre: s.pre, opt: s.opt, qty: s.qty }; }
  return {
    src, dest, pump: i.pumpType, energy: i.elec.supply, autoPump: false,
    asp: sortZone(on.filter((a) => a.side === 'asp').map((a) => a.id), ASP_ORDER),
    ref: sortZone(on.filter((a) => a.side === 'ref').map((a) => a.id), REF_ORDER),
    ctrl: on.filter((a) => a.side === 'ctrl').map((a) => a.id),
    p: {
      q: i.duty.qReq, pRes: i.duty.pRes, hours: i.duty.hoursPerDay, hRef: i.geo.hRef, fluid: i.fluid.type, temp: i.fluid.temp,
      aspLen: i.asp.length, refLen: i.ref.length, aspDn: i.asp.dn, refDn: i.ref.dn, aspMat: i.asp.material, refMat: i.ref.material, aspElbows: i.asp.elbows, refElbows: i.ref.elbows,
      lift: i.geo.suctionLift, charge: i.geo.chargeHead, staticLevel: i.geo.staticLevel, dynamicLevel: i.geo.dynamicLevel, pumpDepth: i.geo.pumpDepth, boreDepth: i.geo.boreDepth, tankVolume: i.geo.tankVolume,
      count: i.pump.count, standby: i.pump.standby, qn: i.pump.qn, hn: i.pump.hn, kw: i.pump.motorKw, cableLen: i.elec.cableLen, start: i.elec.start, genKva: i.elec.genKva,
      fireKind: i.fire?.kind, acc: accCfg,
    },
  };
}
