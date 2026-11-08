/** Liens « aller au champ » : relie chaque solution d'une alerte au champ du formulaire à modifier. */
import type { Issue } from './types';

export interface Target {
  /** Titre de la section du formulaire (début du titre) */
  sec: string;
  /** Libellés possibles du champ (le premier présent à l'écran est utilisé) */
  fields?: string[];
  /** Accessoire (ligne de la liste des accessoires) ; plusieurs identifiants possibles séparés par des virgules */
  acc?: string;
  /** Premier champ « par défaut · à vérifier » */
  dflt?: boolean;
  /** Texte du bouton */
  chip: string;
}

const S = {
  app: "Application et type de pompe",
  fluid: 'Fluide pompé',
  pump: 'Pompe',
  site: 'Site, niveaux et distances',
  asp: "Conduite d'aspiration",
  ref: 'Conduite de refoulement',
  duty: 'Besoin et énergie',
  elec: 'Électricité et alimentation',
  acc: "Accessoires d'installation",
};
const t = (sec: string, chip: string, ...fields: string[]): Target => ({ sec, chip, fields });
const acc = (id: string, chip: string): Target => ({ sec: S.acc, acc: id, chip });

const HEIGHTS = ["Hauteur d'aspiration", 'Charge (niveau', 'Niveau dynamique', 'Eau au-dessus', 'Point de refoulement'];

