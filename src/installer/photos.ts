/** Recherche de photos réelles : requêtes + filtre sur le nom du fichier pour écarter les images hors sujet
 *  (ex. une pompe de relevage renvoyée pour « Grundfos SP », un vélo pour « pump »). */
import { APPS } from './catalog';

export interface PhotoSpec { queries: string[]; ok: (title: string) => boolean }

/** Images jamais pertinentes */
const NEVER = /bicycle|\bbike|\btyres?\b|\btires?\b|breast|insulin|\bshoes?\b|heels|gas station|petrol|filling station|fuel dispenser|aquarium|\bheart\b|\blogo|\bicon|diagram|drawing|schema|\bsvg\b|\bmap\b|portrait|headquarter|\boffice\b/i;

/** Filtres par type de pompe (titre du fichier) */
const PUMP_RULES: Record<string, { must: RegExp; not?: RegExp; q: string[] }> = {
  immergee_forage: {
    q: ['submersible borehole pump', 'borehole pump', 'deep well submersible pump', 'well pump motor'],
    must: /borehole|bore.?hole|deep.?well|well.?pump|forage|tubewell|tube.?well/i,
    not: /sewage|waste.?water|sewer|drain|vortex|grinder|sludge|trash|fountain|pool|bilge|lift.?station|cutter/i,
  },
  submersible_relevage: {
    q: ['submersible sewage pump', 'sewage pump', 'wastewater submersible pump', 'lift station pump'],
    must: /sewage|waste.?water|sewer|lift.?station|vortex|grinder|cutter|effluent|relevage/i,
    not: /borehole|deep.?well|fountain|pool/i,
  },
  drainage_immergee: {
    q: ['submersible drainage pump', 'dewatering pump', 'sump pump'],
    must: /drain|dewater|sump|flood/i,
    not: /borehole|deep.?well|sewage|fountain|aquarium/i,
  },
  multi_v: {
    q: ['vertical multistage pump', 'multistage centrifugal pump', 'booster pump set'],
    must: /multistage|multi.?stage|vertical|booster|in.?line/i,
    not: /circulat|borehole|sewage|turbine|well/i,
  },
  multi_h: {
    q: ['horizontal multistage pump', 'multistage centrifugal pump', 'booster pump'],
    must: /multistage|multi.?stage|horizontal|booster/i,
    not: /circulat|borehole|sewage|vertical|\bCRN?\b/i,
  },
  surface: {
    q: ['end suction centrifugal pump', 'centrifugal pump motor', 'centrifugal water pump'],
    must: /centrifugal|end.?suction|water.?pump|pump.?set|monobloc/i,
    not: /circulat|borehole|sewage|submersible|vacuum|heat|fuel/i,
  },
  auto_amorcante: {
    q: ['self-priming pump', 'self priming centrifugal pump', 'jet pump'],
    must: /self.?priming|jet.?pump|priming/i,
    not: /borehole|sewage|submersible/i,
  },
};

type Rule = { q: string[]; must: RegExp; not?: RegExp };
const R = (must: RegExp, ...q: string[]): Rule => ({ q, must });
const PIPE = /pipe|piping|pipeline/i;
const PANEL = R(/control.?panel|switchboard|starter|electrical.?panel|contactor|motor.?control/i, 'motor control panel', 'electrical control panel', 'motor starter');
const FLOAT = R(/float/i, 'float switch', 'level float switch');
const GATE = R(/gate.?valve|butterfly.?valve|sluice|isolation.?valve/i, 'gate valve', 'butterfly valve');
const SLEEVE = R(/expansion.?joint|compensator|flexible.?(connector|joint)|rubber.?joint/i, 'rubber expansion joint', 'flexible pipe connector');

