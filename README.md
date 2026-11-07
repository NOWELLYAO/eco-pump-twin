# Jumeau numérique de pompes centrifuges · ECO PUMP AFRIK

Application web qui compare en continu chaque pompe à son **modèle numérique « pompe saine »** pour :

- **surveiller** : débit, hauteur, puissance, rendement, vibrations, marge NPSH, avec un schéma de l'installation en direct ;
- **diagnostiquer** : usure hydraulique, cavitation, aspiration dégradée, fonctionnement hors plage, défaut de roulement, surcharge moteur. Pour chaque cas, l'app donne la cause, les preuves et l'action à mener ;
- **prédire** : temps restant avant le seuil critique de chaque indicateur (régression sur 72 h) ;
- **chiffrer** : facture d'énergie et économies récupérables, dans votre devise.

Elle contient aussi un **configurateur d'installation** (onglet *Configurateur*, ou `/#installation`). Il permet de :

- choisir l'application (forage, surpression, irrigation, relevage, drainage, transfert, incendie, hydrocarbures, piscine), le type de pompe et le montage (en aspiration, en charge, immergée) ;
- décrire le fluide (température, masse volumique, viscosité, pH, matières en suspension, sable, taille des particules), la pompe, les niveaux et les distances, les conduites (matériau, DN, PN, longueur, coudes) et le besoin ;
- choisir parmi 33 accessoires (vannes, clapets, crépines, filtres, cônes, manchons, manomètres, capteurs, flotteurs, réservoir à vessie, anti-bélier, ventouse, variateur, coffret, ATEX…), chacun marqué *requis*, *conseillé* ou *déconseillé* selon l'installation, avec son DN.

À chaque saisie, l'application redessine une **vue réelle** et un **schéma P&ID** (symboles ISA, repères automatiques), trace la courbe pompe / réseau, puis donne :

- une **note sur 100** et un verdict, détaillés en six catégories ;
- les **alertes**, avec les problèmes à prévoir, les pièces exposées, les solutions et une **correction en un clic** ;
- la liste des **pièces susceptibles d'être endommagées**, les **préconisations** par priorité, le bilan des pertes de charge et la **nomenclature** ;
- un rapport imprimable, et l'envoi de la pompe vers le jumeau numérique.

Les calculs couvrent : pertes de charge Darcy-Weisbach (Swamee-Jain) et singulières, point de fonctionnement, NPSH disponible (altitude, tension de vapeur, pertes), corrections de viscosité, vitesses, submersion anti-vortex (HI 9.8), coup de bélier (Joukowski), tenue PN, refroidissement des moteurs immergés, nombre de démarrages par heure, compatibilité fluide / matériaux, puissance moteur et coût énergétique.

React 19 + TypeScript + Vite. Aucun serveur : les données restent dans le navigateur (localStorage).

## Démarrer en local

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # version de production dans dist/
```

## Déployer sur Vercel

1. Sur https://vercel.com/new, importez le dépôt GitHub `eco-pump-twin`.
2. Vercel détecte **Vite** automatiquement (build `npm run build`, dossier `dist`).
3. Cliquez sur **Deploy**. Chaque `git push` sur `main` redéploie ensuite le site.

## Utiliser de vraies données

1. Ouvrez une pompe → **Paramètres** → saisissez la fiche constructeur (débit, hauteur et rendement au point optimal, NPSH requis, moteur) et l'installation (hauteur géométrique, NPSH disponible).
2. Cliquez sur **Fichier modèle** pour obtenir le format CSV, remplissez-le avec les relevés de vos capteurs, puis **Importer un CSV**.

Colonnes attendues (séparateur `;` ou `,`, décimale `,` ou `.`) :

| colonne | unité |
|---|---|
| horodatage | texte libre |
| debit_m3h | m³/h |
| p_asp_bar | bar (relatif) |
| p_ref_bar | bar (relatif) |
| vitesse_tr_min | tr/min |
| puissance_kw | kW électriques |
| vibration_mm_s | mm/s RMS |
| temp_palier_c | °C |

## Organisation du code

```
src/engine/physics.ts    courbes H-Q et rendement, lois de similitude, réseau, point de fonctionnement
src/engine/simulator.ts  installation « réelle » avec défauts injectables (remplacée par les capteurs en production)
src/engine/twin.ts       cœur du jumeau : analyse mesure / modèle, règles de diagnostic, santé, prédiction, énergie
src/engine/csv.ts        import / modèle CSV
src/hooks/useTwin.ts     état de l'application, horloge de simulation, persistance
src/ui/*                 composants d'interface
src/installer/catalog.ts     applications, pompes, fluides, matériaux, accessoires, pièces
src/installer/hydraulics.ts  calculs hydrauliques de l'installation
src/installer/evaluate.ts    règles d'expertise, note, pièces exposées
src/installer/presets.ts     exemples prêts à l'emploi
src/installer/ui/*           formulaire, vue réelle, P&ID, rapport
```

Seuils de vibration : ISO 10816-3 (machines groupe 2) : alerte 4,5 mm/s, danger 7,1 mm/s.

## Pistes d'évolution

- Réception des mesures en direct (passerelle GSM/LoRa → API → base de données).
- Comptes clients et accès multi-sites.
- Alertes SMS / WhatsApp en cas de diagnostic critique.
- Rapport PDF mensuel par pompe.
