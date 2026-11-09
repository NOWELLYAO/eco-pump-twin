import { BIG_TANK, backupCalc, backupMode, backupOf, floatKind, floatLow } from './backup';
import { fireCfg } from './fire';
import { ACCESSORIES, FLUIDS, PIPE_MATS, PUMP_MATS, PUMP_TYPES, refLen } from './catalog';
import type { Evaluation } from './evaluate';
import { elecConfig } from './ui/Electrical';
import type { Installation } from './types';

export type QCat = 'pompes' | 'tuyauterie' | 'raccords' | 'robinetterie' | 'mesure' | 'electricite' | 'coffret' | 'solaire' | 'divers' | 'prestations';
export const QCAT: Record<QCat, string> = {
  pompes: 'Pompes et moteurs', tuyauterie: 'Tuyauterie', raccords: 'Raccords, brides et supports', robinetterie: 'Robinetterie et accessoires hydrauliques',
  mesure: 'Instrumentation et régulation', electricite: 'Câbles et électricité', coffret: 'Coffret électrique (composants)', solaire: 'Installation solaire',
  divers: 'Petites fournitures et génie civil', prestations: 'Prestations',
};

export interface QItem { id: string; cat: QCat; desig: string; spec: string; qty: number; unit: string; note?: string }
export interface QuoteMeta {
  client?: string; site?: string; contact?: string; date?: string; note?: string;
  over?: Record<string, { qty?: number; off?: boolean }>;
  extra?: { desig: string; spec: string; qty: number; unit: string }[];
}

const f = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
const up = (v: number) => Math.ceil(v - 1e-9);
const RANGES = [1, 1.6, 2.5, 4, 6, 10, 16, 25, 40];
const gaugeRange = (pMax: number) => RANGES.find((r) => r >= pMax * 1.3) ?? 40;
const flanged = (dn: number) => dn >= 50;

