/** Vérifications sur le terrain, réalisables dans la simulation.
 *  Chaque test donne ce qu'un technicien mesurerait ou verrait sur place, à partir de l'état simulé et des pannes
 *  présentes, avec la valeur attendue d'une installation saine. Il ne nomme jamais la panne : c'est au technicien
 *  de conclure. */
import { isForage, pumpHead, suctionZ } from './hydraulics';
import { acoustics, genSpec, liveReadings, relaySetting, type SimCtx, type SimState } from './sim';
import type { Installation } from './types';

const G = 9.81;
export type Lvl = 'ok' | 'warn' | 'bad' | undefined;
export interface TestLine { k: string; v: string; ref?: string; lvl?: Lvl }
export interface TestResult { lines: TestLine[]; note?: string; how?: string }
export type TestCat = 'elec' | 'hydro' | 'niveau' | 'meca' | 'acc' | 'groupe';
export const TEST_CAT: Record<TestCat, string> = {
  elec: 'Électricité (coffret, moteur)', hydro: 'Pressions et débits', niveau: 'Niveaux d\'eau', meca: 'Pompe et moteur (mécanique)', acc: 'Accessoires', groupe: 'Groupe électrogène',
};
export interface FieldTest {
  id: string; cat: TestCat; label: string; tool: string;
  applies: (c: TCtx) => boolean;
  run: (c: TCtx) => TestResult;
}

/** Tout ce dont un test a besoin. */
export interface TCtx {
  ctx: SimCtx; st: SimState; n: SimCtx; i: Installation; F: Set<string>;
  has: (...ids: string[]) => boolean; on: (acc: string) => boolean;
  imm: boolean; forage: boolean; tri: boolean; mono: boolean; vfd: boolean; gen: boolean;
  kind: SimCtx['kind']; bar: (m: number) => number;
  run: ReturnType<typeof liveReadings>; runN: ReturnType<typeof liveReadings>; forced: boolean;
}

const f1 = (x: number, d = 1) => (Number.isFinite(x) ? x : 0).toFixed(d).replace('.', ',');
const ok = (good: boolean, warn = false): Lvl => (good ? 'ok' : warn ? 'warn' : 'bad');
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : 0);

/** État « pompe en marche » : réel si elle tourne, sinon marche forcée (sélecteur sur Manu) le temps de la mesure. */
function asRunning(ctx: SimCtx, st: SimState): SimState {
  if (st.on) return st;
  const fx = ctx.fx;
  return { ...st, on: true, runT: 600, hum: !!(fx.noStart || fx.startFail), noFlow: !!fx.primeLoss && !st.primed, q: ctx.h.ok ? ctx.h.q : 0, s: ctx.kind === 'vfd' || ctx.kind === 'solar' ? Math.max(0.5, st.s || 1) : 1 };
}

export function testCtx(ctx: SimCtx, st: SimState, n: SimCtx): TCtx {
  const i = ctx.i, F = new Set(ctx.fx.ids);
  const rs = asRunning(ctx, st);
  const nrs = { ...rs, hum: false, noFlow: false, q: n.h.ok ? (st.on && (ctx.kind === 'vessel' || ctx.kind === 'vfd') ? Math.max(0.1, st.q) : n.h.q) : 0 };
  return {
    ctx, st, n, i, F, has: (...ids) => ids.some((x) => F.has(x)), on: (a) => !!n.i.acc[a]?.on, // accessoires installés (avant panne)
    imm: i.mode === 'immergee', forage: isForage(i), tri: i.elec.supply !== 'mono', mono: i.elec.supply === 'mono',
    vfd: i.elec.supply === 'solaire' || !!i.acc.variateur?.on, gen: i.elec.supply === 'groupe', kind: ctx.kind,
    bar: (m) => (m * i.fluid.rho * G) / 1e5,
    run: liveReadings(ctx, rs), runN: liveReadings(n, nrs), forced: !st.on,
  };
}

const forcedNote = (c: TCtx) => (c.forced ? 'Pompe à l\'arrêt : marche forcée (sélecteur sur Manu) le temps de la mesure.' : undefined);
const noPower = (c: TCtx) => c.st.t < c.st.outageUntil || (!!c.st.gen && !c.st.gen.run && c.st.gen.why !== 'en attente (pompe à l\'arrêt)');
/** Pression à débit nul au manomètre de la pompe (vanne fermée, 50 Hz). */
function shutoff(c: TCtx, x: SimCtx) {
  const h0 = x.fx.decoupled ? 0 : pumpHead(x.i, 0);
  return Math.max(0, c.bar(c.forage ? h0 - x.i.geo.staticLevel : h0 + suctionZ(x.i)));
}
/** Tensions entre phases au coffret (V). */
function volts(c: TCtx, starting = false): number[] {
  if (noPower(c)) return c.tri ? [0, 0, 0] : [0];
  let u = c.mono ? 230 : 400;
  if (c.has('sous_tension')) u *= 0.85;
  if (c.has('gen_avr')) u = c.mono ? 196 : 340;
  if (starting) u *= c.has('groupe_faible') ? 0.62 : 1 - Math.min(0.15, (c.ctx.er.dropStart || 4) / 100);
  if (!c.tri) return [u];
  if (c.has('desequilibre')) return [u * 1.01, u * 0.995, u * 0.955];
  return [u, u * 0.998, u * 1.002];
}

