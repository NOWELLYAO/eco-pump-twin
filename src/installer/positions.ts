import { ACC, ACCESSORIES } from './catalog';
import type { Hydro } from './hydraulics';
import type { Installation } from './types';

const m = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} m`;

/** Ordre de montage, de la source vers la pompe (aspiration) et de la pompe vers l'utilisation (refoulement). */
export const ASP_FAR = ['vanne_asp', 'filtre_asp', 'prefiltre']; // côté bâche, avant la longueur droite
export const ASP_NEAR = ['manchon_asp', 'vacuometre', 'cone_exc']; // contre la pompe (le dernier touche la bride)
export const REF_ORDER = ['cone_ref', 'manchon_ref', 'manometre', 'clapet_ar', 'clapet_boule', 'vanne_ref', 'soupape', 'anti_belier', 'vessie', 'capteur_p', 'pressostat', 'vidange', 'debitmetre', 'ventouse'];

/** Côté aspiration : groupes éloigné / proche de la pompe. Le préfiltre de piscine fait partie de la pompe. */
export function aspGroups(i: Installation) {
  const on = (id: string) => !!i.acc[id]?.on;
  const pool = i.app === 'piscine';
  const far = ASP_FAR.filter((id) => on(id) && !(pool && id === 'prefiltre'));
  const near = [...ASP_NEAR, ...(pool ? ['prefiltre'] : [])].filter(on);
  return { far, near };
}

/** Conseil de position pour chaque accessoire, avec les distances calculées. */
export function posAdvice(id: string, i: Installation, h?: Hydro): string {
  const dA = i.asp.dn / 1000, dR = i.ref.dn / 1000;
  const five = m(Math.max(0.2, 5 * dA)), fiveR = m(5 * dR), threeR = m(3 * dR);
  const vortex = h ? m(Math.max(h.vortexS, 0.3)) : m(Math.max(0.3, 1.5 * dA));
  const pool = i.app === 'piscine';
  const forage = i.pumpType === 'immergee_forage';
  switch (id) {
    case 'clapet_pied': return `Au bout de la conduite d'aspiration, au moins ${vortex} sous le niveau le plus bas et ${m(Math.max(0.1, 0.5 * dA))} à ${m(Math.max(0.2, dA))} au-dessus du fond. Conduite montante vers la pompe (pente ≥ 2 %), sans aucun point haut.`;
    case 'crepine': return `À l'entrée de la conduite, dans la bâche : immersion ≥ ${vortex}, à ${m(Math.max(0.1, 0.5 * dA))} du fond minimum, loin de l'arrivée d'eau (bulles d'air).`;
    case 'vanne_asp': return 'Au départ de la bâche, avant le filtre. Tige horizontale ou vers le haut. Toujours grande ouverte : ne jamais régler le débit avec elle.';
    case 'filtre_asp': return `Après la vanne d'isolement, panier vers le bas et accessible. Laisser ${five} de tube droit entre le filtre et la pompe. Idéalement une vanne de chaque côté et un manomètre pour suivre le colmatage.`;
    case 'prefiltre': return pool
      ? 'Sur une pompe de piscine, le préfiltre est intégré à l\'entrée de la pompe : c\'est normal qu\'il soit collé à la bride. Couvercle accessible ; vanne en amont pour l\'ouvrir sans vidanger si la pompe est sous le niveau d\'eau.'
      : `En amont de la pompe, après la vanne d'isolement — pas collé à la bride : laisser ${five} de tube droit avant la pompe. Couvercle accessible, une vanne de chaque côté pour le nettoyer sans vidanger.`;
    case 'manchon_asp': return 'Juste avant la pompe (après le cône). La tuyauterie doit être supportée de son côté : la pompe ne doit porter aucun poids.';
    case 'vacuometre': return 'Sur le cône ou la bride d\'aspiration, au plus près de la pompe, avec robinet d\'isolement.';
    case 'cone_exc': return 'Directement contre la bride d\'aspiration, méplat en haut. Aucun coude collé au cône : le coude doit être avant la longueur droite.';
    case 'cone_ref': return 'Directement contre la bride de refoulement. Clapet et vanne ensuite, au diamètre de la conduite.';
    case 'manchon_ref': return 'Juste après le cône de refoulement ; conduite supportée indépendamment de la pompe.';
    case 'manometre': return 'Entre la pompe et le clapet anti-retour (il indique la pression de la pompe, même à vanne fermée). Avec robinet, lisible depuis le sol.';
    case 'clapet_ar': return forage
      ? 'En tête de forage, avant la vanne. Si la colonne dépasse 60 m, ajouter un clapet intermédiaire tous les 60 m environ.'
      : `Après le manomètre et avant la vanne (pour pouvoir l'isoler et le démonter). Clapet à battant : à ${fiveR} au moins d'un coude ou de la pompe ; clapet à ressort : position indifférente.`;
    case 'clapet_boule': return 'Dans la chambre à vannes (ou en haut de fosse), avant la vanne, accessible depuis la surface.';
    case 'vanne_ref': return 'Après le clapet anti-retour. C\'est elle qui isole la pompe et qui permet de régler le point de fonctionnement.';
    case 'soupape': return 'Entre la pompe et la vanne, échappement ramené à la bâche ou à un regard.';
    case 'anti_belier': return 'Au départ de la conduite, juste après le clapet anti-retour, en point bas.';
    case 'vessie': return 'Sur le collecteur de refoulement, APRÈS le clapet anti-retour (sinon il se vide dans la pompe). Avec vanne d\'isolement et vidange, au plus près de la pompe.';
    case 'capteur_p': return `Sur le collecteur après la vanne, près du réservoir à vessie, à ${fiveR} au moins d'une vanne ou d'un coude (pression stable).`;
    case 'pressostat': return 'Sur le collecteur après le clapet, près du réservoir à vessie, avec robinet d\'isolement.';
    case 'vidange': return 'Au point le plus bas de la conduite et sur le collecteur.';
    case 'debitmetre': return `Sur un tronçon droit : ${fiveR} de tube droit avant et ${threeR} après. Conduite toujours pleine (de préférence en partie montante). Jamais juste après la pompe ou une vanne partiellement fermée.`;
    case 'ventouse': return i.geo.highPoint ? 'À chaque point haut de la conduite (votre tracé en a un), et tous les 500 à 800 m sur une longue conduite.' : 'Aux points hauts de la conduite et tous les 500 à 800 m sur une longue conduite.';
    case 'coffret': return `Hors zone inondable, à l'ombre, ventilé, à ${i.elec.cableLen} m du moteur (longueur de câble saisie).`;
    case 'variateur': return `Au plus près du moteur, à l'ombre et ventilé, câble moteur blindé${i.elec.cableLen > 50 ? ' et filtre de sortie (câble de plus de 50 m)' : ''}.`;
    case 'marche_sec': return forage ? 'Électrodes ou sonde environ 1 m au-dessus de l\'aspiration de la pompe : la pompe s\'arrête avant de dénoyer.' : `Électrodes ou flotteur au-dessus de l'entrée de la conduite (≥ ${vortex} d'eau) : la pompe s'arrête avant d'aspirer de l'air.`;
    case 'flotteur_arret': return 'Au-dessus du moteur : le moteur doit rester noyé à l\'arrêt (voir la notice, souvent 0,3 m au-dessus).';
    case 'flotteur_marche': return `Au-dessus du flotteur d'arrêt ; l'écart entre les deux correspond au volume utile (${i.geo.tankVolume} L).`;
    case 'flotteur_alarme': return 'Environ 10 cm sous le fil d\'eau de l\'arrivée des effluents.';
    case 'flotteur_res': return 'Dans le réservoir d\'arrivée, environ 10 cm sous le trop-plein.';
    case 'sonde_niveau': return 'Au-dessus de la pompe, sous le niveau dynamique le plus bas, câble fixé à la colonne.';
    case 'chemise': return 'Autour du moteur et de l\'aspiration de la pompe, ouverte en bas, fermée au-dessus de l\'aspiration.';
    case 'barres': return 'Pied d\'assise scellé au fond, barres verticales jusqu\'au tampon, fixées en haut ; chaîne inox pour remonter la pompe.';
    case 'atex': return 'Tout le matériel électrique en zone ATEX ; liaison équipotentielle entre cuve, pompe et tuyauteries.';
    default: return ACC[id]?.desc ?? '';
  }
}

