import { ACC, PARTS } from './catalog';

/** Éléments du schéma concernés par chaque alerte. */
const MAP: Record<string, string[]> = {
  mode: ['pump'], nohead: ['pump', 'ref'], lowq: ['pump', 'ref'], highq: ['pump'], bep: ['pump'], motor: ['pump', 'cable'], motorrun: ['pump'],
  temp: ['pump'], pmat: ['pump'], particle: ['pump', 'source'], sand: ['pump', 'source'], visc: ['pump'], eutype: ['pump'], passage_eu: ['pump'],
  eff: ['pump'], multiasp: ['pump', 'asp'], hydroimm: ['pump'], cool: ['pump', 'acc:chemise'], bore: ['pump', 'source'],
  npsh: ['asp', 'pump'], vasp: ['asp'], lift: ['asp', 'source'], asplen: ['asp'], aspdn: ['asp', 'acc:cone_exc'], straight: ['asp'],
  vortex: ['asp', 'source'], bottom: ['asp', 'source'], filtasp: ['acc:filtre_asp'], footclog: ['acc:clapet_pied'], cone: ['acc:cone_exc'],
  vref: ['ref'], vsed: ['ref'], vlow: ['ref'], refdn: ['ref'], losses: ['ref', 'asp'], pn: ['ref'], surge: ['ref', 'acc:anti_belier'], refpass: ['ref'], ph: ['ref', 'pump'],
  sub: ['pump', 'source'], bottomf: ['pump', 'source'], levels: ['source'], starts: ['source', 'cable'], wet: ['source', 'acc:flotteur_arret'],
  mono: ['cable'], dol: ['cable'], cableamp: ['cable'], drop: ['cable'], vfdfilter: ['cable', 'acc:variateur'], gen: ['cable'], gen0: ['cable'],
  v_off: ['acc:vessie', 'acc:pressostat'], v_on: ['acc:vessie', 'acc:pressostat'], v_diff: ['acc:pressostat'], v_pre: ['acc:vessie'], v_pn: ['acc:vessie'], v_pn2: ['acc:vessie'], v_vol: ['acc:vessie'],
  pv_str: ['pv'], pv_few: ['pv'], pv_motor: ['pv'], pv_dc: ['pv'], pv_dry: ['acc:marche_sec'],
};

export function targetsOf(id: string): string[] {
  const m = id.match(/^(miss|rec|avoid|dn)_(.+)$/);
  if (m) return [`acc:${m[2]}`];
  if (id.startsWith('pipe_') || id.startsWith('ptemp')) return [id.includes('aspiration') ? 'asp' : 'ref'];
  return MAP[id] ?? ['pump'];
}

/** Mots-clés (anglais, Wikimedia Commons) pour trouver des photos réelles. */
const PHOTO_EN: Record<string, string> = {
  pump: 'centrifugal pump', pump_immergee_forage: 'submersible borehole pump', pump_submersible_relevage: 'submersible sewage pump', pump_multi_v: 'vertical multistage pump',
  pump_drainage_immergee: 'submersible drainage pump', pump_auto_amorcante: 'self-priming pump',
  asp: 'pump suction pipe', ref: 'water pipeline pump', cable: 'electrical control panel motor starter', pv: 'solar water pumping panels', source: 'water well borehole',
  'acc:clapet_pied': 'foot valve', 'acc:crepine': 'suction strainer pipe', 'acc:vanne_asp': 'gate valve', 'acc:filtre_asp': 'Y strainer', 'acc:prefiltre': 'pool pump strainer basket',
  'acc:manchon_asp': 'rubber expansion joint pipe', 'acc:manchon_ref': 'rubber expansion joint pipe', 'acc:vacuometre': 'vacuum gauge', 'acc:cone_exc': 'eccentric reducer pipe',
  'acc:cone_ref': 'concentric reducer pipe', 'acc:manometre': 'pressure gauge', 'acc:clapet_ar': 'check valve', 'acc:clapet_boule': 'ball check valve',
  'acc:vanne_ref': 'gate valve', 'acc:debitmetre': 'electromagnetic flow meter', 'acc:capteur_p': 'pressure transmitter', 'acc:pressostat': 'pressure switch',
  'acc:vessie': 'pressure tank expansion vessel', 'acc:anti_belier': 'surge tank water hammer', 'acc:ventouse': 'air release valve', 'acc:soupape': 'pressure relief valve',
  'acc:vidange': 'drain valve', 'acc:coffret': 'motor control panel', 'acc:variateur': 'variable frequency drive', 'acc:marche_sec': 'level electrodes',
  'acc:flotteur_arret': 'float switch', 'acc:flotteur_marche': 'float switch', 'acc:flotteur_alarme': 'float switch', 'acc:flotteur_res': 'float switch',
  'acc:sonde_niveau': 'water level sensor', 'acc:chemise': 'submersible motor cooling shroud', 'acc:barres': 'sewage pump guide rail', 'acc:atex': 'explosion proof motor',
};
export const photoQuery = (target: string, pumpType: string) => PHOTO_EN[target === 'pump' ? `pump_${pumpType}` : target] ?? PHOTO_EN[target] ?? 'pump';

export function targetLabel(t: string): string {
  if (t.startsWith('acc:')) return ACC[t.slice(4)]?.label ?? t;
  return ({ pump: 'Pompe et moteur', asp: 'Conduite d\'aspiration', ref: 'Conduite de refoulement', cable: 'Coffret et câble électrique', pv: 'Champ solaire', source: 'Source / ouvrage', dest: 'Destination' } as Record<string, string>)[t] ?? PARTS[t] ?? t;
}
