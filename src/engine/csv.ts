import { simulate } from './simulator';
import type { Measurement, PumpConfig } from './types';

export const CSV_COLUMNS = [
  'horodatage', 'debit_m3h', 'p_asp_bar', 'p_ref_bar', 'vitesse_tr_min', 'puissance_kw', 'vibration_mm_s', 'temp_palier_c',
] as const;

const num = (s: string) => Number(s.trim().replace(/\s/g, '').replace(',', '.'));

/** Lit un CSV de relevés (séparateur ; ou , ou tabulation, décimale , ou .). */
export function parseCsv(text: string): { rows: Measurement[]; errors: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], errors: ['Le fichier ne contient pas de données.'] };
  const sep = lines[0].includes(';') ? ';' : lines[0].includes('\t') ? '\t' : ',';
  const head = lines[0].split(sep).map((h) => h.trim().toLowerCase());
  const idx = CSV_COLUMNS.map((c) => head.indexOf(c));
  const missing = CSV_COLUMNS.filter((_, i) => idx[i] < 0 && i > 0);
  if (missing.length) return { rows: [], errors: [`Colonnes manquantes : ${missing.join(', ')}`] };
  const rows: Measurement[] = [];
  const errors: string[] = [];
  lines.slice(1).forEach((line, i) => {
    const c = line.split(sep);
    const v = idx.map((j) => (j >= 0 ? c[j] ?? '' : ''));
    const vals = v.slice(1).map(num);
    if (vals.some((x) => !Number.isFinite(x))) {
      if (errors.length < 5) errors.push(`Ligne ${i + 2} ignorée (valeur non numérique).`);
      return;
    }
    const [q, pAsp, pRef, n, pElec, vib, temp] = vals;
    rows.push({ t: i, label: v[0]?.trim() || `#${i + 1}`, q, pAsp, pRef, n, pElec, vib, temp });
  });
  return { rows, errors };
}

/** Fichier modèle pré-rempli avec 24 h de relevés simulés. */
export function templateCsv(cfg: PumpConfig): string {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() - 24);
  const lines = [CSV_COLUMNS.join(';')];
  for (let i = 0; i < 24; i++) {
    const m = simulate(cfg, i);
    const d = new Date(start.getTime() + i * 3600_000);
    const ts = `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, '0')}:00`;
    const f = (x: number, k = 2) => x.toFixed(k).replace('.', ',');
    lines.push([ts, f(m.q, 1), f(m.pAsp), f(m.pRef), f(m.n, 0), f(m.pElec), f(m.vib), f(m.temp, 1)].join(';'));
  }
  return lines.join('\n');
}
