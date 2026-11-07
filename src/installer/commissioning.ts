import type { Evaluation } from './evaluate';
import { isForage, losses, pumpHead, refLen, viscCorr } from './hydraulics';
import { readings } from './sim';
import type { Installation } from './types';

export interface Commissioning {
  date?: string; tech?: string;
  q?: number; // débit mesuré (m³/h)
  pRef?: number; // pression au refoulement (bar)
  pAsp?: number; // pression à l'aspiration (bar)
  i1?: number; i2?: number; i3?: number; // courants (A)
  u?: number; // tension (V)
  level?: number; // niveau dynamique mesuré (forage, m)
  noise?: 'normal' | 'bruit' | 'fort';
  rotation?: 'ok' | 'non' | 'inconnu';
  notes?: string;
}

export type CSev = 'ok' | 'warning' | 'critical' | 'info';
export interface CRow { label: string; meas: string; exp: string; dev: string; sev: CSev }
export interface CDiag { sev: CSev; title: string; detail: string; causes: string[]; checks: string[] }

const f = (v: number, d = 1) => v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const has = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const pct = (m: number, e: number) => (e !== 0 ? ((m - e) / Math.abs(e)) * 100 : 0);

/** Compare les mesures du terrain au comportement calculé et en déduit les causes probables. */
export function analyzeCommissioning(i: Installation, ev: Evaluation, c: Commissioning) {
  const h = ev.hydro;
  const er = ev.elec;
  const exp = readings(i, h, true, er);
  const rhoG = i.fluid.rho * 9.81;
  const rows: CRow[] = [];
  const diags: CDiag[] = [];
  const tri = i.elec.supply !== 'mono';
  const forage = isForage(i);
  const pit = i.mode === 'immergee' && !forage;

  // Hauteur réellement fournie, déduite des pressions
  let hM: number | null = null;
  let qUsed = has(c.q) ? c.q : h.q;
  if (has(c.pRef)) {
    if (forage) {
      const lvl = has(c.level) ? c.level : i.geo.dynamicLevel;
      const col = losses(i, qUsed).ref * (i.geo.pumpDepth / Math.max(1, refLen(i)));
      hM = (c.pRef * 1e5) / rhoG + lvl + col;
    } else if (pit) hM = (c.pRef * 1e5) / rhoG + Math.max(1.5, i.geo.wetLevel + 1.5);
    else hM = ((c.pRef - (has(c.pAsp) ? c.pAsp : exp.pAsp)) * 1e5) / rhoG;
  }
  // Débit estimé sur la courbe si non mesuré
  let qEst: number | null = null;
  if (!has(c.q) && hM != null) {
    const h0 = i.pump.hn * i.pump.shutoff * viscCorr(i.fluid.nu).ch;
    const k = ((i.pump.hn * i.pump.shutoff - i.pump.hn) / (i.pump.qn * i.pump.qn)) * viscCorr(i.fluid.nu).ch;
    qEst = h0 > hM ? h.n * Math.sqrt((h0 - hM) / k) : 0;
    qUsed = qEst;
  }
  const hExpAtQ = pumpHead(i, qUsed);
  const sev = (d: number, w: number, cr: number): CSev => (Math.abs(d) >= cr ? 'critical' : Math.abs(d) >= w ? 'warning' : 'ok');

  if (has(c.q)) rows.push({ label: 'Débit', meas: `${f(c.q)} m³/h`, exp: `${f(exp.q)} m³/h`, dev: `${f(pct(c.q, exp.q), 0)} %`, sev: sev(pct(c.q, exp.q), 10, 25) });
  else if (qEst != null) rows.push({ label: 'Débit (estimé sur la courbe)', meas: `≈ ${f(qEst)} m³/h`, exp: `${f(exp.q)} m³/h`, dev: `${f(pct(qEst, exp.q), 0)} %`, sev: 'info' });
  if (has(c.pRef)) rows.push({ label: forage ? 'Pression en tête de forage' : 'Pression au refoulement', meas: `${f(c.pRef, 2)} bar`, exp: `${f(exp.pRef, 2)} bar`, dev: `${f(pct(c.pRef, exp.pRef), 0)} %`, sev: sev(pct(c.pRef, exp.pRef), 10, 25) });
  if (has(c.pAsp)) rows.push({ label: 'Pression à l\'aspiration', meas: `${f(c.pAsp, 2)} bar`, exp: `${f(exp.pAsp, 2)} bar`, dev: `${f(c.pAsp - exp.pAsp, 2)} bar`, sev: c.pAsp < exp.pAsp - 0.3 ? 'critical' : c.pAsp < exp.pAsp - 0.15 ? 'warning' : 'ok' });
  if (hM != null) rows.push({ label: has(c.q) ? 'Hauteur fournie au débit mesuré' : 'Hauteur fournie', meas: `${f(hM)} m`, exp: `${f(hExpAtQ)} m`, dev: `${f(pct(hM, hExpAtQ), 0)} %`, sev: has(c.q) ? sev(pct(hM, hExpAtQ), 8, 25) : 'info' });
  const amps = [c.i1, c.i2, c.i3].filter(has);
  const iMean = amps.length ? amps.reduce((a, b) => a + b, 0) / amps.length : null;
  if (iMean != null) rows.push({ label: `Courant moteur${amps.length > 1 ? ' (moyenne)' : ''}`, meas: `${f(iMean)} A`, exp: `${f(exp.amps)} A (In ${f(er.inom)} A)`, dev: `${f(pct(iMean, exp.amps), 0)} %`, sev: iMean > er.inom * 1.1 ? 'critical' : iMean > er.inom ? 'warning' : 'ok' });
  if (has(c.u)) rows.push({ label: 'Tension', meas: `${f(c.u, 0)} V`, exp: `${f(i.elec.voltage, 0)} V`, dev: `${f(pct(c.u, i.elec.voltage), 1)} %`, sev: sev(pct(c.u, i.elec.voltage), 5, 10) });
  if (forage && has(c.level)) rows.push({ label: 'Niveau dynamique', meas: `${f(c.level)} m`, exp: `${f(i.geo.dynamicLevel)} m`, dev: `${f(c.level - i.geo.dynamicLevel, 1)} m`, sev: c.level > i.geo.pumpDepth - 1 ? 'critical' : c.level > i.geo.dynamicLevel + 2 ? 'warning' : 'ok' });

  const D = (d: CDiag) => diags.push(d);

  // Électricité
  if (has(c.u)) {
    const du = pct(c.u, i.elec.voltage);
    if (Math.abs(du) >= 5) D({ sev: Math.abs(du) >= 10 ? 'critical' : 'warning', title: du < 0 ? 'Tension trop basse' : 'Tension trop haute', detail: `${f(c.u, 0)} V mesurés pour ${i.elec.voltage} V nominaux (${f(du, 1)} %).`,
      causes: du < 0 ? ['Câble trop long ou trop fin', 'Réseau faible ou groupe sous-dimensionné', 'Connexion desserrée'] : ['Réglage du groupe électrogène', 'Réseau instable'],
      checks: ['Mesurer la tension au coffret ET aux bornes du moteur, pompe en marche', 'Comparer la section du câble à la section conseillée', 'Resserrer les bornes'] });
  }
  if (amps.length >= 2 && tri) {
    const unb = Math.max(...amps.map((a) => Math.abs(a - iMean!))) / iMean! * 100;
    if (unb >= 5) D({ sev: unb >= 10 ? 'critical' : 'warning', title: 'Courants déséquilibrés entre phases', detail: `Écart de ${f(unb, 0)} % par rapport à la moyenne (maxi conseillé 5 %).`,
      causes: ['Phase faible ou tension déséquilibrée sur le réseau', 'Contact de contacteur usé, borne desserrée', 'Défaut de bobinage ou câble endommagé'],
      checks: ['Permuter les 3 phases d\'un cran : si le déséquilibre suit la phase, c\'est le réseau ; s\'il reste sur la même borne, c\'est le moteur ou le câble', 'Mesurer l\'isolement du câble et du moteur (mégohmmètre)'] });
  }
  if (iMean != null && iMean > er.inom * 1.05) D({ sev: iMean > er.inom * 1.15 ? 'critical' : 'warning', title: 'Moteur en surcharge', detail: `${f(iMean)} A pour un courant nominal de ${f(er.inom)} A.`,
    causes: ['Pompe qui débite trop (réseau plus ouvert que prévu, fuite, vanne trop ouverte)', 'Frottement mécanique : roulements, roue qui touche', 'Liquide plus dense ou plus visqueux', 'Tension basse'],
    checks: ['Fermer progressivement la vanne de refoulement : le courant doit baisser', 'Tourner l\'arbre à la main, pompe consignée : il doit tourner librement', 'Vérifier la tension'] });

  // Hydraulique
  if (hM != null && has(c.q)) {
    const dH = pct(hM, hExpAtQ);
    const lowAmps = iMean != null && iMean < exp.amps * 0.85;
    if (dH <= -25 && tri && c.rotation !== 'ok') D({ sev: 'critical', title: 'Sens de rotation probablement inversé', detail: `La pompe ne fournit que ${f(hM)} m au lieu de ${f(hExpAtQ)} m à ce débit (${f(dH, 0)} %)${lowAmps ? ', avec un courant plus faible que prévu' : ''}. C'est la signature typique d'un moteur triphasé qui tourne à l'envers.`,
      causes: ['Deux phases inversées au raccordement'], checks: ['Vérifier le sens indiqué par la flèche sur la pompe (démarrage bref)', 'Pour une pompe immergée : essayer les deux sens et garder celui qui donne la plus forte pression vanne fermée', 'Inverser deux phases au coffret'] });
    else if (dH <= -8) D({ sev: dH <= -25 ? 'critical' : 'warning', title: 'La pompe fournit moins de hauteur que prévu', detail: `${f(hM)} m mesurés au lieu de ${f(hExpAtQ)} m à ${f(c.q)} m³/h (${f(dH, 0)} %).`,
      causes: [tri && c.rotation !== 'ok' ? 'Sens de rotation à vérifier' : 'Roue partiellement bouchée', 'Entrée d\'air à l\'aspiration ou pompe mal purgée', 'Usure des bagues ou de la roue (installation existante)', 'Vitesse plus basse que prévu (variateur, tension)', 'Manomètre ou débitmètre imprécis'],
      checks: ['Purger le corps de pompe', 'Contrôler l\'étanchéité de l\'aspiration (raccords, joints, presse-étoupe)', 'Mesurer la pression vanne fermée : elle doit être proche de ' + f((pumpHead(i, 0) * rhoG) / 1e5, 1) + ' bar', 'Vérifier la fréquence du variateur'] });
    else if (dH >= 10) D({ sev: 'info', title: 'Hauteur supérieure au calcul', detail: `${f(hM)} m au lieu de ${f(hExpAtQ)} m (+${f(dH, 0)} %).`, causes: ['Débitmètre qui sous-estime le débit', 'Vitesse plus élevée que nominale', 'Courbe constructeur plus favorable'], checks: ['Contrôler le débitmètre (temps de remplissage d\'un volume connu)'] });
  }
  const qM = has(c.q) ? c.q : qEst;
  if (qM != null && has(c.pRef)) {
    const dq = pct(qM, exp.q), dp = pct(c.pRef, exp.pRef);
    if (dq <= -15 && dp >= 8) D({ sev: dq <= -30 ? 'critical' : 'warning', title: 'Réseau plus résistant que prévu', detail: `Débit ${f(dq, 0)} % et pression +${f(dp, 0)} % : la pompe pousse contre un obstacle.`,
      causes: ['Vanne de refoulement partiellement fermée', 'Clapet anti-retour bloqué ou monté à l\'envers', 'Filtre ou conduite obstrués, poche d\'air au point haut', 'Hauteur géométrique plus grande que prévu'],
      checks: ['Ouvrir complètement la vanne', 'Vérifier le sens de la flèche du clapet', 'Purger les points hauts (ventouse)', 'Contrôler les hauteurs réelles'] });
    if (dq >= 15 && dp <= -8) D({ sev: dq >= 30 ? 'critical' : 'warning', title: 'Réseau plus ouvert que prévu', detail: `Débit +${f(dq, 0)} % et pression ${f(dp, 0)} % : la pompe part en bout de courbe.`,
      causes: ['Fuite ou casse sur la conduite', 'Plus de points de puisage ouverts que prévu', 'Hauteur géométrique plus faible que prévu'],
      checks: ['Inspecter la conduite (zones humides, compteur qui tourne réseau fermé)', 'Régler la vanne pour revenir au point prévu', 'Surveiller le courant moteur'] });
    if (qM < i.duty.qReq * 0.9) D({ sev: 'warning', title: 'Besoin non couvert', detail: `${f(qM)} m³/h obtenus pour ${f(i.duty.qReq)} m³/h demandés.`, causes: ['Voir les diagnostics ci-dessus'], checks: ['Corriger la cause, puis refaire la mesure'] });
  }
  if (has(c.pAsp) && i.mode !== 'immergee') {
    const d = c.pAsp - exp.pAsp;
    const npsha = ((h.patm - h.pv) * 1000) / rhoG + (c.pAsp * 1e5) / rhoG;
    if (d <= -0.15 || npsha < h.npshr + 0.5) D({ sev: npsha < h.npshr + 0.5 || d <= -0.3 ? 'critical' : 'warning', title: 'Aspiration plus difficile que prévu', detail: `${f(c.pAsp, 2)} bar mesurés au lieu de ${f(exp.pAsp, 2)} bar. NPSH disponible réel ≈ ${f(npsha)} m (requis ${f(h.npshr)} m).`,
      causes: ['Crépine, clapet de pied ou filtre colmatés', 'Vanne d\'aspiration pas complètement ouverte', 'Niveau d\'eau plus bas que prévu', 'Conduite d\'aspiration écrasée (flexible) ou sous-dimensionnée'],
      checks: ['Nettoyer crépine et filtre', 'Ouvrir complètement la vanne d\'aspiration', 'Mesurer le niveau d\'eau réel', 'Écouter la pompe : un bruit de gravier signale la cavitation'] });
  }
  if (forage && has(c.level)) {
    if (c.level > i.geo.pumpDepth - 3) D({ sev: c.level > i.geo.pumpDepth - 1 ? 'critical' : 'warning', title: 'Niveau dynamique trop proche de la pompe', detail: `Niveau à ${f(c.level)} m pour une pompe à ${f(i.geo.pumpDepth)} m.`,
      causes: ['Le forage débite moins que prévu', 'Pompe trop puissante pour ce forage'], checks: ['Réduire le débit (vanne ou variateur)', 'Descendre la pompe si possible', 'Installer une protection manque d\'eau'] });
  }
  if (c.noise === 'fort') D({ sev: 'warning', title: 'Bruit ou vibrations anormaux', detail: 'Signalés lors de la mise en service.',
    causes: ['Cavitation (bruit de gravier)', 'Désalignement pompe-moteur', 'Fixations ou massif insuffisants', 'Roulement endommagé', 'Tuyauteries qui reposent sur la pompe'],
    checks: ['Fermer légèrement la vanne : si le bruit disparaît, c\'est de la cavitation', 'Contrôler l\'alignement et le serrage des pieds', 'Vérifier les supports de tuyauteries et les manchons anti-vibratiles'] });
  if (tri && c.rotation !== 'ok') D({ sev: c.rotation === 'non' ? 'critical' : 'info', title: c.rotation === 'non' ? 'Sens de rotation incorrect' : 'Sens de rotation non vérifié', detail: c.rotation === 'non' ? 'Le moteur tourne dans le mauvais sens.' : 'À contrôler à chaque mise en service d\'un moteur triphasé.',
    causes: ['Ordre des phases'], checks: ['Inverser deux phases au coffret', 'Contrôler par démarrage bref (surface) ou par la pression vanne fermée (immergée)'] });

  const n = { critical: diags.filter((d) => d.sev === 'critical').length, warning: diags.filter((d) => d.sev === 'warning').length };
  const filled = rows.length > 0;
  const verdict = !filled ? null : n.critical ? { sev: 'critical' as CSev, label: 'Non conforme', text: 'Des écarts importants : corriger avant de réceptionner l\'installation.' }
    : n.warning ? { sev: 'warning' as CSev, label: 'Conforme avec réserves', text: 'L\'installation fonctionne, mais des points sont à corriger ou à surveiller.' }
      : { sev: 'ok' as CSev, label: 'Conforme', text: 'Les mesures correspondent au calcul : installation réceptionnable.' };
  return { rows, diags, verdict, exp, closedBar: (pumpHead(i, 0) * rhoG) / 1e5 };
}

