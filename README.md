# Jumeau numérique de pompes centrifuges · ECO PUMP AFRIK

Application web qui compare en continu chaque pompe à son **modèle numérique « pompe saine »** pour :

- **surveiller** : débit, hauteur, puissance, rendement, vibrations, marge NPSH, avec un schéma de l'installation en direct ;
- **diagnostiquer** : usure hydraulique, cavitation, aspiration dégradée, fonctionnement hors plage, défaut de roulement, surcharge moteur. Pour chaque cas, l'app donne la cause, les preuves et l'action à mener ;
- **prédire** : temps restant avant le seuil critique de chaque indicateur (régression sur 72 h) ;
- **chiffrer** : facture d'énergie et économies récupérables, dans votre devise.

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
```

Seuils de vibration : ISO 10816-3 (machines groupe 2) : alerte 4,5 mm/s, danger 7,1 mm/s.

## Pistes d'évolution

- Réception des mesures en direct (passerelle GSM/LoRa → API → base de données).
- Comptes clients et accès multi-sites.
- Alertes SMS / WhatsApp en cas de diagnostic critique.
- Rapport PDF mensuel par pompe.
