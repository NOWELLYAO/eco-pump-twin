import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PUMPS, DEFAULT_SETTINGS, newPump } from '../engine/defaults';
import { simulate } from '../engine/simulator';
import { analyze, diagnose, healthScore, levelOf, smooth } from '../engine/twin';
import type { Analysis, Diagnostic, Level, Measurement, PumpConfig, Settings } from '../engine/types';

const KEY = 'ecopump-twin-v1';
const MAX_HIST = 240; // 10 jours simulés à 1 mesure/heure
const WARMUP = 48;

interface Saved { pumps: PumpConfig[]; settings: Settings }

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (Array.isArray(s.pumps) && s.pumps.length) return { pumps: s.pumps, settings: { ...DEFAULT_SETTINGS, ...s.settings } };
    }
  } catch { /* stockage indisponible */ }
  return { pumps: DEFAULT_PUMPS, settings: DEFAULT_SETTINGS };
}

export interface PumpState {
  cfg: PumpConfig;
  hist: Analysis[];
  now: Analysis | null;
  diags: Diagnostic[];
  score: number;
  level: Level;
}

const RANK: Record<Level, number> = { ok: 0, info: 0, warning: 1, critical: 2 };
export const worst = (a: Level, b: Level) => (RANK[a] >= RANK[b] ? a : b);

function age(cfg: PumpConfig): PumpConfig {
  if (!cfg.controls.autoAging || !cfg.controls.running || cfg.source !== 'sim') return cfg;
  const f = cfg.controls.faults;
  return { ...cfg, controls: { ...cfg.controls, faults: { ...f, wear: Math.min(100, f.wear + 0.12), bearing: Math.min(100, f.bearing + 0.05) } } };
}

export function useTwin() {
  const initial = useMemo(load, []);
  const [pumps, setPumps] = useState<PumpConfig[]>(initial.pumps);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [playing, setPlaying] = useState(true);
  const [rate, setRate] = useState(1); // heures simulées par seconde
  const [t, setT] = useState(WARMUP);
  const [hists, setHists] = useState<Record<string, Analysis[]>>(() => {
    const h: Record<string, Analysis[]> = {};
    for (const p of initial.pumps) {
      h[p.id] = p.source === 'csv' ? [] : Array.from({ length: WARMUP }, (_, i) => analyze(p, simulate(p, i)));
    }
    return h;
  });

  const pumpsRef = useRef(pumps);
  pumpsRef.current = pumps;
  const tRef = useRef(t);
  tRef.current = t;

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ pumps, settings })); } catch { /* ignore */ }
  }, [pumps, settings]);

  const step = useCallback((n: number) => {
    const t0 = tRef.current;
    let cur = pumpsRef.current;
    const added: Record<string, Analysis[]> = {};
    for (let i = 0; i < n; i++) {
      cur = cur.map(age);
      for (const p of cur) {
        if (p.source !== 'sim') continue;
        (added[p.id] ??= []).push(analyze(p, simulate(p, t0 + i)));
      }
    }
    if (cur !== pumpsRef.current) setPumps(cur);
    setHists((h) => {
      const next = { ...h };
      for (const id of Object.keys(added)) next[id] = [...(h[id] ?? []), ...added[id]].slice(-MAX_HIST);
      return next;
    });
    setT(t0 + n);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => step(rate), 1000);
    return () => window.clearInterval(id);
  }, [playing, rate, step]);

  const states: PumpState[] = useMemo(() => pumps.map((cfg) => {
    const hist = hists[cfg.id] ?? [];
    const now = smooth(hist);
    const diags = diagnose(cfg, now);
    const score = healthScore(now);
    const top = diags[0]?.level ?? 'ok';
    return { cfg, hist, now, diags, score, level: worst(levelOf(score), top === 'info' ? 'ok' : top) };
  }), [pumps, hists]);

  const update = useCallback((id: string, fn: (c: PumpConfig) => PumpConfig) => {
    setPumps((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));
  }, []);

  const add = useCallback(() => {
    const p = newPump(pumpsRef.current.length + 1);
    setPumps((ps) => [...ps, p]);
    setHists((h) => ({ ...h, [p.id]: Array.from({ length: 12 }, (_, i) => analyze(p, simulate(p, tRef.current - 12 + i))) }));
    return p.id;
  }, []);

  const remove = useCallback((id: string) => {
    setPumps((ps) => ps.filter((p) => p.id !== id));
  }, []);

  const importCsv = useCallback((id: string, rows: Measurement[]) => {
    setPumps((ps) => ps.map((p) => (p.id === id ? { ...p, source: 'csv' } : p)));
    const cfg = pumpsRef.current.find((p) => p.id === id);
    if (!cfg) return;
    const c = { ...cfg, source: 'csv' as const };
    setHists((h) => ({ ...h, [id]: rows.slice(-MAX_HIST).map((m) => analyze(c, m)) }));
  }, []);

  const backToSim = useCallback((id: string) => {
    const cfg = pumpsRef.current.find((p) => p.id === id);
    if (!cfg) return;
    const c = { ...cfg, source: 'sim' as const };
    setPumps((ps) => ps.map((p) => (p.id === id ? c : p)));
    setHists((h) => ({ ...h, [id]: Array.from({ length: WARMUP }, (_, i) => analyze(c, simulate(c, tRef.current - WARMUP + i))) }));
  }, []);

  const reset = useCallback(() => {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
    window.location.reload();
  }, []);

  return { states, settings, setSettings, playing, setPlaying, rate, setRate, t, step, update, add, remove, importCsv, backToSim, reset };
}

export type Twin = ReturnType<typeof useTwin>;