/** Élément du schéma → requêtes et mots obligatoires dans le nom de la photo */
const RULES: Record<string, Rule> = {
  asp: R(PIPE, 'pump suction pipe', 'suction pipe', 'steel pipe flange'),
  ref: { ...R(PIPE, 'water pipeline', 'HDPE pipe', 'water pipe'), not: /heat|smoking|organ|tobacco|gas/i },
  cable: PANEL,
  pv: R(/solar|photovoltaic|\bPV\b/i, 'solar water pumping', 'solar panels array', 'photovoltaic array'),
  'acc:coffret': PANEL,
  'acc:clapet_pied': R(/foot.?valve/i, 'foot valve', 'foot valve strainer'),
  'acc:crepine': { ...R(/strainer|foot.?valve|intake.?screen/i, 'suction strainer', 'foot valve strainer', 'pump strainer'), not: /y.?strainer|basket/i },
  'acc:vanne_asp': GATE,
  'acc:vanne_ref': GATE,
  'acc:filtre_asp': R(/y.?strainer|strainer|y.?filter/i, 'Y strainer', 'Y-strainer'),
  'acc:prefiltre': R(/basket|pre.?filter|leaf.?trap|hair.?(and|&).?lint/i, 'pool pump strainer basket', 'strainer basket', 'pool pump prefilter'),
  'acc:manchon_asp': SLEEVE,
  'acc:manchon_ref': SLEEVE,
  'acc:vacuometre': R(/vacuum|compound.?gauge|vacuometer|manovacu/i, 'vacuum gauge', 'compound gauge'),
  'acc:cone_exc': R(/eccentric/i, 'eccentric reducer'),
  'acc:cone_ref': { ...R(/reducer|reduction/i, 'concentric reducer', 'pipe reducer'), not: /eccentric/i },
  'acc:manometre': R(/pressure.?gauge|manometer|bourdon/i, 'pressure gauge', 'manometer'),
  'acc:clapet_ar': R(/check.?valve|non.?return|reflux|clapet/i, 'check valve', 'non-return valve', 'swing check valve'),
  'acc:clapet_boule': R(/ball.?check|check.?valve|non.?return/i, 'ball check valve', 'check valve'),
  'acc:debitmetre': R(/flow.?meter|flowmeter|water.?meter|magmeter|electromagnetic/i, 'electromagnetic flow meter', 'water meter', 'flowmeter'),
  'acc:capteur_p': R(/transmitter|transducer|pressure.?sensor/i, 'pressure transmitter', 'pressure transducer', 'pressure sensor'),
  'acc:pressostat': R(/pressure.?switch|pressostat/i, 'pressure switch', 'water pump pressure switch'),
  'acc:vessie': R(/pressure.?tank|expansion.?(vessel|tank)|bladder|diaphragm.?tank|hydrophore/i, 'pressure tank', 'expansion vessel', 'bladder tank'),
  'acc:anti_belier': R(/surge|water.?hammer|arrest/i, 'surge tank', 'water hammer arrestor', 'surge vessel'),
  'acc:ventouse': R(/air.?(release|valve|vent)|vent.?valve|air.?relief/i, 'air release valve', 'air valve'),
  'acc:soupape': R(/relief.?valve|safety.?valve|pressure.?relief/i, 'pressure relief valve', 'safety valve'),
  'acc:vidange': R(/drain.?(valve|cock)|ball.?valve|cock/i, 'drain valve', 'ball valve'),
  'acc:variateur': R(/frequency|inverter|\bVFD\b|variable.?speed/i, 'variable frequency drive', 'frequency inverter'),
  'acc:marche_sec': R(/electrode|dry.?run|level.?(relay|probe)/i, 'level electrodes', 'dry run protection'),
  'acc:flotteur_arret': FLOAT,
  'acc:flotteur_marche': FLOAT,
  'acc:flotteur_alarme': FLOAT,
  'acc:flotteur_res': FLOAT,
  'acc:sonde_niveau': R(/level.?(sensor|transmitter|probe)|piezometer|hydrostatic/i, 'water level sensor', 'level transmitter'),
  'acc:chemise': R(/shroud|sleeve|cooling.?jacket/i, 'submersible motor cooling shroud', 'flow sleeve'),
  'acc:barres': R(/guide.?rail|auto.?coupling|duckfoot|guide.?bar/i, 'sewage pump guide rail', 'pump auto coupling'),
  'acc:atex': R(/explosion|ATEX|flameproof|\bEx\b/i, 'explosion proof motor', 'flameproof motor'),
};