export const FIELD_TESTS: FieldTest[] = [
  // ======================= Électricité =======================
  {
    id: 'u_coffret', cat: 'elec', label: 'Tension en tête du coffret', tool: 'Voltmètre',
    applies: (c) => c.i.elec.supply !== 'solaire',
    run: (c) => {
      const u = volts(c), nom = c.mono ? 230 : 400;
      const names = c.tri ? ['L1-L2', 'L2-L3', 'L3-L1'] : ['L-N'];
      return { lines: u.map((v, k) => ({ k: names[k], v: `${f1(v, 0)} V`, ref: `${nom} V ± 10 %`, lvl: ok(Math.abs(v - nom) <= nom * 0.06, Math.abs(v - nom) <= nom * 0.1) })),
        note: noPower(c) ? 'Aucune tension à l\'arrivée du coffret.' : undefined };
    },
  },
  {
    id: 'u_contacteur', cat: 'elec', label: 'Tension en amont et en aval du contacteur (moteur alimenté)', tool: 'Voltmètre',
    applies: (c) => c.tri && !c.vfd,
    run: (c) => {
      const up = volts(c);
      const down = up.map((v, k) => (c.has('perte_phase') && k !== 0 ? v * 0.5 : v));
      const L: TestLine[] = [];
      ['L1-L2', 'L2-L3', 'L3-L1'].forEach((nm, k) => L.push({ k: `${nm} amont`, v: `${f1(up[k], 0)} V` }, { k: `${nm} aval`, v: `${f1(down[k], 0)} V`, lvl: ok(Math.abs(down[k] - up[k]) < 10) }));
      return { lines: L, how: 'Commande en marche (Manu), mesure aux bornes d\'entrée puis de sortie du contacteur.', note: c.has('perte_phase') ? 'En aval, deux tensions sur trois sont à la moitié : une phase n\'arrive pas au moteur.' : undefined };
    },
  },
  {
    id: 'u_marche', cat: 'elec', label: 'Tension au coffret et au moteur, moteur en marche (chute dans le câble)', tool: 'Voltmètre',
    applies: (c) => c.i.elec.supply !== 'solaire',
    run: (c) => {
      const u = volts(c)[0], drop = c.ctx.er.dropRun || 0, nom = c.mono ? 230 : 400;
      const um = u * (1 - drop / 100) * (c.has('sous_tension', 'gen_avr') ? 0.99 : 1);
      return { lines: [
        { k: 'Au coffret', v: `${f1(u, 0)} V`, ref: `${nom} V`, lvl: ok(u >= nom * 0.94, u >= nom * 0.9) },
        { k: 'Aux bornes du moteur', v: `${f1(um, 0)} V`, ref: `≥ ${f1(nom * 0.9, 0)} V`, lvl: ok(um >= nom * 0.92, um >= nom * 0.9) },
        { k: 'Chute dans le câble', v: `${f1(drop)} %`, ref: '≤ 3 % (5 % maxi)', lvl: ok(drop <= 3, drop <= 5) },
      ], note: forcedNote(c) };
    },
  },
  {
    id: 'u_demarrage', cat: 'elec', label: 'Tension pendant le démarrage', tool: 'Voltmètre (valeur mini)',
    applies: (c) => c.i.elec.supply !== 'solaire',
    run: (c) => {
      const u0 = volts(c)[0], us = volts(c, true)[0];
      return { lines: [{ k: 'Avant démarrage', v: `${f1(u0, 0)} V` }, { k: 'Mini pendant le démarrage', v: `${f1(us, 0)} V`, ref: '≥ 85 % de la nominale', lvl: ok(us >= u0 * 0.85, us >= u0 * 0.8) }],
        note: c.has('groupe_faible') ? 'La tension s\'effondre et le moteur n\'arrive pas à prendre sa vitesse.' : undefined };
    },
  },
  {
    id: 'i_phases', cat: 'elec', label: 'Courant du moteur sur chaque phase', tool: 'Pince ampèremétrique',
    applies: () => true,
    run: (c) => {
      const a = c.run.amps, an = c.runN.amps, In = c.ctx.er.inom;
      if (noPower(c)) return { lines: [{ k: 'Courant', v: '0 A', lvl: 'bad' }], note: 'Pas de tension : le moteur ne peut pas tourner.' };
      const ph = !c.tri || c.vfd ? [a] : c.has('perte_phase') ? [a, a, 0] : c.has('desequilibre') ? [a * 1.06, a * 1.02, a * 0.86] : [a, a * 0.99, a * 1.01];
      const names = ph.length === 1 ? [c.vfd ? 'Sortie du variateur (moteur)' : 'Courant moteur'] : ['L1', 'L2', 'L3'];
      const L: TestLine[] = ph.map((x, k) => ({ k: names[k], v: `${f1(x)} A`, lvl: x > In * 1.05 || x < an * 0.75 || x < 0.05 ? 'bad' : x > an * 1.12 || x < an * 0.88 ? 'warn' : 'ok' }));
      if (ph.length === 3) { const m = Math.max(...ph), mi = Math.min(...ph), avg = (ph[0] + ph[1] + ph[2]) / 3; const d = avg > 0 ? ((m - mi) / avg) * 100 : 0; L.push({ k: 'Écart entre phases', v: `${f1(d, 0)} %`, ref: '≤ 10 %', lvl: ok(d <= 10) }); }
      L.push({ k: 'Courant habituel (mise en service)', v: `${f1(an)} A` }, { k: 'Courant de plaque (In)', v: `${f1(In)} A` });
      const hum = c.st.on ? c.st.hum : !!(c.ctx.fx.noStart || c.ctx.fx.startFail);
      const what = hum ? 'Le moteur ronfle sans tourner pendant la mesure.' : c.run.on && c.run.q < 0.05 && c.F.size ? 'La pompe tourne mais ne débite pas pendant la mesure.' : undefined;
      return { lines: L, note: [forcedNote(c), what].filter(Boolean).join(' ') || undefined };
    },
  },
  {
    id: 'i_demarrage', cat: 'elec', label: 'Courant et durée du démarrage', tool: 'Pince (mode pointe)',
    applies: () => true,
    run: (c) => {
      const er = c.ctx.er, jam = c.has('perte_phase', 'condensateur', 'groupe_faible', 'secours_grippee') || (c.has('ensablement') && !!c.st.flags?.jam);
      const dur = jam ? 'ne descend pas : le moteur ne décolle pas' : c.has('ensablement') ? '3,5 s (plus long que d\'habitude)' : er.start === 'direct' ? '1 s environ' : '3 à 8 s (démarreur)';
      return { lines: [{ k: 'Pointe', v: `${f1(er.istart * (jam ? 1 : 1))} A`, ref: `≈ ${f1(er.istart)} A` }, { k: 'Retour au courant de marche', v: dur, lvl: ok(!jam && !c.has('ensablement'), !jam) }] };
    },
  },
  {
    id: 'megohm', cat: 'elec', label: 'Isolement phase / terre (500 V)', tool: 'Mégohmmètre',
    applies: () => true,
    run: (c) => {
      const bad = c.has('isolement'), names = c.tri ? ['U', 'V', 'W'] : ['L', 'N'];
      return { lines: names.map((nm, k) => ({ k: `${nm} / terre`, v: bad && k === 1 ? '0,3 MΩ' : c.imm ? '> 50 MΩ' : '> 200 MΩ', ref: '> 2 MΩ', lvl: ok(!(bad && k === 1)) })), how: 'Coffret consigné, câble moteur débranché du bornier.' };
    },
  },
  {
    id: 'isoler', cat: 'elec', label: 'Isolement du câble seul, puis du moteur seul', tool: 'Mégohmmètre',
    applies: () => true,
    run: (c) => {
      const bad = c.has('isolement');
      return { lines: [{ k: c.imm ? 'Câble (jusqu\'à la jonction)' : 'Câble', v: bad && c.imm ? '0,3 MΩ' : '> 200 MΩ', lvl: ok(!(bad && c.imm)) }, { k: 'Moteur (bobinage)', v: bad && !c.imm ? '0,4 MΩ' : '> 100 MΩ', lvl: ok(!(bad && !c.imm)) }],
        note: bad ? (c.imm ? 'Le défaut est sur le câble : jonction immergée ou gaine blessée.' : 'Le défaut est dans le moteur : bobinage ou boîte à bornes humide.') : undefined };
    },
  },
  {
    id: 'capa', cat: 'elec', label: 'Capacité du condensateur', tool: 'Capacimètre',
    applies: (c) => c.mono,
    run: (c) => { const nom = Math.round(16 + c.i.pump.motorKw * 18); const bad = c.has('condensateur');
      return { lines: [{ k: 'Mesuré', v: `${bad ? Math.round(nom * 0.18) : Math.round(nom * 0.97)} µF`, ref: `${nom} µF (plaque) ± 5 %`, lvl: ok(!bad) }], how: 'Condensateur déchargé puis débranché.' }; },
  },
  {
    id: 'condo_vue', cat: 'elec', label: 'Aspect du condensateur', tool: 'Visuel',
    applies: (c) => c.mono,
    run: (c) => ({ lines: [{ k: 'Aspect', v: c.has('condensateur') ? 'Gonflé, traces d\'électrolyte' : 'Normal, pas de déformation', lvl: ok(!c.has('condensateur')) }] }),
  },
  {
    id: 'relais', cat: 'elec', label: 'Réglage du disjoncteur moteur comparé à la plaque', tool: 'Lecture du cadran',
    applies: (c) => c.i.elec.supply !== 'solaire',
    run: (c) => { const set = relaySetting(c.ctx), In = c.ctx.er.inom;
      return { lines: [{ k: 'Réglage lu', v: `${f1(set)} A` }, { k: 'Courant de plaque (In)', v: `${f1(In)} A` }, { k: 'Rapport', v: `${f1(set / In, 2)} × In`, ref: '1,00 à 1,05 × In', lvl: ok(set >= In * 0.98 && set <= In * 1.06, set >= In * 0.9 && set <= In * 1.15) }] }; },
  },
  {
    id: 'bornes', cat: 'elec', label: 'Fusibles et serrage des bornes', tool: 'Visuel + tournevis + caméra thermique',
    applies: () => true,
    run: (c) => ({ lines: [
      { k: 'Fusibles', v: c.has('perte_phase') ? 'Fusible de la phase L3 fondu' : 'Bons', lvl: ok(!c.has('perte_phase')) },
      { k: 'Bornes de l\'arrivée', v: c.has('desequilibre') ? 'Borne L3 desserrée, noircie (+ 35 °C à la caméra)' : 'Serrées, froides', lvl: ok(!c.has('desequilibre')) },
      { k: 'Bornes du moteur', v: 'Serrées', lvl: 'ok' },
    ], how: 'Coffret consigné pour le resserrage.' }),
  },
  {
    id: 'commande_off', cat: 'elec', label: 'Couper la commande (sélecteur sur 0) moteur en marche', tool: 'Sélecteur Manu-0-Auto',
    applies: (c) => !c.vfd,
    run: (c) => ({ lines: [{ k: 'Bobine du contacteur', v: 'Plus alimentée (voyant éteint)' }, { k: 'Moteur', v: c.has('contacteur_colle') ? 'Continue de tourner' : 'S\'arrête', lvl: ok(!c.has('contacteur_colle')) }],
      note: c.has('contacteur_colle') ? 'Couper au disjoncteur moteur (Q1) pour l\'arrêter.' : undefined }),
  },
  {
    id: 'contacts', cat: 'elec', label: 'État des contacts du contacteur', tool: 'Visuel (coffret consigné)',
    applies: (c) => !c.vfd,
    run: (c) => ({ lines: [{ k: 'Contacts de puissance', v: c.has('contacteur_colle') ? 'Soudés, fortement brûlés' : 'Propres, légère usure normale', lvl: ok(!c.has('contacteur_colle')) }, { k: 'Bobine', v: 'Bonne' }] }),
  },
  {
    id: 'vfd_hist', cat: 'elec', label: 'Historique des défauts du variateur', tool: 'Clavier du variateur',
    applies: (c) => c.vfd,
    run: (c) => ({ lines: [
      { k: 'Défauts enregistrés', v: c.has('defaut_variateur') ? 'OV (surtension bus DC) × 4' : 'Aucun', lvl: ok(!c.has('defaut_variateur')) },
      { k: 'Retour du capteur (4-20 mA)', v: c.on('capteur_p') ? (c.has('capteur_hs') ? '0,0 bar' : `${f1(c.st.x)} bar`) : 'non raccordé' },
    ] }),
  },
  {
    id: 'vfd_rampe', cat: 'elec', label: 'Rampe de décélération et tension du réseau', tool: 'Paramètres du variateur + voltmètre',
    applies: (c) => c.vfd,
    run: (c) => ({ lines: [{ k: 'Rampe de décélération', v: c.has('defaut_variateur') ? '2 s' : '10 s', ref: '8 à 15 s pour une pompe', lvl: ok(!c.has('defaut_variateur')) }, { k: 'Tension réseau (maxi)', v: c.has('defaut_variateur') ? '432 V' : '404 V', ref: '≤ 420 V', lvl: ok(!c.has('defaut_variateur'), true) }] }),
  },
  {
    id: 'affichage', cat: 'hydro', label: 'Pression affichée par le variateur et au manomètre', tool: 'Lecture comparée',
    applies: (c) => c.kind === 'vfd' && c.on('capteur_p'),
    run: (c) => ({ lines: [{ k: 'Afficheur du variateur', v: `${c.has('capteur_hs') ? '0,0' : f1(c.st.x)} bar` }, { k: 'Manomètre', v: `${f1(c.st.x)} bar` }, { k: 'Écart', v: `${c.has('capteur_hs') ? f1(c.st.x) : '0,0'} bar`, ref: '≤ 0,2 bar', lvl: ok(!c.has('capteur_hs')) }] }),
  },
  {
    id: 'capteur_ma', cat: 'acc', label: 'Courant du capteur de pression (4-20 mA)', tool: 'Multimètre en série',
    applies: (c) => c.kind === 'vfd' && c.on('capteur_p'),
    run: (c) => { const ma = c.has('capteur_hs') ? 0 : 4 + 16 * Math.min(1, c.st.x / 10);
      return { lines: [{ k: 'Courant mesuré', v: `${f1(ma, 1)} mA`, ref: `${f1(4 + 16 * Math.min(1, c.st.x / 10), 1)} mA pour ${f1(c.st.x)} bar (capteur 0-10 bar)`, lvl: ok(ma >= 3.8) }], note: ma < 3.8 ? 'Moins de 4 mA : boucle ouverte (câble coupé ou capteur hors service).' : undefined }; },
  },
  {
    id: 'capteur_cable', cat: 'acc', label: 'Câble du capteur de pression', tool: 'Visuel + continuité',
    applies: (c) => c.kind === 'vfd' && c.on('capteur_p'),
    run: (c) => ({ lines: [{ k: 'Câble', v: c.has('capteur_hs') ? 'Conducteur coupé au presse-étoupe du capteur' : 'Continuité bonne, presse-étoupe serré', lvl: ok(!c.has('capteur_hs')) }] }),
  },
  {
    id: 'compteur_gen', cat: 'elec', label: 'Compteur électrique et disjoncteur général', tool: 'Visuel',
    applies: (c) => c.i.elec.supply === 'mono' || c.i.elec.supply === 'tri',
    run: (c) => { const off = c.st.t < c.st.outageUntil;
      return { lines: [{ k: 'Compteur', v: off ? 'Éteint : pas de courant sur le réseau (voisins aussi)' : 'Allumé', lvl: ok(!off) }, { k: 'Disjoncteur général', v: 'Enclenché', lvl: 'ok' }],
        note: off ? `Retour du courant prévu dans ${Math.ceil((c.st.outageUntil - c.st.t) / 60)} min.` : undefined }; },
  },
  {
    id: 'quelle_pompe', cat: 'elec', label: 'Quelle pompe déclenche (voyants, disjoncteurs)', tool: 'Visuel du coffret',
    applies: (c) => (c.i.pump.count ?? 1) > 1,
    run: (c) => ({ lines: [{ k: 'Disjoncteur pompe 1', v: c.has('perte_phase') && c.st.trip ? 'Déclenché' : 'Enclenché', lvl: ok(!(c.has('perte_phase') && c.st.trip)) }, { k: 'Disjoncteur pompe 2', v: (c.has('secours_grippee') || c.has('perte_phase')) && c.st.trip ? 'Déclenché' : 'Enclenché', lvl: ok(!((c.has('secours_grippee') || c.has('perte_phase')) && c.st.trip)) }],
      note: c.has('secours_grippee') ? 'C\'est toujours la même pompe (celle qui tourne le moins) qui déclenche, au moment où la permutation la fait démarrer.' : c.has('perte_phase') ? 'Les deux pompes ronflent et déclenchent : le défaut est en amont, commun aux deux départs.' : undefined }),
  },
  // ======================= Pressions et débits =======================
  {
    id: 'vanne_test', cat: 'hydro', label: 'Pression vanne de refoulement fermée (débit nul), à comparer à la courbe', tool: 'Manomètre de la pompe',
    applies: () => true,
    run: (c) => { const p = shutoff(c, c.ctx), pn = shutoff(c, c.n);
      return { lines: [{ k: 'Pression lue vanne fermée', v: `${f1(p)} bar` }, { k: 'Pression à débit nul de la courbe', v: `${f1(pn)} bar` }, { k: 'Écart', v: `${pct(p, pn)} %`, ref: '± 5 %', lvl: ok(Math.abs(pct(p, pn)) <= 5, Math.abs(pct(p, pn)) <= 12) }],
        how: `${c.on('vanne_ref') ? 'Fermer la vanne de refoulement' : 'Pas de vanne au refoulement : en poser une provisoire et la fermer'} 1 minute au plus, lire le manomètre${c.on('manometre') ? '' : ' (manomètre de contrôle vissé sur la prise de pression)'}, rouvrir.`, note: forcedNote(c) }; },
  },
  {
    id: 'mano_marche', cat: 'hydro', label: 'Manomètre de la pompe en marche, comparé à la pression à débit nul', tool: 'Manomètre',
    applies: () => true,
    run: (c) => { const p = c.run.pRef, p0 = shutoff(c, c.n);
      return { lines: [{ k: 'Pression en marche', v: `${f1(p)} bar` }, { k: 'Débit au débitmètre', v: `${f1(c.run.q)} m³/h`, lvl: ok(c.run.q > 0.05 || !c.run.on) }, { k: 'Pression à débit nul de la courbe', v: `${f1(p0)} bar` }],
        note: c.run.q < 0.05 && Math.abs(p - p0) < 0.3 ? 'La pompe est à sa pression à débit nul : elle refoule contre un obstacle fermé.' : forcedNote(c) }; },
  },
  {
    id: 'mano_arret', cat: 'hydro', label: 'Manomètre pompe arrêtée (10 minutes)', tool: 'Manomètre + chronomètre',
    applies: (c) => c.kind !== 'pit',
    run: (c) => {
      const hold = c.kind === 'vessel' || c.kind === 'vfd' ? (c.ctx.er.vessel?.pOn ?? c.st.x) : c.bar(Math.max(0, c.i.geo.hRef + (c.forage ? 0 : 0)));
      const leak = c.has('clapet_ar_fuit', 'colonne_percee');
      return { lines: [{ k: 'À l\'arrêt', v: `${f1(hold)} bar` }, { k: 'Après 10 min', v: `${f1(leak ? hold * 0.25 : hold * (c.has('fuite_reseau') ? 0.6 : 0.99))} bar`, ref: 'stable (sans puisage)', lvl: ok(!leak && !c.has('fuite_reseau')) }],
        how: 'Personne ne puise pendant l\'essai.', note: leak ? 'La pression redescend : l\'eau repart vers la pompe.' : undefined };
    },
  },
  {
    id: 'clapet_vanne', cat: 'hydro', label: 'Pompe arrêtée, fermer la vanne juste après le clapet', tool: 'Vanne + 2 manomètres',
    applies: (c) => (c.on('clapet_ar') || c.on('clapet_boule')) && c.kind !== 'pit',
    run: (c) => {
      const leakClapet = c.has('clapet_ar_fuit'), leakNet = c.has('fuite_reseau');
      return { lines: [
        { k: 'Côté réseau (après la vanne)', v: leakNet ? 'baisse encore' : 'tient', lvl: ok(!leakNet) },
        { k: 'Côté pompe (entre clapet et vanne)', v: leakClapet || c.has('colonne_percee') ? 'chute à 0 en quelques minutes' : 'tient', lvl: ok(!(leakClapet || c.has('colonne_percee'))) },
      ], note: 'Si le réseau tient vanne fermée alors qu\'il baissait vanne ouverte, l\'eau repartait par le clapet. Si le réseau baisse encore, la fuite est sur le réseau.' };
    },
  },
  {
    id: 'vannes_pos', cat: 'hydro', label: 'Position de toutes les vannes', tool: 'Visuel',
    applies: () => true,
    run: (c) => { const L: TestLine[] = [];
      if (c.on('vanne_asp')) L.push({ k: 'Vanne d\'aspiration', v: 'Ouverte', lvl: 'ok' });
      const closed = c.has('vanne_fermee'), part = (c.i.acc.vanne_ref?.qty ?? 0) > 1 && !closed;
      L.push({ k: 'Vanne de refoulement', v: closed ? 'Fermée' : part ? 'Partiellement fermée' : 'Ouverte', lvl: closed ? 'bad' : part ? 'warn' : 'ok' });
      if (c.i.backup?.on) L.push({ k: 'Vannes du réservoir de secours', v: 'Ouvertes', lvl: 'ok' });
      return { lines: L }; },
  },
  {
    id: 'compare_mes', cat: 'hydro', label: 'Débit, pression et courant comparés à la mise en service', tool: 'Débitmètre + manomètre + pince',
    applies: () => true,
    run: (c) => ({ lines: [
      { k: 'Débit', v: `${f1(c.run.q)} m³/h`, ref: `${f1(c.runN.q)} m³/h`, lvl: ok(c.run.q >= c.runN.q * 0.9, c.run.q >= c.runN.q * 0.8) },
      { k: 'Pression au refoulement', v: `${f1(c.run.pRef)} bar`, ref: `${f1(c.runN.pRef)} bar`, lvl: ok(Math.abs(c.run.pRef - c.runN.pRef) <= Math.max(0.2, c.runN.pRef * 0.1), Math.abs(c.run.pRef - c.runN.pRef) <= Math.max(0.4, c.runN.pRef * 0.2)) },
      { k: 'Courant', v: `${f1(c.run.amps)} A`, ref: `${f1(c.runN.amps)} A`, lvl: ok(Math.abs(c.run.amps - c.runN.amps) <= c.runN.amps * 0.12, Math.abs(c.run.amps - c.runN.amps) <= c.runN.amps * 0.25) },
    ], note: [forcedNote(c), hydroSameAmpsUp(c)].filter(Boolean).join(' ') || undefined }),
  },
  {
    id: 'compteur_nuit', cat: 'hydro', label: 'Relever le compteur la nuit (aucun puisage)', tool: 'Compteur, 2 relevés à 1 h d\'écart',
    applies: (c) => c.kind === 'vessel' || c.kind === 'vfd' || c.kind === 'tank' || c.kind === 'continuous',
    run: (c) => { const leak = c.has('fuite_reseau') ? 0.45 * c.i.duty.qReq : 0;
      return { lines: [{ k: 'Volume passé en 1 h', v: `${f1(leak, 2)} m³`, ref: '0 m³', lvl: ok(leak < 0.01) }] }; },
  },
  {
    id: 'troncons', cat: 'hydro', label: 'Fermer les tronçons du réseau un à un', tool: 'Vannes de sectionnement + manomètre',
    applies: (c) => c.kind !== 'pit',
    run: (c) => ({ lines: [
      { k: 'Tronçon 1 (départ, 0 à 1/3)', v: 'pression stable', lvl: 'ok' },
      { k: 'Tronçon 2 (1/3 à 2/3)', v: c.has('fuite_reseau') ? 'la pression ne tient pas' : 'pression stable', lvl: ok(!c.has('fuite_reseau')) },
      { k: 'Tronçon 3 (fin)', v: 'pression stable', lvl: 'ok' },
    ] }),
  },
  {
    id: 'trace', cat: 'hydro', label: 'Parcourir le tracé de la conduite', tool: 'À pied',
    applies: () => true,
    run: (c) => { const L = c.i.ref.length;
      return { lines: [{ k: 'Observation', v: c.has('fuite_reseau') ? `Zone humide et affaissement à ${Math.round(L * 0.45)} m du départ` : c.st.burst ? 'Raccord qui fuit près de la pompe' : 'Rien d\'anormal', lvl: ok(!c.has('fuite_reseau') && !c.st.burst) }] }; },
  },
  {
    id: 'vacuo', cat: 'hydro', label: 'Vacuomètre à l\'aspiration, pompe en marche', tool: 'Manovacuomètre',
    applies: (c) => !c.imm,
    run: (c) => { const v = c.run.pAsp - (c.has('crepine_colmatee') ? 0.35 : 0), vn = c.runN.pAsp;
      return { lines: [{ k: 'Pression à l\'aspiration', v: `${f1(v, 2)} bar${c.has('air_asp') ? ' (aiguille qui oscille)' : ''}` }, { k: 'À la mise en service', v: `${f1(vn, 2)} bar` }, { k: 'Écart', v: `${f1(v - vn, 2)} bar`, ref: '± 0,1 bar', lvl: ok(Math.abs(v - vn) <= 0.1 && !c.has('air_asp'), Math.abs(v - vn) <= 0.2) }], note: forcedNote(c) }; },
  },
  {
    id: 'vacuo_arret', cat: 'hydro', label: 'Pompe arrêtée : vacuomètre et niveau dans la conduite d\'aspiration', tool: 'Manovacuomètre + chronomètre',
    applies: (c) => !c.imm && c.i.mode === 'aspiration',
    run: (c) => ({ lines: [{ k: 'Juste après l\'arrêt', v: 'conduite pleine' }, { k: 'Après 5 min', v: c.has('clapet_pied_fuit') ? 'conduite vidée, la pompe se désamorce' : 'toujours pleine', lvl: ok(!c.has('clapet_pied_fuit')) }] }),
  },
  {
    id: 'remplir', cat: 'hydro', label: 'Remplir la pompe et la conduite d\'aspiration, puis attendre', tool: 'Bouchon de remplissage',
    applies: (c) => !c.imm && c.i.mode === 'aspiration',
    run: (c) => ({ lines: [{ k: 'Niveau au bouchon', v: c.has('clapet_pied_fuit') ? 'redescend en 3 minutes' : c.has('air_asp') ? 'stable, mais bulles en marche' : 'stable', lvl: ok(!c.has('clapet_pied_fuit')) }] }),
  },
  {
    id: 'arroser', cat: 'hydro', label: 'Arroser les raccords d\'aspiration pompe en marche', tool: 'Arrosoir',
    applies: (c) => c.i.mode === 'aspiration',
    run: (c) => ({ lines: [{ k: 'Bruit de la pompe', v: c.has('air_asp') ? 'Change net quand on arrose le raccord de la bride d\'entrée' : 'Ne change nulle part', lvl: ok(!c.has('air_asp')) }], note: forcedNote(c) }),
  },
  {
    id: 'debit_compare', cat: 'hydro', label: 'Débit de la pompe comparé au compteur de la maison', tool: 'Débitmètre + compteur',
    applies: (c) => !!c.i.backup?.on,
    run: (c) => { const q = c.st.on ? c.st.q : c.runN.q, house = c.has('flotteur_secours') ? q * 0.35 : q * 0.95;
      return { lines: [{ k: 'Débit de la pompe', v: `${f1(q)} m³/h` }, { k: 'Compteur de la maison', v: `${f1(house)} m³/h`, lvl: ok(house >= q * 0.85) }], note: c.has('flotteur_secours') ? 'La différence part ailleurs (trop-plein du réservoir).' : undefined }; },
  },
  // ======================= Niveaux d'eau =======================
  {
    id: 'sonde', cat: 'niveau', label: 'Niveau d\'eau pompe en marche (sonde lumineuse / règle)', tool: 'Sonde lumineuse',
    applies: (c) => c.kind !== 'pit',
    run: (c) => {
      if (c.forage) {
        const g = c.i.geo, lvl = g.staticLevel + (c.st.aqS ?? (g.dynamicLevel - g.staticLevel)) + (c.st.dd ?? 0);
        const exp = c.st.aqN != null ? g.staticLevel + c.st.aqN : g.dynamicLevel;
        return { lines: [{ k: 'Niveau dynamique mesuré', v: `${f1(lvl)} m` }, { k: 'Attendu à ce débit (essai de pompage)', v: `${f1(exp)} m` }, { k: 'Eau au-dessus de la pompe', v: `${f1(g.pumpDepth - lvl)} m`, lvl: ok(g.pumpDepth - lvl > 3, g.pumpDepth - lvl > 1) }, { k: 'Écart', v: `${f1(lvl - exp)} m`, ref: '≤ 15 % du rabattement', lvl: ok(lvl - exp <= Math.max(0.5, (exp - g.staticLevel) * 0.15), lvl - exp <= Math.max(1, (exp - g.staticLevel) * 0.3)) }], note: forcedNote(c) };
      }
      const drop = c.st.dd ?? 0;
      return { lines: [{ k: 'Niveau dans la bâche / la réserve', v: drop > 0.05 ? `${f1(drop)} m sous le niveau normal` : 'normal', lvl: ok(drop < 0.3, drop < 0.6) }] };
    },
  },
  {
    id: 'statique', cat: 'niveau', label: 'Niveau au repos (statique), pompe arrêtée depuis 1 h', tool: 'Sonde lumineuse',
    applies: (c) => c.forage,
    run: (c) => { const g = c.i.geo, s = g.staticLevel + (c.st.dd ?? 0) * 0.7;
      return { lines: [{ k: 'Statique mesuré', v: `${f1(s)} m` }, { k: 'Statique d\'origine', v: `${f1(g.staticLevel)} m` }, { k: 'Écart', v: `${f1(s - g.staticLevel)} m`, ref: '≤ 0,5 m', lvl: ok(s - g.staticLevel <= 0.5, s - g.staticLevel <= 1.5) }] }; },
  },
  {
    id: 'debit_spec', cat: 'niveau', label: 'Débit spécifique (débit ÷ rabattement)', tool: 'Calcul',
    applies: (c) => c.forage,
    run: (c) => { const g = c.i.geo, q = c.run.q, rab = Math.max(0.1, (c.st.aqS ?? g.dynamicLevel - g.staticLevel) + (c.st.dd ?? 0)), qn = c.runN.q, rabN = Math.max(0.1, g.dynamicLevel - g.staticLevel);
      const s = q / rab, sn = qn / rabN;
      return { lines: [{ k: 'Aujourd\'hui', v: `${f1(s, 2)} m³/h par m` }, { k: 'Rapport de forage', v: `${f1(sn, 2)} m³/h par m` }, { k: 'Évolution', v: `${pct(s, sn)} %`, ref: '≥ −15 %', lvl: ok(pct(s, sn) >= -15, pct(s, sn) >= -30) }] }; },
  },
  {
    id: 'camera', cat: 'niveau', label: 'Inspection caméra du forage', tool: 'Caméra de forage',
    applies: (c) => c.forage,
    run: (c) => ({ lines: [
      { k: 'Crépines', v: c.has('crepine_forage') ? 'Fentes en grande partie bouchées, dépôts orangés' : 'Fentes ouvertes', lvl: ok(!c.has('crepine_forage')) },
      { k: 'Colonne de refoulement', v: c.has('colonne_percee') ? `Jet d'eau à un raccord, vers ${Math.round(c.i.geo.pumpDepth * 0.55)} m` : 'Étanche', lvl: ok(!c.has('colonne_percee')) },
      { k: 'Fond du forage', v: c.has('ensablement') ? 'Sable accumulé (2 m)' : 'Propre', lvl: ok(!c.has('ensablement')) },
    ], how: 'Pompe remontée.' }),
  },
  {
    id: 'analyse', cat: 'niveau', label: 'Analyse d\'eau (fer, manganèse, dureté)', tool: 'Laboratoire',
    applies: (c) => c.forage,
    run: (c) => { const fe = c.has('crepine_forage') ? 1.8 : 0.12;
      return { lines: [{ k: 'Fer', v: `${f1(fe, 2)} mg/L`, ref: '≤ 0,2 mg/L', lvl: ok(fe <= 0.2) }, { k: 'Manganèse', v: c.has('crepine_forage') ? '0,15 mg/L' : '0,02 mg/L', ref: '≤ 0,05 mg/L', lvl: ok(!c.has('crepine_forage')) }, { k: 'Dureté', v: '18 °f' }] }; },
  },
  {
    id: 'bache_alim', cat: 'niveau', label: 'Alimentation de la bâche / de la citerne', tool: 'Visuel',
    applies: (c) => !c.forage && c.kind !== 'pit',
    run: (c) => ({ lines: [{ k: 'Arrivée d\'eau', v: c.has('source_tarie') ? 'Débit très faible : l\'arrivée ne compense plus le pompage' : 'Normale', lvl: ok(!c.has('source_tarie')) }] }),
  },
  {
    id: 'seau', cat: 'niveau', label: 'Laisser décanter un seau d\'eau pompée', tool: 'Seau, 10 min',
    applies: (c) => c.imm || c.forage,
    run: (c) => ({ lines: [{ k: 'Fond du seau', v: c.has('ensablement') ? 'Couche de sable de 1 à 2 cm' : 'Propre', lvl: ok(!c.has('ensablement')) }] }),
  },
  {
    id: 'compteur_h', cat: 'niveau', label: 'Compteur horaire et volumes pompés', tool: 'Compteur horaire + compteur d\'eau',
    applies: () => true,
    run: (c) => { const r = c.run.q, rn = c.runN.q;
      return { lines: [{ k: 'Volume par heure de marche', v: `${f1(r)} m³/h` }, { k: 'À la mise en service', v: `${f1(rn)} m³/h` }, { k: 'Évolution', v: `${pct(r, rn)} %`, ref: '≥ −10 %', lvl: ok(pct(r, rn) >= -10, pct(r, rn) >= -20) }] }; },
  },
  {
    id: 'reservoir', cat: 'niveau', label: 'Monter au réservoir et regarder le niveau et le flotteur', tool: 'Visuel',
    applies: (c) => c.kind === 'tank' || !!c.i.backup?.on,
    run: (c) => { const L: TestLine[] = [];
      if (c.kind === 'tank') L.push({ k: 'Réservoir principal', v: c.has('flotteur_res') ? 'Plein, l\'eau coule au trop-plein ; flotteur coincé en position basse' : `Rempli à ${Math.round(Math.min(1, c.st.x) * 100)} %, flotteur libre`, lvl: ok(!c.has('flotteur_res')) });
      if (c.i.backup?.on) L.push({ k: 'Réservoir de secours', v: c.has('flotteur_secours') ? 'Plein, l\'eau entre toujours et part au trop-plein' : 'Le robinet à flotteur coupe quand la cuve est pleine', lvl: ok(!c.has('flotteur_secours')) });
      return { lines: L }; },
  },
  {
    id: 'flotteur_bras', cat: 'acc', label: 'Soulever à la main le bras du robinet à flotteur', tool: 'À la main',
    applies: (c) => !!c.i.backup?.on,
    run: (c) => ({ lines: [{ k: 'Arrivée d\'eau', v: c.has('flotteur_secours') ? 'Ne se coupe pas' : 'Se coupe', lvl: ok(!c.has('flotteur_secours')) }] }),
  },
  {
    id: 'flotteur_liaison', cat: 'acc', label: 'Câble ou liaison radio du flotteur du réservoir', tool: 'Continuité / témoin radio',
    applies: (c) => c.kind === 'tank' && c.on('flotteur_res'),
    run: (c) => ({ lines: [{ k: 'Liaison', v: 'Bonne : le coffret reçoit bien l\'état du flotteur', lvl: 'ok' }, { k: 'État transmis', v: c.has('flotteur_res') ? '« réservoir vide » en permanence' : c.st.x >= 0.95 ? '« réservoir plein »' : '« réservoir à remplir »', lvl: ok(!c.has('flotteur_res')) }] }),
  },
  // ======================= Fosse, flotteurs =======================
  {
    id: 'fosse', cat: 'acc', label: 'Ouvrir la fosse / le regard et regarder les flotteurs', tool: 'Visuel',
    applies: (c) => c.kind === 'pit',
    run: (c) => ({ lines: [
      { k: 'Flotteur de marche', v: c.has('flotteur_bas') ? 'Coincé en position basse (graisses)' : c.has('flotteurs_emmeles') ? 'Câble enroulé autour de celui d\'arrêt' : 'Libre', lvl: ok(!c.has('flotteur_bas', 'flotteurs_emmeles')) },
      { k: 'Flotteur d\'arrêt', v: c.has('flotteur_haut') ? 'Coincé en position haute (câble pris)' : c.has('flotteurs_emmeles') ? 'Câble enroulé autour de celui de marche' : 'Libre', lvl: ok(!c.has('flotteur_haut', 'flotteurs_emmeles')) },
      { k: 'Niveau de la fosse', v: `${Math.round(c.st.x * 100)} cm au-dessus du flotteur bas` },
    ] }),
  },
  {
    id: 'flotteur_main', cat: 'acc', label: 'Basculer chaque flotteur à la main', tool: 'À la main',
    applies: (c) => c.kind === 'pit',
    run: (c) => ({ lines: [
      { k: 'Soulever le flotteur de marche', v: c.has('flotteur_bas') ? 'Il reste bloqué : rien ne se passe' : 'La pompe démarre', lvl: ok(!c.has('flotteur_bas')) },
      { k: 'Baisser le flotteur d\'arrêt', v: c.has('flotteur_haut') ? 'Il ne bascule pas : la pompe continue' : 'La pompe s\'arrête', lvl: ok(!c.has('flotteur_haut')) },
    ], note: c.has('flotteurs_emmeles') ? 'Une fois démêlés à la main, les deux flotteurs fonctionnent.' : undefined }),
  },
  {
    id: 'flotteur_cont', cat: 'acc', label: 'Continuité du flotteur de marche (bas puis haut)', tool: 'Ohmmètre',
    applies: (c) => c.kind === 'pit',
    run: (c) => ({ lines: [{ k: 'Flotteur en bas', v: 'Ouvert (∞)' }, { k: 'Flotteur levé à la main', v: c.has('flotteur_bas') ? 'Ouvert (∞) : le contact ne se ferme pas, le flotteur reste coincé' : 'Fermé (0 Ω)', lvl: ok(!c.has('flotteur_bas')) }] }),
  },
  {
    id: 'vidange', cat: 'hydro', label: 'Chronométrer une vidange de la fosse', tool: 'Chronomètre',
    applies: (c) => c.kind === 'pit',
    run: (c) => { const V = Math.max(0.05, (c.i.geo.tankVolume || 300) / 1000), qin = c.i.duty.qReq * 0.3;
      const t = (q: number) => (q - qin > 0.05 ? (V / (q - qin)) * 60 : Infinity);
      const a = t(c.run.q), b = t(c.runN.q);
      return { lines: [{ k: 'Durée mesurée', v: Number.isFinite(a) ? `${f1(a)} min` : 'la fosse ne baisse pas' }, { k: 'À la mise en service', v: `${f1(b)} min` }, { k: 'Évolution', v: Number.isFinite(a) ? `+${Math.max(0, pct(a, b))} %` : '—', ref: '≤ +15 %', lvl: ok(Number.isFinite(a) && a <= b * 1.15, Number.isFinite(a) && a <= b * 1.4) }], note: forcedNote(c) }; },
  },
  // ======================= Réservoir à vessie, pressostat, anti-bélier =======================
  {
    id: 'precharge', cat: 'acc', label: 'Précharge du réservoir à vessie (pompe arrêtée, réseau vidé)', tool: 'Manomètre de gonflage',
    applies: (c) => c.on('vessie') && !!c.ctx.er.vessel,
    run: (c) => { const pre = c.ctx.er.vessel!.pre, lu = c.has('vessie_crevee') ? 0.2 : pre;
      return { lines: [{ k: 'Précharge mesurée', v: `${f1(lu)} bar` }, { k: 'Précharge prévue', v: `${f1(pre)} bar (marche − 0,2)` }, { k: 'Écart', v: `${f1(lu - pre)} bar`, ref: '± 0,2 bar', lvl: ok(Math.abs(lu - pre) <= 0.2) }] }; },
  },
  {
    id: 'valve', cat: 'acc', label: 'Appuyer sur la valve de gonflage', tool: 'À la main',
    applies: (c) => c.on('vessie') || c.on('anti_belier'),
    run: (c) => { const L: TestLine[] = [];
      if (c.on('vessie')) L.push({ k: 'Réservoir à vessie', v: c.has('vessie_crevee') ? 'De l\'eau sort de la valve' : 'De l\'air sort', lvl: ok(!c.has('vessie_crevee')) });
      if (c.on('anti_belier')) L.push({ k: 'Ballon anti-bélier', v: c.has('belier_degonfle') ? 'Presque rien ne sort : plus d\'air' : 'De l\'air sort', lvl: ok(!c.has('belier_degonfle')) });
      return { lines: L }; },
  },
  {
    id: 'taper', cat: 'acc', label: 'Taper sur le réservoir à vessie (haut et bas)', tool: 'À la main',
    applies: (c) => c.on('vessie'),
    run: (c) => ({ lines: [{ k: 'Son', v: c.has('vessie_crevee') ? 'Plein partout (sourd)' : 'Creux en haut (air), plein en bas (eau)', lvl: ok(!c.has('vessie_crevee')) }] }),
  },
  {
    id: 'precharge_ab', cat: 'acc', label: 'Précharge du ballon anti-bélier (ballon isolé)', tool: 'Manomètre de gonflage',
    applies: (c) => c.on('anti_belier'),
    run: (c) => { const pre = Math.max(0.5, c.bar(c.i.geo.hRef) - 0.2);
      return { lines: [{ k: 'Mesurée', v: `${f1(c.has('belier_degonfle') ? 0.1 : pre)} bar` }, { k: 'Prévue', v: `${f1(pre)} bar` }], note: c.has('belier_degonfle') ? 'Ballon vide d\'air : il ne protège plus.' : undefined }; },
  },
  {
    id: 'pressostat_seuils', cat: 'acc', label: 'Pressions de marche et d\'arrêt lues au manomètre', tool: 'Manomètre (un cycle complet)',
    applies: (c) => c.kind === 'vessel' && c.on('pressostat') && !!c.ctx.er.vessel,
    run: (c) => { const v = c.ctx.er.vessel!, drift = c.has('pressostat_deregle') ? 1 : 0, stuck = c.has('pressostat_colle');
      return { lines: [
        { k: 'Démarrage à', v: `${f1(v.pOn - drift)} bar`, ref: `${f1(v.pOn)} bar prévu`, lvl: ok(!drift) },
        { k: 'Arrêt à', v: stuck ? `ne s'arrête pas (${f1(Math.max(v.pOff + 0.4, c.st.x))} bar)` : `${f1(v.pOff - drift)} bar`, ref: `${f1(v.pOff)} bar prévu`, lvl: ok(!drift && !stuck) },
      ] }; },
  },
  {
    id: 'pressostat_ohm', cat: 'acc', label: 'Contact du pressostat à l\'ohmmètre (au-dessus de l\'arrêt)', tool: 'Ohmmètre',
    applies: (c) => c.kind === 'vessel' && c.on('pressostat'),
    run: (c) => ({ lines: [{ k: 'Contact', v: c.has('pressostat_colle') ? 'Fermé (0 Ω) alors que la pression dépasse l\'arrêt' : 'Ouvert au-dessus de l\'arrêt, fermé en dessous de la marche', lvl: ok(!c.has('pressostat_colle')) }], how: 'Pressostat débranché, pression montée au-dessus du seuil d\'arrêt.' }),
  },
  // ======================= Mécanique =======================
  {
    id: 'ecoute', cat: 'meca', label: 'Écouter la pompe et le moteur', tool: 'Stéthoscope / tournevis',
    applies: () => true,
    run: (c) => { const a = acoustics(c.ctx, asRunning(c.ctx, c.st));
      const src = a.sources.filter((s) => s.kind !== 'groupe' && s.level >= 0.3).sort((x, y) => y.level - x.level).slice(0, 3);
      const odd = a.main && !['moteur', 'ecoulement', 'recirculation'].includes(a.main.kind);
      return { lines: src.map((s) => ({ k: s.label, v: s.level > 0.7 ? 'fort' : 'net', lvl: ['moteur', 'ecoulement'].includes(s.kind) ? 'ok' : s.kind === 'recirculation' ? undefined : 'warn' })), note: [c.imm ? 'Pompe immergée : écoute sur la colonne en tête.' : '', odd ? '' : 'Rien d\'anormal à l\'oreille.', forcedNote(c) ?? ''].filter(Boolean).join(' ') }; },
  },
  {
    id: 'vibro', cat: 'meca', label: 'Vibrations aux paliers (radial et axial)', tool: 'Vibromètre',
    applies: (c) => !c.imm,
    run: (c) => { const a = acoustics(c.ctx, asRunning(c.ctx, c.st)); const ax = c.has('desalignement') ? a.vib * 0.9 : a.vib * 0.45;
      return { lines: [{ k: 'Radial', v: `${f1(a.vib)} mm/s (zone ${a.zone})`, ref: 'zone A ou B', lvl: ok(a.zone === 'A' || a.zone === 'B', a.zone === 'C') }, { k: 'Axial', v: `${f1(ax)} mm/s`, ref: '< 50 % du radial', lvl: ok(ax < a.vib * 0.6) }, { k: 'Fréquence dominante', v: c.has('desalignement') ? '2 × la vitesse de rotation' : c.has('fixation') ? '1 × la vitesse, très directionnelle' : c.has('roulements') ? 'hautes fréquences (défaut de roulement)' : c.has('roue_bouchee', 'lingettes') ? '1 × la vitesse (balourd)' : '1 × la vitesse, faible' }], note: forcedNote(c) }; },
  },
  {
    id: 'temp', cat: 'meca', label: 'Température du moteur et des paliers', tool: 'Thermomètre infrarouge',
    applies: () => true,
    run: (c) => { const amb = c.i.fluid.temp ?? 25, tm = c.st.tm ?? amb + 35, tp = amb + 30 + (c.has('roulements') ? 35 : c.has('desalignement') ? 15 : 0);
      const carc = c.imm ? null : Math.round(amb + (tm - amb) * 0.55);
      return { lines: [...(carc != null ? [{ k: 'Carcasse du moteur', v: `${carc} °C`, ref: '≤ 70 °C', lvl: ok(carc <= 70, carc <= 85) }] : [{ k: 'Moteur', v: 'immergé : non mesurable, voir le courant', lvl: undefined }] as TestLine[]),
        ...(c.imm ? [] : [{ k: 'Paliers', v: `${Math.round(tp)} °C`, ref: '≤ 80 °C', lvl: ok(tp <= 80, tp <= 90) } as TestLine])] }; },
  },
  {
    id: 'arbre_main', cat: 'meca', label: 'Tourner l\'arbre à la main (moteur consigné)', tool: 'À la main',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Arbre', v: c.has('arbre_casse') ? 'Le moteur tourne librement, la roue ne suit pas' : c.has('secours_grippee') ? 'Pompe de secours : bloquée ; pompe en service : libre' : c.has('roulements') ? 'Point dur et grattement à chaque tour' : c.has('ensablement') ? 'Dur, crissements' : c.has('lingettes', 'roue_bouchee') ? 'Freiné, on sent des fibres ou débris' : 'Tourne librement, sans bruit', lvl: ok(!c.has('arbre_casse', 'secours_grippee', 'roulements', 'ensablement', 'lingettes', 'roue_bouchee')) }] }),
  },
  {
    id: 'remonter', cat: 'meca', label: 'Remonter la pompe et l\'inspecter', tool: 'Levage (trépied, barres de guidage)',
    applies: (c) => c.imm,
    run: (c) => ({ lines: inspectLines(c, true), how: c.forage ? 'Pompe remontée avec sa colonne.' : 'Pompe remontée sur ses barres de guidage.' }),
  },
  {
    id: 'ouvrir', cat: 'meca', label: 'Ouvrir le corps de pompe et inspecter', tool: 'Outillage (pompe consignée, vidée)',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: inspectLines(c, false) }),
  },
  {
    id: 'lanterne', cat: 'meca', label: 'Regarder la lanterne entre pompe et moteur', tool: 'Visuel, pompe en marche',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Garniture', v: c.has('garniture') || c.st.sealGone ? 'Goutte-à-goutte le long de l\'arbre, traces de rouille' : 'Sèche', lvl: ok(!(c.has('garniture') || c.st.sealGone)) }] }),
  },
  {
    id: 'traces_sec', cat: 'meca', label: 'Traces de marche à sec sur la garniture', tool: 'Démontage de la garniture',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Faces de la garniture', v: c.st.sealGone ? 'Brûlées, fissurées : marche à sec' : c.has('garniture') ? 'Usées et rayées (abrasion, âge), pas de brûlure' : 'Lisses', lvl: ok(!(c.st.sealGone || c.has('garniture'))) }] }),
  },
  {
    id: 'sens', cat: 'meca', label: 'Sens de rotation comparé à la flèche', tool: 'Visuel (ventilateur au démarrage)',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Sens', v: c.has('rotation') ? 'Contraire à la flèche du carter' : 'Celui de la flèche', lvl: ok(!c.has('rotation')) }] }),
  },
  {
    id: 'inverser', cat: 'meca', label: 'Inverser deux phases et comparer débit et pression', tool: 'Bornier du coffret',
    applies: (c) => c.tri,
    run: (c) => { const bad = c.has('rotation'), q = c.run.q, p = c.run.pRef;
      const q2 = bad ? c.runN.q : q * 0.5, p2 = bad ? c.runN.pRef : p * 0.45;
      return { lines: [{ k: 'Branchement actuel', v: `${f1(q)} m³/h · ${f1(p)} bar` }, { k: 'Deux phases inversées', v: `${f1(q2)} m³/h · ${f1(p2)} bar` }], note: `Le bon sens est celui qui donne le plus : ${bad ? 'le branchement inversé' : 'le branchement actuel'}. ${bad ? 'Laisser les phases inversées.' : 'Remettre les phases comme avant.'}` }; },
  },
  {
    id: 'alignement', cat: 'meca', label: 'Alignement moteur / pompe', tool: 'Comparateur ou laser',
    applies: (c) => !c.imm && c.i.pumpType !== 'surface',
    run: (c) => ({ lines: [{ k: 'Décalage', v: c.has('desalignement') ? '0,45 mm' : '0,03 mm', ref: '≤ 0,05 mm', lvl: ok(!c.has('desalignement')) }, { k: 'Angle', v: c.has('desalignement') ? '0,25 mm/100 mm' : '0,02 mm/100 mm', ref: '≤ 0,05 mm/100 mm', lvl: ok(!c.has('desalignement')) }] }),
  },
  {
    id: 'brides', cat: 'meca', label: 'Desserrer les brides : la tuyauterie tombe-t-elle en face ?', tool: 'Clés',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Tuyauterie', v: c.has('desalignement') ? 'Se décale de 6 mm : elle tirait sur la pompe' : 'Reste en face', lvl: ok(!c.has('desalignement')) }] }),
  },
  {
    id: 'socle', cat: 'meca', label: 'Toucher le socle pompe en marche', tool: 'À la main',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Socle', v: c.has('fixation') ? 'Le groupe bouge et tape sur son massif' : 'Ferme, légère vibration normale', lvl: ok(!c.has('fixation')) }], note: forcedNote(c) }),
  },
  {
    id: 'boulons', cat: 'meca', label: 'Serrage des boulons d\'ancrage et du socle', tool: 'Clé dynamométrique',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Boulons', v: c.has('fixation') ? '2 boulons sur 4 tournent à la main' : 'Tous au couple', lvl: ok(!c.has('fixation')) }] }),
  },
  {
    id: 'plots', cat: 'meca', label: 'Plots anti-vibratiles et massif', tool: 'Visuel',
    applies: (c) => !c.imm,
    run: (c) => ({ lines: [{ k: 'Plots', v: c.has('fixation') ? 'Un plot écrasé' : 'Bons', lvl: ok(!c.has('fixation')) }, { k: 'Massif', v: c.has('fixation') ? 'Fissure au pied d\'un ancrage' : 'Sain', lvl: ok(!c.has('fixation')) }] }),
  },
  // ======================= Aspiration =======================
  {
    id: 'crepine_vue', cat: 'acc', label: 'Démonter et inspecter la crépine / le filtre', tool: 'Outillage',
    applies: (c) => ['crepine', 'filtre_asp', 'prefiltre', 'clapet_pied'].some((x) => c.on(x)),
    run: (c) => ({ lines: [{ k: 'Crépine / filtre', v: c.has('crepine_colmatee') ? 'Colmaté aux trois quarts (dépôts, feuilles)' : 'Propre', lvl: ok(!c.has('crepine_colmatee')) }] }),
  },
  {
    id: 'clapet_vue', cat: 'acc', label: 'Démonter et inspecter les clapets', tool: 'Outillage',
    applies: (c) => c.on('clapet_pied') || c.on('clapet_ar') || c.on('clapet_boule'),
    run: (c) => { const L: TestLine[] = [];
      if (c.on('clapet_pied')) L.push({ k: 'Clapet de pied', v: c.has('clapet_pied_fuit') ? 'Caillou coincé sous le clapet, il ne ferme plus' : 'Ferme bien', lvl: ok(!c.has('clapet_pied_fuit')) });
      if (c.on('clapet_ar') || c.on('clapet_boule')) L.push({ k: 'Clapet anti-retour', v: c.has('clapet_ar_fuit') ? 'Siège marqué, joint usé : il ne ferme plus complètement' : 'Ferme bien', lvl: ok(!c.has('clapet_ar_fuit')) });
      return { lines: L }; },
  },
  {
    id: 'joints_asp', cat: 'acc', label: 'Joints de brides et colliers de l\'aspiration', tool: 'Visuel + clés',
    applies: (c) => c.i.mode === 'aspiration',
    run: (c) => ({ lines: [{ k: 'Bride d\'entrée de la pompe', v: c.has('air_asp') ? 'Joint pincé, collier desserré' : 'Étanche', lvl: ok(!c.has('air_asp')) }, { k: 'Autres raccords', v: 'Étanches', lvl: 'ok' }] }),
  },
  {
    id: 'immersion', cat: 'niveau', label: 'Immersion de la crépine (risque de vortex)', tool: 'Visuel / règle',
    applies: (c) => c.i.mode === 'aspiration',
    run: (c) => { const imm = Math.max(0, 0.8 - (c.st.dd ?? 0));
      return { lines: [{ k: 'Hauteur d\'eau au-dessus de la crépine', v: `${f1(imm, 2)} m`, ref: '≥ 0,5 m', lvl: ok(imm >= 0.5, imm >= 0.3) }, { k: 'Vortex en surface', v: imm < 0.3 ? 'Oui' : 'Non', lvl: ok(imm >= 0.3) }] }; },
  },
  // ======================= Groupe électrogène =======================
  {
    id: 'gen_jauge', cat: 'groupe', label: 'Jauge et réservoir de gasoil', tool: 'Visuel',
    applies: (c) => c.gen && !!c.st.gen,
    run: (c) => { const g = c.st.gen!; const p = Math.round((g.fuel / Math.max(1, g.tank)) * 100);
      return { lines: [{ k: 'Gasoil', v: `${f1(g.fuel, 0)} L sur ${f1(g.tank, 0)} L (${p} %)`, lvl: ok(p > 15, p > 5) }] }; },
  },
  {
    id: 'gen_registre', cat: 'groupe', label: 'Consommation de gasoil (registre, L/h)', tool: 'Registre + jauge',
    applies: (c) => c.gen && !!c.st.gen,
    run: (c) => { const pr = genSpec(c.i, c.ctx.er).pr, normal = 0.07 * pr + 0.28 * c.runN.kw, now = normal * (c.has('gen_filtre_air') ? 1.15 : 1);
      return { lines: [{ k: 'Consommation relevée', v: `${f1(now, 1)} L/h` }, { k: 'Habituelle', v: `${f1(normal, 1)} L/h` }, { k: 'Écart', v: `${pct(now, normal)} %`, ref: '≤ +5 %', lvl: ok(pct(now, normal) <= 5) }] }; },
  },
  {
    id: 'gen_hz', cat: 'groupe', label: 'Fréquence du groupe en charge', tool: 'Fréquencemètre du coffret',
    applies: (c) => c.gen,
    run: (c) => ({ lines: [{ k: 'Fréquence', v: c.has('gen_filtre_gasoil') ? 'varie entre 47 et 53 Hz' : c.has('gen_filtre_air') ? '48,6 Hz' : '50,0 Hz', ref: '50 Hz ± 1 %', lvl: ok(!c.has('gen_filtre_gasoil', 'gen_filtre_air'), c.has('gen_filtre_air')) }] }),
  },
  {
    id: 'gen_prefiltre', cat: 'groupe', label: 'Préfiltre décanteur et filtres à gasoil', tool: 'Visuel',
    applies: (c) => c.gen,
    run: (c) => ({ lines: [{ k: 'Bol décanteur', v: c.has('gen_filtre_gasoil') ? 'Eau et boues au fond' : 'Propre', lvl: ok(!c.has('gen_filtre_gasoil')) }, { k: 'Filtre à gasoil', v: c.has('gen_filtre_gasoil') ? 'Noirci, colmaté' : 'Propre', lvl: ok(!c.has('gen_filtre_gasoil')) }] }),
  },
  {
    id: 'gen_air', cat: 'groupe', label: 'Indicateur de colmatage et cartouche du filtre à air', tool: 'Visuel',
    applies: (c) => c.gen,
    run: (c) => ({ lines: [{ k: 'Indicateur', v: c.has('gen_filtre_air') ? 'Rouge' : 'Vert', lvl: ok(!c.has('gen_filtre_air')) }, { k: 'Cartouche à la lumière', v: c.has('gen_filtre_air') ? 'Opaque, chargée de poussière' : 'La lumière passe', lvl: ok(!c.has('gen_filtre_air')) }] }),
  },
  {
    id: 'gen_refroid', cat: 'groupe', label: 'Refroidissement : liquide, courroie, radiateur', tool: 'Visuel (moteur froid)',
    applies: (c) => c.gen,
    run: (c) => { const b = c.has('gen_surchauffe');
      return { lines: [{ k: 'Liquide de refroidissement', v: 'Au niveau', lvl: 'ok' }, { k: 'Courroie du ventilateur', v: b ? 'Cassée' : 'Bonne, bien tendue', lvl: ok(!b) }, { k: 'Faisceau du radiateur', v: b ? 'Encrassé (poussière, insectes)' : 'Propre', lvl: ok(!b) }, { k: 'Température moteur', v: `${Math.round(c.st.gen?.temp ?? 80)} °C`, ref: '≤ 95 °C', lvl: ok((c.st.gen?.temp ?? 80) <= 95, (c.st.gen?.temp ?? 80) <= 103) }] }; },
  },
  {
    id: 'gen_batt', cat: 'groupe', label: 'Batterie de démarrage, cosses et chargeur', tool: 'Voltmètre',
    applies: (c) => c.gen,
    run: (c) => { const b = c.has('gen_batterie');
      return { lines: [{ k: 'Tension au repos', v: b ? '10,9 V' : '12,7 V', ref: '≥ 12,4 V', lvl: ok(!b) }, { k: 'Cosses', v: b ? 'Oxydées' : 'Propres, serrées', lvl: ok(!b, true) }, { k: 'Chargeur de maintien', v: b ? 'Débranché' : 'Charge (13,6 V)', lvl: ok(!b) }] }; },
  },
  {
    id: 'gen_u', cat: 'groupe', label: 'Tension du groupe à vide puis en charge', tool: 'Voltmètre',
    applies: (c) => c.gen,
    run: (c) => { const avr = c.has('gen_avr');
      return { lines: [{ k: 'À vide', v: avr ? '355 V' : '402 V', ref: '400 V', lvl: ok(!avr) }, { k: 'En charge (pompe en marche)', v: avr ? '340 V' : '396 V', ref: '≥ 380 V', lvl: ok(!avr) }, { k: 'Fusibles et réglage de l\'AVR', v: avr ? 'Fusible bon, la consigne ne tient pas : AVR défaillant' : 'Bons', lvl: ok(!avr) }] }; },
  },
  {
    id: 'gen_kva', cat: 'groupe', label: 'Puissance du groupe comparée à celle conseillée', tool: 'Plaque du groupe',
    applies: (c) => c.gen,
    run: (c) => { const kva = genSpec(c.i, c.ctx.er).kva, rec = c.ctx.er.gen?.kva ?? c.ctx.er.genKva;
      return { lines: [{ k: 'Groupe installé', v: `${f1(kva, 0)} kVA` }, { k: 'Conseillé pour ce moteur', v: `${f1(rec, 0)} kVA`, lvl: ok(kva >= rec * 0.98, kva >= rec * 0.8) }] }; },
  },
];