/** Séquence complète de montage pour le rapport (accessoires installés et manquants requis). */
export function mountSequence(i: Installation, needs: Record<string, string>) {
  const want = (id: string) => i.acc[id]?.on || needs[id] === 'required';
  const seq: { id: string; zone: string; on: boolean }[] = [];
  if (i.mode !== 'immergee') {
    for (const id of ['clapet_pied', 'crepine']) if (want(id) && needs[id] !== 'na') seq.push({ id, zone: 'Entrée d\'aspiration', on: !!i.acc[id]?.on });
    const pool = i.app === 'piscine';
    for (const id of ASP_FAR) if (want(id) && needs[id] !== 'na' && !(pool && id === 'prefiltre')) seq.push({ id, zone: 'Aspiration, côté bâche', on: !!i.acc[id]?.on });
    for (const id of [...(pool ? ['prefiltre'] : []), ...ASP_NEAR]) if (want(id) && needs[id] !== 'na') seq.push({ id, zone: 'Aspiration, contre la pompe', on: !!i.acc[id]?.on });
  }
  for (const id of REF_ORDER) if (want(id) && needs[id] !== 'na') seq.push({ id, zone: 'Refoulement', on: !!i.acc[id]?.on });
  for (const a of ACCESSORIES.filter((x) => x.side === 'ctrl')) if (want(a.id) && needs[a.id] !== 'na') seq.push({ id: a.id, zone: 'Commande et protection', on: !!i.acc[a.id]?.on });
  return seq;
}