/** Source (côté aspiration) selon l'application */
const SOURCE: Record<string, Rule> = {
  forage: { ...R(/well|borehole|bore.?hole|forage/i, 'water well borehole', 'borehole', 'water well'), not: /pump|grundfos|motor/i },
  irrigation: R(/canal|pond|river|reservoir|lake|dam/i, 'irrigation canal', 'farm pond', 'river water intake'),
  relevage: { ...R(/sewage|lift.?station|pumping.?station|manhole|sump|wet.?well/i, 'sewage pumping station', 'lift station', 'wet well'), not: /grundfos|vortex|submersible/i },
  drainage: R(/excavation|dewater|flood|sump|trench/i, 'dewatering excavation', 'flooded trench', 'sump'),
  carburant: { ...R(/fuel|diesel|oil.?tank/i, 'fuel storage tank', 'diesel tank'), not: /water/i },
  piscine: R(/pool/i, 'swimming pool'),
  tank: { ...R(/tank|cistern|reservoir/i, 'water storage tank', 'cistern', 'water tank'), not: /pressure|fuel|diesel|oil|grundfos|\bGT|vessel|bladder|fish|septic/i },
};
/** Destination selon le type de destination */
const DEST: Record<string, Rule> = {
  reservoir: { ...R(/water.?tower|tank|reservoir|cistern/i, 'water tower', 'elevated water tank', 'water storage tank'), not: /pressure|fuel|diesel|oil|grundfos|\bGT|vessel|bladder|fish|septic/i },
  batiment: R(/apartment|building|tap|faucet|block/i, 'apartment building', 'water tap'),
  incendie: R(/fire.?hose|hose.?reel|hydrant|fire.?nozzle|firefight/i, 'fire hose reel', 'fire hose nozzle', 'fire hydrant'),
  irrigation: R(/sprinkler|irrigation/i, 'sprinkler irrigation', 'irrigation sprinkler'),
  regard: R(/manhole|sewer/i, 'manhole', 'sewer manhole'),
  cuve: { ...R(/fuel|diesel|oil.?tank/i, 'fuel storage tank', 'diesel storage tank'), not: /water/i },
  bassin: R(/pool/i, 'swimming pool'),
};

const spec = (r: Rule): PhotoSpec => ({ queries: r.q, ok: (t) => !NEVER.test(t) && r.must.test(t) && !(r.not && r.not.test(t)) });

/** Photos génériques (sans marque) : n'affiche que des photos dont le nom correspond bien à l'élément */
export function genericSpec(target: string, i: { pumpType: string; app: string; mode: string; acc: Record<string, { on?: boolean } | undefined> }): PhotoSpec {
  if (target === 'pump') return spec(PUMP_RULES[i.pumpType] ?? PUMP_RULES.surface);
  if (target === 'source') return spec(SOURCE[i.app] ?? SOURCE.tank);
  if (target === 'dest') {
    let d: string = APPS[i.app as keyof typeof APPS]?.dest ?? 'reservoir';
    // Forage / transfert avec pressostat + réservoir à vessie : alimente directement une maison
    if (d === 'reservoir' && i.acc.pressostat?.on && i.acc.vessie?.on) d = 'batiment';
    return spec(DEST[d] ?? DEST.reservoir);
  }
  const r = RULES[target];
  if (r) return spec(r);
  return { queries: ['pump'], ok: () => false };
}