/** Débit et pression normaux mais courant élevé : même travail hydraulique, l'énergie en plus part en pertes. */
function hydroSameAmpsUp(c: TCtx) {
  const qOk = c.run.q >= c.runN.q * 0.9, pOk = Math.abs(c.run.pRef - c.runN.pRef) <= Math.max(0.2, c.runN.pRef * 0.1);
  if (!qOk || !pOk || c.run.amps <= c.runN.amps * 1.12) return undefined;
  return 'Débit et pression normaux : la pompe fait le même travail hydraulique. Le courant en plus part donc en pertes, mécaniques (frottements) ou électriques (tension basse ou déséquilibrée, moteur en surcharge).';
}

/** Inspection de la pompe démontée (ou remontée du forage / de la fosse). */
function inspectLines(c: TCtx, imm: boolean): TestLine[] {
  const L: TestLine[] = [];
  L.push({ k: 'Roue', v: c.has('lingettes') ? 'Lingettes et fibres enroulées autour de la roue' : c.has('roue_bouchee') ? 'Canaux en partie bouchés (fibres, feuilles, sable)' : c.has('usure') ? 'Bords usés, jeu aux bagues d\'usure important' : c.has('ensablement') ? 'Usée par le sable, sable dans les étages' : 'Bon état', lvl: ok(!c.has('lingettes', 'roue_bouchee', 'usure', 'ensablement')) });
  L.push({ k: imm ? 'Accouplement cannelé' : 'Accouplement / arbre', v: c.has('arbre_casse') ? 'Cassé : le moteur ne lui transmet plus rien' : 'Bon', lvl: ok(!c.has('arbre_casse')) });
  L.push({ k: 'Roulements', v: c.has('roulements') ? 'Jeu et grattement, graisse noircie' : c.has('secours_grippee') ? 'Oxydés sur la pompe de secours' : 'Bons', lvl: ok(!c.has('roulements', 'secours_grippee')) });
  if (imm && c.forage) L.push({ k: 'Colonne et raccords', v: c.has('colonne_percee') ? 'Un raccord fendu, traces de jet' : 'Étanches', lvl: ok(!c.has('colonne_percee')) });
  if (imm) L.push({ k: 'Crépine de la pompe', v: c.has('ensablement') ? 'Sable' : 'Propre', lvl: ok(!c.has('ensablement')) });
  return L;
}