/** Liste détaillée de tout ce qu'il faut acheter et faire, pour demander un devis. */
export function quoteItems(i: Installation, ev: Evaluation): QItem[] {
  const out: QItem[] = [];
  const add = (x: QItem) => { if (x.qty > 0) out.push(x); };
  const h = ev.hydro, e = ev.elec;
  const nP = Math.max(1, i.pump.count ?? 1);
  const sb = Math.max(0, i.pump.standby ?? 0);
  const imm = i.mode === 'immergee';
  const forage = i.pumpType === 'immergee_forage';
  const pit = imm && !forage;
  const fl = FLUIDS[i.fluid.type];
  const on = (id: string) => !!i.acc[id]?.on && ev.needs[id] !== 'na';
  const PN = i.ref.pn;

  // ---------- Pompes ----------
  add({ id: 'pompe', cat: 'pompes', desig: `Pompe ${PUMP_TYPES[i.pumpType].label}`, unit: 'u', qty: nP,
    spec: `${f(i.pump.qn)} m³/h à ${f(i.pump.hn)} m (point nominal)${i.pump.usePts ? ', selon courbe constructeur jointe' : ''} · point de service ${f(h.q / Math.max(1, h.n))} m³/h à ${f(h.h)} m par pompe · ${PUMP_MATS[i.pump.material]} · ${i.pump.nn} tr/min · brides ${imm ? `DN${i.pump.dnRef}` : `DN${i.pump.dnAsp}/DN${i.pump.dnRef}`} · liquide : ${fl.label} ${i.fluid.temp} °C${i.fluid.sandGm3 > 20 ? `, sable ${f(i.fluid.sandGm3, 0)} g/m³` : ''}${i.pump.passage > 5 ? ` · passage libre ≥ ${i.pump.passage} mm` : ''}${forage ? ` · Ø ${i.pump.diameterMm <= 100 ? '4"' : '6"'} pour forage Ø ${i.geo.boreDia} mm` : ''}`,
    note: nP > 1 ? `${nP - sb} en service${sb ? ` + ${sb} de secours` : ''}` : undefined });
  add({ id: 'moteur', cat: 'pompes', desig: `Moteur ${forage ? 'immergé 4"/6"' : pit ? 'submersible (intégré)' : 'électrique'}${i.acc.atex?.on ? ' ATEX' : ''}`, unit: 'u', qty: nP,
    spec: `${f(i.pump.motorKw, 2)} kW · ${i.elec.supply === 'mono' ? '230 V mono' : '400 V tri'} · ${i.pump.nn} tr/min · ${forage || pit ? 'IP68' : 'IP55, rendement IE3'}${e.start === 'variateur' ? ' · compatible variateur' : ''}`, note: 'souvent fourni avec la pompe' });
  if (forage) {
    add({ id: 'jonction', cat: 'pompes', desig: 'Kit de jonction de câble immergé (thermorétractable / résine)', spec: `pour câble ${e.cores} ${f(i.elec.cableSec)} mm²`, qty: nP, unit: 'u' });
    add({ id: 'corde', cat: 'pompes', desig: 'Câble de suspension inox + serre-câbles', spec: `Ø 4–6 mm, charge ≥ 5 × poids pompe + colonne pleine`, qty: up((i.geo.pumpDepth + 5) * nP), unit: 'm' });
    add({ id: 'colliers', cat: 'pompes', desig: 'Colliers de fixation câble sur colonne', spec: 'tous les 3 m', qty: up(i.geo.pumpDepth / 3) * nP, unit: 'u' });
    add({ id: 'tete', cat: 'pompes', desig: 'Tête de forage (plaque d\'obturation) avec presse-étoupe câble', spec: `pour tubage Ø ${i.geo.boreDia} mm, sortie DN${i.ref.dn}`, qty: 1, unit: 'u' });
    if (on('chemise')) add({ id: 'chemise', cat: 'pompes', desig: 'Chemise de refroidissement', spec: `pour moteur ${i.pump.diameterMm <= 100 ? '4"' : '6"'}`, qty: nP, unit: 'u' });
  }
  if (pit && on('barres')) {
    add({ id: 'pied', cat: 'pompes', desig: 'Pied d\'assise à accouplement automatique', spec: `DN${i.ref.dn}`, qty: nP, unit: 'u' });
    add({ id: 'chaine', cat: 'pompes', desig: 'Chaîne de levage inox + manille', spec: `longueur ≈ ${f(i.geo.wetLevel + 2.5, 1)} m`, qty: nP, unit: 'u' });
  }
  if (!imm) add({ id: 'plots', cat: 'pompes', desig: 'Plots anti-vibratiles', spec: 'adaptés au poids du groupe', qty: 4 * nP, unit: 'u' });

  // ---------- Tuyauterie ----------
  const pipe = (side: 'asp' | 'ref') => {
    const r = side === 'asp' ? i.asp : i.ref;
    const L = (side === 'ref' ? refLen(i) : r.length) * 1.05;
    const mat = PIPE_MATS[r.material].label;
    let qty = up(L), unit = 'm', note = 'longueur + 5 % de chutes';
    if (['pvc', 'ppr', 'galva', 'acier', 'inox', 'cuivre', 'fonte'].includes(r.material)) { qty = up(L / 6); unit = 'barre 6 m'; note = `${f(L, 0)} m + 5 %`; }
    else if (r.material === 'pehd' && r.dn <= 65 && L >= 25) { const c = L <= 50 ? 50 : 100; qty = up(L / c); unit = `couronne ${c} m`; note = `${f(L, 0)} m + 5 %`; }
    const extra = forage && side === 'ref' ? ` · dont colonne d'exhaure ${f(i.geo.pumpDepth, 0)} m${r.material === 'pehd' ? '' : ' (tubes filetés manchonnés)'}` : '';
    add({ id: `tube_${side}`, cat: 'tuyauterie', desig: `Tube ${side === 'asp' ? 'd\'aspiration' : 'de refoulement'} ${mat}`, spec: `DN${r.dn} · PN${r.pn}${side === 'asp' && r.material === 'flexible' ? ' · flexible spiralé non écrasable (aspiration)' : ''}${extra}`, qty, unit, note });
    if (r.elbows) add({ id: `coude_${side}`, cat: 'raccords', desig: `Coude 90° ${side === 'asp' ? 'grand rayon ' : ''}${mat}`, spec: `DN${r.dn} PN${r.pn}`, qty: r.elbows, unit: 'u' });
    // supports
    const step = ['pvc', 'ppr', 'pehd'].includes(r.material) ? 1.5 : 3;
    const visible = side === 'asp' ? r.length : Math.min(r.length, i.app === 'surpression' ? r.length : 15);
    if (r.material !== 'flexible') add({ id: `supp_${side}`, cat: 'raccords', desig: `Colliers / supports de tuyauterie ${side === 'asp' ? 'aspiration' : 'refoulement'}`, spec: `DN${r.dn}, un tous les ${f(step)} m (parties aériennes)`, qty: up(visible / step) + 1, unit: 'u' });
  };
  // Incendie en aspiration : une conduite d'aspiration indépendante par pompe, pas de collecteur
  const fireAsp = i.app === 'incendie' && i.mode === 'aspiration';
  if (!imm) pipe('asp');
  if (fireAsp && nP > 1) { const t = out.find((x) => x.id === 'tube_asp'); if (t) { t.qty *= nP; t.note = `${nP} aspirations indépendantes (incendie) · ${t.note ?? ''}`; } const c = out.find((x) => x.id === 'coude_asp'); if (c) c.qty *= nP; }
  pipe('ref');
  if (nP > 1) {
    add({ id: 'coll_asp', cat: 'tuyauterie', desig: 'Collecteur d\'aspiration', spec: `DN${i.asp.dn} avec ${nP} piquages DN${i.pump.dnAsp}`, qty: imm || fireAsp ? 0 : 1, unit: 'u' });
    add({ id: 'coll_ref', cat: 'tuyauterie', desig: 'Collecteur de refoulement', spec: `DN${i.ref.dn} avec ${nP} piquages DN${i.pump.dnRef} + piquages réservoir / capteur`, qty: 1, unit: 'u' });
  }
  if (i.ref.material === 'pehd' || i.app === 'irrigation' || forage) add({ id: 'grillage', cat: 'divers', desig: 'Grillage avertisseur bleu (conduite enterrée)', spec: 'largeur 30 cm', qty: up(i.ref.length), unit: 'm', note: 'si la conduite est enterrée' });

  // ---------- Robinetterie et accessoires ----------
  const PER = new Set(['vanne_asp', 'manchon_asp', 'cone_exc', 'clapet_ar', 'clapet_boule', 'vanne_ref', 'manchon_ref', 'cone_ref', 'manometre', 'vacuometre', 'crepine', 'clapet_pied', 'filtre_asp', 'prefiltre']);
  let flangedCount = 0, threaded = 0;
  for (const a of ACCESSORIES) {
    if (!on(a.id)) continue;
    if (['coffret', 'variateur', 'atex', 'barres', 'chemise'].includes(a.id)) continue;
    const st = i.acc[a.id];
    const q = Math.round(st.qty || 1) * (PER.has(a.id) && nP > 1 && !(imm && a.side === 'asp') ? nP : 1)
      * (i.app === 'incendie' && (a.id === 'amorcage' ? nP : a.id === 'pressostat' ? 2 * nP : 1) || 1);
    const dn = a.inline ? st.dn || (a.side === 'asp' ? i.asp.dn : i.ref.dn) : 0;
    const instr = ['manometre', 'vacuometre', 'capteur_p', 'pressostat', 'debitmetre', 'marche_sec', 'flotteur_arret', 'flotteur_marche', 'flotteur_alarme', 'flotteur_res', 'sonde_niveau'].includes(a.id);
    let spec = a.inline ? `DN${dn} PN${a.side === 'asp' ? i.asp.pn : PN}` : '';
    if (a.id === 'manometre') spec = `glycériné Ø 63–100 mm, 0–${f(gaugeRange(h.pMaxBar))} bar, robinet à boisseau + amortisseur`;
    if (a.id === 'vacuometre') spec = 'glycériné, −1 à 0 bar (ou −1/+3 bar si en charge)';
    if (a.id === 'capteur_p') spec = `4-20 mA, 0–${f(gaugeRange(h.pMaxBar))} bar, raccord 1/4" ou 1/2", câble blindé`;
    if (a.id === 'pressostat' && e.vessel) spec = `plage réglable incluant ${f(e.vessel.pOn)} / ${f(e.vessel.pOff)} bar, contact sec`;
    if (a.id === 'vessie' && e.vessel) spec = `${e.vessel.plan ? (e.vessel.plan.n > 1 ? `${e.vessel.plan.n} × ${e.vessel.plan.size} L` : `${e.vessel.vol} L`) : `${e.vessel.vol} L`} · PN${e.vessel.pn} · membrane alimentaire · précharge ${f(e.vessel.pre)} bar`;
    if (a.id === 'debitmetre') spec = `DN${dn}, compteur ${i.fluid.type === 'eaux_usees' ? 'électromagnétique' : 'à turbine ou électromagnétique'}, plage ${f(h.q * 0.3, 0)}–${f(h.q * 1.5, 0)} m³/h`;
    if (a.id.startsWith('flotteur')) spec = `flotteur à câble (contact ${a.id === 'flotteur_arret' ? 'NF' : 'NO'}), câble ${pit ? `${up(i.elec.cableLen)}` : '20'} m${pit ? ', compatible eaux usées' : ''}`;
    if (a.id === 'marche_sec') spec = 'relais de niveau + 3 électrodes inox (ou sonde) + câble';
    if (a.id === 'clapet_boule') spec = `DN${dn} PN${PN}, fonte à boule (eaux chargées)`;
    if (a.id === 'clapet_ar') spec = `DN${dn} PN${PN}, ${dn >= 80 ? 'à battant ou à double battant' : 'à ressort (fermeture rapide)'}`;
    if (a.id === 'anti_belier') spec = `ballon anti-bélier ou soupape, PN${PN}`;
    if (a.id === 'cone_exc') spec = `DN${i.asp.dn} × DN${i.pump.dnAsp}, méplat ${st.opt ?? 'haut'}`;
    if (a.id === 'cone_ref') spec = `DN${i.pump.dnRef} × DN${i.ref.dn}`;
    if (i.app === 'incendie') {
      if (a.id === 'pressostat') spec = `2 par pompe (démarrage seulement, l'arrêt est manuel)${e.vessel ? `, seuils échelonnés à partir de ${f(e.vessel.pOn)} bar` : ''}, contact sec`;
      if (a.id === 'coffret_inc') spec = 'démarrage auto sur pressostats, arrêt manuel seulement, relais thermique en alarme, voyants marche / défaut / manque de tension, compteur de démarrages';
      if (a.id === 'alim_inc') spec = `ligne dédiée prise en amont du disjoncteur général, câble CR1 (résistant au feu) ${i.elec.supply === 'mono' ? '3G' : '5G'} ${f(i.elec.cableSec)} mm²`;
      if (a.id === 'alarme_inc') spec = 'contacts secs + câble vers le local surveillé (ou transmetteur)';
      if (a.id === 'jockey') spec = `pompe multicellulaire ≈ ${f(Math.max(1, i.duty.qReq * 0.03), 1)} m³/h à la pression du réseau + pressostat + petit réservoir à vessie`;
      if (a.id === 'amorcage') spec = '≥ 500 L, en charge sur chaque pompe, avec alimentation et flotteur, alarme niveau bas';
      if (a.id === 'anti_vortex') spec = `plaque Ø ≥ ${f(Math.max(4 * i.asp.dn, 300), 0)} mm au-dessus de l'entrée d'aspiration`;
      if (a.id === 'essai') spec = `DN${i.ref.dn}, débitmètre ${f(i.duty.qReq * 0.5, 0)}–${f(i.duty.qReq * 1.5, 0)} m³/h, vanne de réglage, retour à la réserve`;
      if (a.id === 'soupape_circ') spec = `DN15 à DN25, ≈ ${f(Math.max(0.3, i.pump.qn * 0.03), 1)} m³/h vers la réserve, une par pompe électrique`;
      if (a.id === 'diesel') spec = `motopompe ${f(i.pump.qn)} m³/h à ${f(i.pump.hn)} m, démarrage automatique par 2 batteries, réservoir de gasoil pour ${fireCfg(i).duration * 1.5 | 0} min`;
    }
    add({ id: `acc_${a.id}`, cat: instr ? 'mesure' : 'robinetterie', desig: a.label, spec, qty: q, unit: 'u' });
    if (a.inline) { if (flanged(dn)) flangedCount += q; else threaded += q; }
  }
  // Brides des accessoires et de la pompe
  const pumpFl = (imm ? 1 : 2) * nP;
  const nFl = flangedCount * 2 + pumpFl;
  if (nFl > 0) {
    add({ id: 'brides', cat: 'raccords', desig: 'Brides / collets + contre-brides', spec: `DN${i.ref.dn}${!imm ? ` et DN${i.asp.dn}` : ''}, PN${Math.max(PN, i.asp.pn)}, adaptées au matériau des tubes`, qty: nFl, unit: 'u' });
    add({ id: 'joints', cat: 'raccords', desig: 'Joints de bride', spec: `EPDM${fl.water ? '' : ' / NBR (hydrocarbures)'}, aux DN des brides`, qty: nFl, unit: 'u' });
    add({ id: 'boulons', cat: 'raccords', desig: 'Jeux de boulonnerie (vis, écrous, rondelles)', spec: 'acier galvanisé ou inox', qty: nFl, unit: 'jeu' });
  }
  if (threaded > 0) add({ id: 'unions', cat: 'raccords', desig: 'Raccords union / mamelons / manchons', spec: `DN${i.ref.dn}, filetés ou à coller selon tubes`, qty: threaded * 2, unit: 'u' });
  if (i.asp.dn !== i.pump.dnAsp && !imm && !on('cone_exc')) add({ id: 'red_asp', cat: 'raccords', desig: 'Réduction excentrique aspiration', spec: `DN${i.asp.dn} × DN${i.pump.dnAsp}`, qty: nP, unit: 'u' });
  add({ id: 'piquages', cat: 'raccords', desig: 'Tés / piquages pour instruments', spec: '1/4" à 1/2" (manomètre, capteur, pressostat, vidange)', qty: ['manometre', 'vacuometre', 'capteur_p', 'pressostat', 'vessie', 'vidange'].filter(on).length, unit: 'u' });

  // ---------- Électricité ----------
  const cable = up(i.elec.cableLen * 1.1);
  add({ id: 'cable_moteur', cat: 'electricite', desig: `Câble moteur (${e.cableType})`, spec: `${e.cores} ${f(i.elec.cableSec)} mm² ${i.elec.cableMat === 'cu' ? 'cuivre' : 'aluminium'}${e.secRec > i.elec.cableSec ? ` (conseillé ${f(e.secRec)} mm²)` : ''}`, qty: cable * nP, unit: 'm', note: nP > 1 ? `${nP} × ${cable} m` : '+10 %' });
  const inTot = e.inom * Math.max(1, nP - sb);
  add({ id: 'cable_arrivee', cat: 'electricite', desig: 'Câble d\'alimentation du coffret (depuis le compteur / TGBT)', spec: `${i.elec.supply === 'mono' ? '3G' : '5G'} ${f(e.feed?.sec ?? 0)} mm² cuivre (U1000 R2V) pour ${f(inTot)} A`, qty: up((i.elec.feedLen ?? 15) * 1.1), unit: 'm' });
  const ctl = ['flotteur_arret', 'flotteur_marche', 'flotteur_alarme', 'flotteur_res', 'pressostat', 'marche_sec'].filter(on).length;
  if (ctl && !pit) add({ id: 'cable_cmd', cat: 'electricite', desig: 'Câble de commande (pressostat, flotteurs, électrodes)', spec: `${ctl > 1 ? '5G' : '3G'} 1,5 mm²`, qty: up(on('flotteur_res') ? Math.max(30, i.ref.length) : 15), unit: 'm' });
  if (on('capteur_p')) add({ id: 'cable_capteur', cat: 'electricite', desig: 'Câble blindé capteur 4-20 mA', spec: '2 × 0,75 mm² blindé', qty: 10, unit: 'm' });
  add({ id: 'terre', cat: 'electricite', desig: 'Mise à la terre : piquet + câble vert-jaune + barrette', spec: 'piquet 1,5 m, câble 16 mm² Cu (résistance de terre < 100 Ω)', qty: 1, unit: 'lot' });
  if (imm || i.elec.cableLen > 10) add({ id: 'gaine', cat: 'electricite', desig: 'Gaine de protection TPC (câbles enterrés)', spec: 'Ø 40–63 mm, rouge (énergie)', qty: up(Math.max(5, i.elec.cableLen - (forage ? i.geo.pumpDepth : 0))), unit: 'm' });
  if (i.elec.supply === 'groupe') add({ id: 'groupe', cat: 'electricite', desig: 'Groupe électrogène', spec: `${f(Math.max(e.genKva, i.elec.genKva), 0)} kVA, ${i.elec.supply === 'groupe' ? '400 V tri' : ''}`, qty: 1, unit: 'u' });

  // ---------- Coffret ----------
  if (on('coffret') || i.elec.supply === 'solaire') {
    add({ id: 'enveloppe', cat: 'coffret', desig: 'Coffret (enveloppe) avec plaque de montage et rails DIN', spec: `IP65, ${imm || i.app === 'irrigation' || forage ? 'extérieur, résistant UV, ' : ''}ventilé si variateur · presse-étoupes`, qty: 1, unit: 'u' });
    const cfg = elecConfig(i, ev);
    for (const p of cfg.parts) add({ id: `cab_${p.id}`, cat: 'coffret', desig: `${p.tag} — ${p.label}`, spec: p.setting ?? '', qty: 1, unit: 'u' });
  }

  // ---------- Solaire ----------
  if (e.solar) {
    const s = e.solar, so = i.elec.solar;
    add({ id: 'pv', cat: 'solaire', desig: 'Panneau photovoltaïque', spec: `${so.panelWc} Wc · Vmp ${f(so.vmp)} V · Voc ${f(so.voc)} V · ${s.ns} en série × ${s.np} chaîne(s) = ${f(s.wc / 1000, 2)} kWc`, qty: s.n, unit: 'u' });
    add({ id: 'pv_struct', cat: 'solaire', desig: 'Structure support des panneaux (au sol)', spec: `galvanisée, inclinaison ≈ latitude + 10°, ≈ ${f(s.area, 0)} m²`, qty: 1, unit: 'lot' });
    add({ id: 'pv_cable', cat: 'solaire', desig: 'Câble solaire DC', spec: `${f(so.dcSec)} mm² (H1Z2Z2-K)`, qty: up(so.dcLen * 2 * s.np * 1.1), unit: 'm' });
    add({ id: 'mc4', cat: 'solaire', desig: 'Connecteurs MC4 (paires)', spec: 'IP67, 1000 V DC', qty: s.np * 2 + 2, unit: 'paire' });
    add({ id: 'pv_terre', cat: 'solaire', desig: 'Mise à la terre de la structure', spec: 'câble 16 mm² + cosses', qty: 1, unit: 'lot' });
  }

  // ---------- Réservoir de secours en by-pass ----------
  const bk = backupOf(i);
  if (bk) {
    const bc = backupCalc(i, bk);
    const vol = bk.volume.toLocaleString('fr-FR');
    const serie = backupMode(bk) === 'serie';
    add({ id: 'bk_cuve', cat: 'robinetterie', desig: serie ? 'Réservoir surélevé (château d\'eau)' : 'Réservoir de secours (cuve)', spec: bk.volume > BIG_TANK ? `${vol} L, acier galvanisé à panneaux boulonnés (ou béton armé), revêtement intérieur alimentaire, trou d'homme, échelle` : `${vol} L, PEHD traité anti-UV, qualité eau potable, avec trou d'homme`, qty: 1, unit: 'u' });
    add({ id: 'bk_support', cat: 'divers', desig: 'Support / château d\'eau du réservoir', spec: `hauteur ${f(bk.height, 0)} m sous la cuve, dimensionné pour ${f((bk.volume / 1000) * 1.1, 1)} t en charge`, qty: 1, unit: 'u', note: 'métallique galvanisé ou béton' });
    if (serie) {
      const dif = floatKind(bk) === 'differentiel';
      add({ id: 'bk_flotteur', cat: 'robinetterie', desig: dif ? 'Robinet à flotteur à niveau différentiel (vanne altimétrique)' : 'Robinet à flotteur (remplissage du réservoir)', spec: `DN${bc.fillDn}, ${dif ? `ouverture à ${Math.round(floatLow(bk) * 100)} %, fermeture à 100 %, ` : ''}≈ ${f(bc.fillM3h, 1)} m³/h (tout le débit de la pompe)`, qty: 1, unit: 'u', note: 'sa fermeture fait monter la pression : le pressostat arrête la pompe' });
      add({ id: 'bk_vannes', cat: 'robinetterie', desig: 'Vannes d\'isolement (arrivée et départ maison)', spec: `DN${bc.fillDn} et DN${bc.outDn}, à boisseau sphérique`, qty: 2, unit: 'u' });
      add({ id: 'bk_bypass', cat: 'robinetterie', desig: 'Vanne de by-pass direct pompe → maison (normalement fermée)', spec: `DN${bc.outDn}, pour servir la maison pendant le nettoyage de la cuve`, qty: 1, unit: 'u' });
    } else {
      add({ id: 'bk_flotteur', cat: 'robinetterie', desig: 'Robinet à flotteur (remplissage du réservoir)', spec: `DN${bc.fillDn}, laiton, flotteur inox, ≈ ${f(bc.fillM3h, 1)} m³/h`, qty: 1, unit: 'u' });
      add({ id: 'bk_ev', cat: 'electricite', desig: 'Électrovanne de secours normalement ouverte (sortie réservoir)', spec: `DN${bc.outDn}, 2/2 voies NO, bobine 230 V, à membrane fonctionnant dès 0 bar`, qty: 1, unit: 'u', note: 'fermée par le coffret tant que tout va bien' });
      add({ id: 'bk_cmd', cat: 'electricite', desig: 'Commande de l\'électrovanne de secours dans le coffret', spec: 'relais temporisé + contact pression basse (2 min), report défaut, câble 3G1,5 jusqu\'au réservoir', qty: 1, unit: 'lot' });
      add({ id: 'bk_clapet', cat: 'robinetterie', desig: 'Clapet anti-retour sortie réservoir (vers la maison)', spec: `DN${bc.outDn}, battant à faible pression d'ouverture`, qty: 1, unit: 'u' });
      add({ id: 'bk_vannes', cat: 'robinetterie', desig: 'Vannes d\'isolement du by-pass (arrivée et sortie)', spec: `DN${bc.fillDn} et DN${bc.outDn}, à boisseau sphérique`, qty: 2, unit: 'u' });
    }
    add({ id: 'bk_trop', cat: 'robinetterie', desig: 'Trop-plein et vidange du réservoir', spec: `trop-plein DN${Math.max(bc.outDn, bc.fillDn)} avec grille anti-insectes, vanne de vidange DN32`, qty: 1, unit: 'lot' });
    add({ id: 'bk_tubes', cat: 'tuyauterie', desig: serie ? 'Tuyauterie montée (pompe → cuve) et descente (cuve → maison)' : 'Tuyauterie du by-pass (montée et descente)', spec: `PEHD PN10 DN${bc.fillDn} (montée) et DN${bc.outDn} (descente)`, qty: up((bk.height + 4) * 2 * 1.1), unit: 'm' });
    add({ id: 'bk_tes', cat: 'raccords', desig: 'Tés de piquage sur la conduite de la maison', spec: `DN${i.ref.dn} × DN${bc.fillDn} et DN${i.ref.dn} × DN${bc.outDn}`, qty: 2, unit: 'u' });
    add({ id: 'bk_pose', cat: 'prestations', desig: 'Montage du réservoir de secours et du by-pass', spec: `levage de la cuve à ${f(bk.height, 0)} m, raccordements, essai`, qty: 1, unit: 'forfait' });
  }

  // ---------- Divers ----------
  if (!imm) add({ id: 'massif', cat: 'divers', desig: 'Massif béton / socle de la pompe', spec: 'béton dosé 350 kg, avec scellements', qty: nP, unit: 'u' });
  if (pit) add({ id: 'fosse', cat: 'divers', desig: 'Fosse / regard de relevage', spec: `volume utile ≈ ${f(i.geo.tankVolume, 0)} L, avec tampon et ventilation`, qty: 1, unit: 'u', note: 'si à construire' });
  if (['pvc', 'ppr'].includes(i.ref.material) || ['pvc', 'ppr'].includes(i.asp.material)) add({ id: 'colle', cat: 'divers', desig: 'Colle PVC + décapant', spec: 'pot 0,5 L', qty: up((i.ref.length + i.asp.length) / 60) + 1, unit: 'lot' });
  add({ id: 'etanch', cat: 'divers', desig: 'Produits d\'étanchéité (téflon, filasse, pâte)', spec: fl.water ? 'agréés eau potable si besoin' : 'compatibles hydrocarbures', qty: 1, unit: 'lot' });
  add({ id: 'signal', cat: 'divers', desig: 'Étiquettes et plaque signalétique (repérage vannes, coffret, sens d\'écoulement)', spec: '', qty: 1, unit: 'lot' });

  // ---------- Prestations ----------
  add({ id: 'pose_hyd', cat: 'prestations', desig: 'Pose et raccordement hydraulique', spec: `${nP} pompe(s), ${f((imm ? 0 : i.asp.length) + refLen(i), 0)} m de conduite, accessoires`, qty: 1, unit: 'forfait' });
  add({ id: 'pose_elec', cat: 'prestations', desig: 'Câblage et raccordement électrique du coffret', spec: `${cfgLabel(i)}`, qty: 1, unit: 'forfait' });
  if (forage) add({ id: 'descente', cat: 'prestations', desig: 'Descente de la pompe dans le forage (équipe + matériel de levage)', spec: `profondeur ${f(i.geo.pumpDepth, 0)} m`, qty: 1, unit: 'forfait' });
  if (e.solar) add({ id: 'pose_pv', cat: 'prestations', desig: 'Montage de la structure et des panneaux, câblage DC', spec: `${e.solar.n} panneaux`, qty: 1, unit: 'forfait' });
  add({ id: 'mes', cat: 'prestations', desig: 'Mise en service et procès-verbal (mesures, réglages, formation)', spec: 'réglages pressostat / variateur / protections', qty: 1, unit: 'forfait' });
  add({ id: 'transport', cat: 'prestations', desig: 'Transport et déplacement sur site', spec: i.name, qty: 1, unit: 'forfait' });
  // Regroupement par catégorie, dans l'ordre d'un bordereau
  const order = Object.keys(QCAT) as QCat[];
  return out.map((x, k) => ({ x, k })).sort((a, b) => order.indexOf(a.x.cat) - order.indexOf(b.x.cat) || a.k - b.k).map((o) => o.x);
}