/** Règles : la première qui correspond au texte de la solution donne la (les) cible(s). */
const RULES: [RegExp, Target[]][] = [
  [/par défaut/i, [{ sec: S.site, dflt: true, chip: 'Valeurs par défaut' }]],
  [/débit optimal est proche du besoin/i, [t(S.pump, 'Débit nominal', 'Débit nominal'), t(S.pump, 'Hauteur nominale', 'Hauteur nominale')]],
  [/fermer partiellement la vanne/i, [acc('vanne_ref', 'Vanne de refoulement')]],
  [/ajouter un variateur réglé/i, [t(S.elec, 'Mode de démarrage', 'Mode de démarrage')]],
  [/Un variateur ne suffirait pas/i, [t(S.pump, 'Débit nominal', 'Débit nominal')]],
  [/freiner ne servirait à rien/i, [t(S.pump, 'Débit nominal', 'Débit nominal')]],
  [/pression résiduelle/i, [t(S.duty, 'Pression demandée', "Pression au point d'utilisation")]],
  [/hauteurs saisies/i, [t(S.site, 'Hauteurs du site', ...HEIGHTS)]],
  [/niveaux mesurés|rabattement/i, [t(S.site, 'Niveau dynamique', 'Niveau dynamique', 'Niveau statique'), t(S.duty, 'Débit demandé', 'Débit demandé')]],
  [/plus forte HMT|Rogner la roue|pompe plus petite/i, [t(S.pump, 'Hauteur nominale', 'Hauteur nominale'), t(S.pump, 'Débit nominal', 'Débit nominal')]],
  [/meilleur rendement/i, [t(S.pump, 'Débit / hauteur nominale', 'Débit nominal', 'Hauteur nominale')]],
  [/NPSH requis/i, [t(S.pump, 'NPSH requis', 'NPSH requis'), t(S.pump, 'Vitesse', 'Vitesse')]],
  [/passage|[Pp]ompe (submersible )?vortex|monocanal|dilacératrice/, [t(S.pump, 'Passage libre', 'Passage libre'), t(S.app, 'Type de pompe', 'Type de pompe')]],
  [/volumétrique|ATEX de surface|type de pompe adapté|pompe immergée|modifier le montage/i, [t(S.app, 'Type de pompe', 'Type de pompe'), t(S.app, 'Montage', 'Montage')]],
  [/en charge \(bâche/i, [t(S.app, 'Montage', 'Montage')]],
  [/Pompe inox 316|Bronze, duplex|Inox 316 ou bronze|Fonte au chrome/i, [t(S.pump, 'Matériau pompe', 'Matériau')]],
  [/garniture prévues pour cette température/i, [t(S.pump, 'Température maxi', 'Température maxi')]],
  [/Chauffer le liquide/i, [t(S.fluid, 'Température', 'Température')]],
  [/neutraliser/i, [t(S.fluid, 'pH', 'pH')]],
  [/diamètre inférieur \(4/i, [t(S.pump, 'Diamètre pompe', 'Diamètre de la pompe')]],
  [/[Mm]oteur d'au moins|taille de moteur|réserve de puissance|puissance moteur|moteur dimensionné|bout de courbe/i, [t(S.pump, 'Puissance moteur', 'Puissance moteur')]],
  [/permutation automatique des pompes|Activer la permutation/i, [t(S.pump, 'Permutation', 'Permutation automatique')]],
  [/pompe de secours/i, [t(S.pump, 'Pompes en secours', 'Pompes installées', 'Dont en secours')]],
  [/Variateur sur chaque pompe/i, [acc('variateur', 'Variateur')]],
  [/Réduire le débit|limiter le débit|limitation de débit/i, [t(S.duty, 'Débit demandé', 'Débit demandé')]],
  [/tube droit/i, [t(S.site, 'Longueur droite', 'Longueur droite avant la pompe')]],
  [/Immerger l'entrée|plaque anti-vortex/i, [t(S.site, 'Immersion', "Immersion de l'entrée")]],
  [/du fond/i, [t(S.site, 'Hauteur / fond', 'Distance entrée / fond', 'Profondeur de la pompe')]],
  [/Descendre la pompe|Remonter la pompe/i, [t(S.site, 'Profondeur pompe', 'Profondeur de la pompe', "Hauteur d'aspiration")]],
  [/hauteur de liquide au-dessus|flotteur d'arrêt pour garder/i, [t(S.site, 'Eau au-dessus', 'Eau au-dessus de la pompe')]],
  [/volume utile|Écarter davantage les flotteurs/i, [t(S.site, 'Volume de la fosse', 'Volume utile entre flotteurs')]],
  [/Rapprocher la pompe|Viser moins de 4 à 5 m/i, [t(S.site, "Hauteur d'aspiration", "Hauteur d'aspiration"), t(S.asp, 'Longueur aspiration', 'Longueur')]],
  [/Supprimer le filtre/i, [acc('filtre_asp', 'Filtre')]],
  [/étoile-triangle est possible/i, [t(S.elec, 'Mode de démarrage', 'Mode de démarrage')]],
  [/Sonde ou électrodes/i, [acc('marche_sec', 'Manque d\'eau')]],
  [/aspiration en DN.*cône/i, [t(S.asp, 'DN aspiration', 'Diamètre intérieur'), t(S.pump, "Bride d'aspiration", "Bride d'aspiration")]],
  [/l'aspiration|: aspiration en DN/i, [t(S.asp, 'DN aspiration', 'Diamètre intérieur'), t(S.asp, 'Longueur aspiration', 'Longueur')]],
  [/refoulement|diamètre inférieur suffit|Réduire le diamètre/i, [t(S.ref, 'DN refoulement', 'Diamètre intérieur')]],
  [/coudes/i, [t(S.ref, 'Coudes', 'Coudes à 90°'), t(S.asp, 'Coudes aspiration', 'Coudes à 90°')]],
  [/Réduire les pertes de charge/i, [t(S.ref, 'DN refoulement', 'Diamètre intérieur'), t(S.ref, 'Coudes', 'Coudes à 90°')]],
  [/Conduite PN|classe PN supérieure/i, [t(S.ref, 'PN conduite', 'Pression nominale')]],
  [/\bPEHD\b|\bPPR\b|Acier noir/, [t(S.ref, 'Matériau conduite', 'Matériau')]],
  [/Câble solaire|kWc|panneaux|contrôleur adaptés/i, [t(S.elec, 'Champ solaire', 'Panneaux installés', "Puissance d'un panneau", 'Section câble DC')]],
  [/Câble|câble en|Rapprocher le coffret/i, [t(S.elec, 'Section du câble', 'Section du câble'), t(S.elec, 'Longueur câble', 'Longueur câble coffret')]],
  [/Groupe/i, [t(S.elec, 'Puissance du groupe', 'Puissance du groupe', 'Alimentation')]],
  [/triphasé|tension du réseau|monophasée/i, [t(S.elec, 'Alimentation', 'Alimentation'), t(S.elec, 'Tension moteur', 'Tension moteur')]],
  [/consigne du variateur|fréquence maxi du variateur|en sortie de variateur|compatible variateur/i, [acc('variateur', 'Variateur')]],
  [/[Vv]ariateur|[Dd]émarr|étoile-triangle|progressif/i, [t(S.elec, 'Mode de démarrage', 'Mode de démarrage')]],
  [/Enclenchement à|Régler l'arrêt|Regonfler|Réservoir PN|seuils du pressostat/i, [acc('vessie', 'Réglages réservoir'), acc('pressostat', 'Pressostat')]],
  [/anti-bélier/i, [acc('anti_belier', 'Anti-bélier')]],
  [/soupape/i, [acc('soupape', 'Soupape')]],
  [/fermeture rapide/i, [acc('clapet_ar', 'Clapet anti-retour')]],
  [/vacuomètre/i, [acc('vacuometre', 'Vacuomètre'), acc('filtre_asp', 'Filtre')]],
  [/filtre/i, [acc('filtre_asp', 'Filtre')]],
  [/crépine|dégrillage/i, [acc('crepine,clapet_pied,prefiltre', 'Crépine')]],
  [/cône/i, [acc('cone_exc', 'Cône excentrique')]],
  [/chemise/i, [acc('chemise', 'Chemise')]],
  [/chasses|regard de nettoyage|Nettoyage/i, [acc('vidange', 'Vidange')]],
];

/** Cibles d'une solution d'alerte (0 à 2 boutons). */
export function targetsFor(x: Issue, sol: string): Target[] {
  // Alertes d'accessoire : manque, conseillé, à éviter, mauvais DN
  const m = /^(miss|rec|avoid|dn)_(.+)$/.exec(x.id);
  if (m && /^(Ajouter|Retirer|Prendre l'accessoire)/.test(sol)) return [acc(m[2], 'Voir l\'accessoire')];
  for (const [re, ts] of RULES) if (re.test(sol)) return ts;
  return [];
}

/** Demande à l'application d'ouvrir la page Conception sur ce champ. */
export function gotoTarget(tg: Target) {
  window.dispatchEvent(new CustomEvent<Target>('ecopump-goto', { detail: tg }));
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Cherche le champ dans le formulaire, ouvre sa section, le fait défiler et le met en évidence. */
export function focusTarget(tg: Target): boolean {
  const form = document.querySelector('.inst-form');
  if (!form) return false;
  const secs = [...form.querySelectorAll<HTMLDetailsElement>('details.isec')];
  const sec = secs.find((d) => norm(d.querySelector('summary b')?.textContent ?? '').startsWith(norm(tg.sec)));
  let el: HTMLElement | null = null;
  if (tg.dflt) {
    el = form.querySelector<HTMLElement>('.ifld.dflt');
    const d = el?.closest('details');
    if (d) d.open = true;
  } else if (sec) {
    sec.open = true;
    if (tg.acc) for (const id of tg.acc.split(',')) { el = sec.querySelector<HTMLElement>(`[data-acc="${id}"]`); if (el) break; }
    else if (tg.fields) {
      const items = [...sec.querySelectorAll<HTMLElement>('.ifld, .itoggle')];
      for (const f of tg.fields) {
        el = items.find((it) => norm(it.querySelector(':scope > span')?.textContent ?? '').startsWith(norm(f))) ?? null;
        if (el) break;
      }
    }
    if (!el) el = sec.querySelector('summary');
  }
  if (!el) return false;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.remove('goto-flash');
  void el.offsetWidth;
  el.classList.add('goto-flash');
  window.setTimeout(() => el?.classList.remove('goto-flash'), 2600);
  const inp = el.querySelector<HTMLElement>('input:not([type=checkbox]), select, .iseg button[aria-pressed=true]');
  if (inp) window.setTimeout(() => inp.focus({ preventScroll: true }), 450);
  return true;
}