/** Test à faire pour chaque vérification de chaque panne (dans l'ordre de la liste « Comment le vérifier »). */
export const CHECK_TESTS: Record<string, string[]> = {
  air_asp: ['arroser', 'joints_asp', 'immersion'],
  clapet_pied_fuit: ['vacuo_arret', 'remplir', 'clapet_vue'],
  clapet_ar_fuit: ['clapet_vanne', 'mano_arret', 'clapet_vue'],
  roue_bouchee: ['i_phases', 'vanne_test', 'INSPECT'],
  vanne_fermee: ['vannes_pos', 'mano_marche'],
  fuite_reseau: ['compteur_nuit', 'troncons', 'trace'],
  flotteur_secours: ['reservoir', 'flotteur_bras', 'debit_compare'],
  crepine_forage: ['sonde', 'debit_spec', 'camera', 'analyse'],
  source_tarie: ['sonde', 'statique', 'bache_alim'],
  crepine_colmatee: ['vacuo', 'crepine_vue'],
  vessie_crevee: ['precharge', 'valve', 'taper'],
  pressostat_colle: ['pressostat_seuils', 'pressostat_ohm'],
  pressostat_deregle: ['pressostat_seuils'],
  capteur_hs: ['affichage', 'capteur_ma', 'capteur_cable'],
  flotteur_haut: ['fosse', 'flotteur_main'],
  flotteur_bas: ['flotteur_main', 'flotteur_cont'],
  flotteur_res: ['reservoir', 'flotteur_liaison'],
  perte_phase: ['u_contacteur', 'i_phases', 'bornes'],
  condensateur: ['capa', 'condo_vue'],
  isolement: ['megohm', 'isoler'],
  contacteur_colle: ['commande_off', 'contacts'],
  defaut_variateur: ['vfd_hist', 'vfd_rampe'],
  coupure: ['u_coffret', 'compteur_gen'],
  sous_tension: ['u_marche'],
  gen_gasoil: ['gen_jauge', 'gen_registre'],
  gen_filtre_gasoil: ['gen_hz', 'gen_prefiltre'],
  gen_filtre_air: ['gen_air'],
  gen_surchauffe: ['gen_refroid'],
  gen_batterie: ['gen_batt'],
  gen_avr: ['gen_u'],
  roulements: ['ecoute', 'temp', 'ARBRE'],
  garniture: ['lanterne', 'traces_sec'],
  rotation: ['sens', 'inverser', 'vanne_test'],
  colonne_percee: ['vanne_test', 'mano_arret', 'remonter'],
  ensablement: ['seau', 'compare_mes', 'i_demarrage'],
  usure: ['vanne_test', 'compteur_h'],
  desalignement: ['vibro', 'alignement', 'brides'],
  fixation: ['socle', 'boulons', 'plots'],
  arbre_casse: ['i_phases', 'arbre_main', 'remonter'],
  lingettes: ['i_phases', 'vidange', 'remonter'],
  flotteurs_emmeles: ['fosse', 'flotteur_main'],
  secours_grippee: ['ARBRE', 'quelle_pompe'],
  thermique_bas: ['relais', 'i_phases'],
  thermique_haut: ['relais', 'temp'],
  desequilibre: ['u_coffret', 'i_phases', 'bornes'],
  groupe_faible: ['u_demarrage', 'gen_kva'],
  belier_degonfle: ['precharge_ab', 'valve'],
};

export const testById = (id: string) => FIELD_TESTS.find((t) => t.id === id);
/** Résout un test « générique » selon l'installation (pompe immergée ou de surface, forage ou bâche). */
export function resolveTest(id: string, c: TCtx): FieldTest | undefined {
  if (id === 'INSPECT') return testById(c.imm ? 'remonter' : 'ouvrir');
  if (id === 'ARBRE') return testById(c.imm ? 'remonter' : 'arbre_main');
  return testById(id);
}