function cfgLabel(i: Installation) {
  const s = i.elec.supply === 'solaire' ? 'solaire' : i.elec.supply === 'mono' ? 'monophasé' : 'triphasé';
  return `${s}, ${i.acc.variateur?.on ? 'variateur' : i.elec.start === 'etoile' ? 'étoile-triangle' : i.elec.start === 'progressif' ? 'démarreur progressif' : 'démarrage direct'}`;
}

/** Lignes finales : quantités modifiées, lignes retirées, lignes ajoutées à la main. */
export function finalItems(i: Installation, ev: Evaluation): (QItem & { off: boolean; edited: boolean })[] {
  const q = i.quote ?? {};
  const base = quoteItems(i, ev).map((x) => {
    const o = q.over?.[x.id];
    return { ...x, qty: o?.qty ?? x.qty, off: !!o?.off, edited: o?.qty != null && o.qty !== x.qty };
  });
  const extra = (q.extra ?? []).map((x, k) => ({ id: `extra_${k}`, cat: 'prestations' as QCat, desig: x.desig, spec: x.spec, qty: x.qty, unit: x.unit, off: false, edited: true, note: 'ajouté' }));
  return [...base, ...extra];
}

/** Export tableur (CSV au format Excel français : séparateur « ; », accents conservés). */
export function quoteCsv(i: Installation, ev: Evaluation): Blob {
  const rows = finalItems(i, ev).filter((x) => !x.off);
  const esc = (s: string) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const head = ['N°', 'Catégorie', 'Désignation', 'Caractéristiques', 'Quantité', 'Unité', 'Remarque', 'Prix unitaire', 'Total'];
  const meta = i.quote ?? {};
  const lines = [
    [esc('Demande de devis'), esc(i.name)].join(';'),
    [esc('Client'), esc(meta.client ?? '')].join(';'),
    [esc('Lieu'), esc(meta.site ?? '')].join(';'),
    [esc('Contact'), esc(meta.contact ?? '')].join(';'),
    '',
    head.map(esc).join(';'),
    ...rows.map((x, n) => [n + 1, esc(QCAT[x.cat]), esc(x.desig), esc(x.spec), String(x.qty).replace('.', ','), esc(x.unit), esc(x.note ?? ''), '', `=E${n + 7}*H${n + 7}`].join(';')),
  ];
  return new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
}

/** Texte court pour WhatsApp / e-mail. */
export function quoteText(i: Installation, ev: Evaluation): string {
  const rows = finalItems(i, ev).filter((x) => !x.off);
  const meta = i.quote ?? {};
  const parts = [`*Demande de devis — ${i.name}*`, meta.client ? `Client : ${meta.client}` : '', meta.site ? `Lieu : ${meta.site}` : '', meta.date ? `Pour le : ${meta.date}` : ''].filter(Boolean);
  let cat = '';
  rows.forEach((x, n) => {
    if (x.cat !== cat) { cat = x.cat; parts.push('', `_${QCAT[x.cat]}_`); }
    parts.push(`${n + 1}. ${x.desig} — ${x.qty} ${x.unit}${x.spec ? ` (${x.spec})` : ''}`);
  });
  if (meta.note) parts.push('', `Remarques : ${meta.note}`);
  return parts.join('\n');
}
