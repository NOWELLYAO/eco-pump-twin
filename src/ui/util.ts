import { useEffect, useState } from 'react';
import type { Level } from '../engine/types';

const nf = (d: number) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmt = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? '—' : nf(d).format(v));
export const signed = (v: number, d = 1) => `${v > 0 ? '+' : ''}${fmt(v, d)}`;

export function money(v: number, currency: string) {
  const big = Math.abs(v) >= 1e6;
  return `${nf(big ? 2 : 0).format(big ? v / 1e6 : v)}${big ? ' M' : ''} ${currency}`;
}

export function duration(hours: number) {
  if (hours <= 0) return 'maintenant';
  if (hours < 48) return `${Math.round(hours)} h`;
  const d = hours / 24;
  if (d < 60) return `${Math.round(d)} jours`;
  return `${Math.round(d / 30)} mois`;
}

export const simClock = (t: number) => {
  const d = Math.floor(t / 24) + 1;
  const h = Math.floor(t % 24);
  return `Jour ${d} · ${String(h).padStart(2, '0')}:00`;
};

export const LEVEL_LABEL: Record<Level, string> = { ok: 'Normal', info: 'Info', warning: 'Attention', critical: 'Critique' };

export function useDark() {
  const q = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setDark(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return dark;
}

/** Palette des graphiques, validée daltonisme (clair / sombre). */
export function useChartColors() {
  const dark = useDark();
  return dark
    ? { s1: '#2a93cc', s2: '#c96e1e', s3: '#8a6fd6', grid: '#2a3842', axis: '#9fb0bc', ink: '#e7eef3', surface: '#18222b', band: 'rgba(42,147,204,.10)', warn: '#fab219', crit: '#d03b3b', good: '#3fbf4f' }
    : { s1: '#1689c6', s2: '#d9761f', s3: '#7a5bc4', grid: '#e3e9ef', axis: '#5a6b78', ink: '#17242e', surface: '#ffffff', band: 'rgba(22,137,198,.08)', warn: '#c98a00', crit: '#d03b3b', good: '#0a8f2e' };
}

export function download(name: string, text: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
