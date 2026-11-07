# Configurateur d'installation de pompes · ECO PUMP AFRIK

Application web en quatre pages :

- **Conception** : saisie guidée de l'installation, vue réelle et schéma P&ID dessinés en direct, note et alertes principales.
- **Simulation** : bouton marche/arrêt, défilement du temps (1 min/s à 1 h/s), réglages en direct (vanne, vitesse, niveau d'eau, colmatage, usure), instruments qui affichent leurs valeurs, courbes, alertes en direct et journal des événements (démarrages, arrêts, coups de bélier, cavitation, marche à sec, débordement). Le comportement s'adapte à l'installation : pressostat et réservoir à vessie, variateur à pression constante, fosse à flotteurs, pompage solaire sur une journée, remplissage d'un réservoir.
- **Diagnostic** : alertes cliquables qui font clignoter l'élément concerné sur le schéma, corrections en un clic, préconisations, pièces exposées.
- **Mise en service** : saisie des mesures relevées sur place (débit, pressions, courants par phase, tension, niveau dynamique, sens de rotation, bruit) ; comparaison au calcul et causes probables d'écart (sens de rotation inversé, réseau plus résistant ou plus ouvert, aspiration colmatée, entrée d'air, usure, surcharge, déséquilibre de phases, tension), avec les vérifications à faire ; PV imprimable.
- **Matériel & rapport** : nomenclature, électricité, solaire, pertes de charge, courbes, impression du rapport.

Un clic sur n'importe quel élément du schéma ouvre sa fiche : caractéristiques, alertes liées, ajout ou retrait, et **photos réelles** (Wikimedia Commons, licences libres) avec un lien vers d'autres photos.

Le configurateur permet de :

- choisir l'application (forage, surpression, irrigation, relevage, drainage, transfert, incendie, hydrocarbures, piscine), le type de pompe et le montage (en aspiration, en charge, immergée) ;
- décrire le fluide (température, masse volumique, viscosité, pH, matières en suspension, sable, taille des particules), la pompe, les niveaux et les distances, les conduites (matériau, DN, PN, longueur, coudes) et le besoin ;
- choisir parmi 33 accessoires (vannes, clapets, crépines, filtres, cônes, manchons, manomètres, capteurs, flotteurs, réservoir à vessie, anti-bélier, ventouse, variateur, coffret, ATEX…), chacun marqué *requis*, *conseillé* ou *déconseillé* selon l'installation, avec son DN.

À chaque saisie, l'application redessine une **vue réelle** et un **schéma P&ID** (symboles ISA, repères automatiques), trace la courbe pompe / réseau, puis donne :

- une **note sur 100** et un verdict, détaillés en six catégories ;
- les **alertes**, avec les problèmes à prévoir, les pièces exposées, les solutions et une **correction en un clic** ;
- la liste des **pièces susceptibles d'être endommagées**, les **préconisations** par priorité, le bilan des pertes de charge et la **nomenclature** ;
- un rapport imprimable, et l'envoi de la pompe vers le jumeau numérique.

Le configurateur gère aussi **plusieurs pompes en parallèle** (en service + secours, permutation automatique) : courbe combinée, NPSH et puissance par pompe, contrôle d'une pompe seule en bout de courbe, nomenclature par pompe.

Pour le **solaire**, l'ensoleillement peut être chargé mois par mois pour l'emplacement de l'installation (GPS ou coordonnées), depuis la base climatique NASA POWER via la fonction `api/solar.js` (Vercel), ou saisi à la main. On coche les mois d'utilisation ; le champ est dimensionné sur le mois coché le moins ensoleillé, avec correction de température.

Le configurateur traite aussi la partie **électrique et énergie** :

- alimentation (monophasé, triphasé, groupe électrogène, solaire), mode de démarrage (direct, étoile-triangle, démarreur progressif, variateur) ;
- courant nominal et de démarrage, chute de tension du câble moteur en marche et au démarrage, intensité admissible, section et nombre de conducteurs conseillés, réglage du disjoncteur moteur ;
- calibre du variateur, filtre de sortie (sinus ou dU/dt) pour les câbles longs, consigne de fréquence et économie d'énergie ; taille du groupe électrogène ;
- réservoir à vessie : volume (loi de Boyle), PN, seuils marche/arrêt du pressostat, précharge, nombre de démarrages par heure, cohérence avec la pression maximale de la pompe ;
- pompage solaire : nombre de panneaux, câblage série/parallèle selon la plage MPPT et la tension DC maximale du contrôleur (Voc à froid), puissance crête, volume journalier, section du câble DC, surface au sol et stockage d'eau conseillé.

Les calculs hydrauliques couvrent : pertes de charge Darcy-Weisbach (Swamee-Jain) et singulières, point de fonctionnement, NPSH disponible (altitude, tension de vapeur, pertes), corrections de viscosité, vitesses, submersion anti-vortex (HI 9.8), coup de bélier (Joukowski), tenue PN, refroidissement des moteurs immergés, nombre de démarrages par heure, compatibilité fluide / matériaux, puissance moteur et coût énergétique.

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

## Organisation du code

```
src/engine/physics.ts        courbes H-Q et rendement, lois de similitude
src/installer/sim.ts         simulation temporelle et lectures d'instruments
src/installer/targets.ts     liens alertes ↔ éléments du schéma, mots-clés des photos
src/installer/electrical.ts  câbles, démarrage, variateur, réservoir à vessie, solaire
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
