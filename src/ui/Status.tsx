import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { Level } from '../engine/types';
import { LEVEL_LABEL } from './util';

export function LevelIcon({ level, size = 16 }: { level: Level; size?: number }) {
  if (level === 'critical') return <AlertOctagon size={size} aria-hidden />;
  if (level === 'warning') return <AlertTriangle size={size} aria-hidden />;
  if (level === 'info') return <Info size={size} aria-hidden />;
  return <CheckCircle2 size={size} aria-hidden />;
}

export function Badge({ level, label }: { level: Level; label?: string }) {
  return (
    <span className={`badge lv-${level}`}>
      <LevelIcon level={level} size={14} />
      {label ?? LEVEL_LABEL[level]}
    </span>
  );
}

/** Anneau d'indice de santé. */
export function HealthRing({ score, level, size = 64 }: { score: number; level: Level; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <div className={`ring lv-${level}`} style={{ width: size, height: size }} title={`Indice de santé : ${score}/100`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="ring-bg" strokeWidth="6" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} className="ring-fg" strokeWidth="6" fill="none" strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span style={{ fontSize: size * 0.28 }}>{score}</span>
    </div>
  );
}
