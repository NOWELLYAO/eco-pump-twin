import type { Analysis, Level, PumpConfig } from '../engine/types';
import { LIMITS } from '../engine/twin';
import { fmt } from './util';

const lv = (v: number, warn: number, crit: number, up = true): Level =>
  up ? (v >= crit ? 'critical' : v >= warn ? 'warning' : 'ok') : (v <= crit ? 'critical' : v <= warn ? 'warning' : 'ok');

function Tag({ x, y, code, label, value, level, w = 108 }: { x: number; y: number; code: string; label: string; value: string; level: Level; w?: number }) {
  return (
    <g transform={`translate(${x},${y})`} className={`tag lv-${level}`}>
      <rect width={w} height={40} rx={8} />
      <text x={8} y={15} className="tag-code">{code} · {label}</text>
      <text x={8} y={33} className="tag-val">{value}</text>
    </g>
  );
}

/** Schéma de l'installation avec les mesures en direct aux points de capteurs. */
export function Synoptic({ cfg, a }: { cfg: PumpConfig; a: Analysis | null }) {
  const running = !!a && a.m.q > 0.01;
  const ratio = a ? a.m.q / cfg.spec.qn : 0;
  const dur = running ? Math.max(0.35, 1.6 / Math.max(0.15, ratio)) : 0;
  const valve = cfg.controls.valvePct;
  const level = Math.max(0.12, Math.min(0.9, (a ? a.npsha : cfg.system.npsha) / (cfg.system.npsha * 1.15)));
  const L = LIMITS;

  return (
    <svg viewBox="0 0 660 300" className="synoptic" role="img" aria-label="Schéma de l'installation avec les mesures des capteurs">
      {/* Bassin d'aspiration */}
      <rect x="16" y="140" width="120" height="130" rx="6" className="tank" />
      <rect x="18" y={270 - 126 * level} width="116" height={126 * level - 2} rx="4" className="water" />
      <text x="76" y="132" textAnchor="middle" className="cap">Bassin / forage</text>

      {/* Réservoir haut */}
      <rect x="540" y="22" width="104" height="92" rx="6" className="tank" />
      <rect x="542" y="62" width="100" height="50" rx="4" className="water" />
      <text x="592" y="132" textAnchor="middle" className="cap">Réservoir · {fmt(cfg.system.hStatic, 0)} m</text>

      {/* Tuyauteries */}
      <path d="M136 236 H262" className="pipe" />
      <path d="M300 196 V70 H540" className="pipe" />
      {running && (
        <>
          <path d="M136 236 H262" className="flow" style={{ animationDuration: `${dur}s` }} />
          <path d="M300 196 V70 H540" className="flow" style={{ animationDuration: `${dur}s` }} />
        </>
      )}

      {/* Vanne de refoulement */}
      <g transform="translate(430,70)">
        <path d="M-14 -11 L14 11 L14 -11 L-14 11 Z" className={`valve ${valve < 70 ? 'throttled' : ''}`} />
        <line x1="0" y1="0" x2="0" y2="-20" className="stem" />
        <text x="0" y="-26" textAnchor="middle" className="cap">Vanne {valve} %</text>
      </g>

      {/* Pompe + moteur */}
      <rect x="334" y="208" width="104" height="52" rx="8" className="motor" />
      <text x="386" y="239" textAnchor="middle" className="cap strong">Moteur {fmt(cfg.spec.motorKw, 1)} kW</text>
      <circle cx="300" cy="234" r="38" className="volute" />
      <g className={running ? 'impeller spin' : 'impeller'} style={{ animationDuration: running ? `${Math.max(0.25, 1.2 / Math.max(0.2, cfg.controls.speedPct / 100))}s` : undefined }}>
        {[0, 60, 120, 180, 240, 300].map((r) => (
          <path key={r} d="M300 234 q8 -10 6 -24" transform={`rotate(${r} 300 234)`} />
        ))}
      </g>
      <circle cx="300" cy="234" r="5" className="hub" />

      {/* Capteurs */}
      {a && (
        <>
          <Tag x={150} y={176} code="PT1" label="Aspiration" value={`${fmt(a.m.pAsp, 2)} bar`} level={lv(a.margin, L.marginWarn, L.marginCrit, false)} />
          <Tag x={150} y={92} code="PT2" label="Refoulement" value={`${fmt(a.m.pRef, 2)} bar`} level={lv(a.devH, L.devHWarn, L.devHCrit, false)} />
          <Tag x={318} y={88} code="FT" label="Débit" value={`${fmt(a.m.q, 1)} m³/h`} level={lv(a.x, L.xLow, L.xLowCrit, false) === 'ok' ? lv(a.x, L.xHigh, L.xHighCrit) : lv(a.x, L.xLow, L.xLowCrit, false)} />
          <Tag x={456} y={150} code="JT" label="Puissance" value={`${fmt(a.m.pElec, 2)} kW`} level={a.m.pElec > cfg.spec.motorKw / cfg.spec.etaMotor ? 'warning' : 'ok'} w={112} />
          <Tag x={456} y={200} code="VT" label="Vibrations" value={`${fmt(a.m.vib, 1)} mm/s`} level={lv(a.m.vib, L.vibWarn, L.vibCrit)} w={112} />
          <Tag x={456} y={250} code="TT" label="Palier" value={`${fmt(a.m.temp, 0)} °C`} level={lv(a.m.temp, L.tempWarn, L.tempCrit)} w={112} />
          <line x1="438" y1="232" x2="456" y2="220" className="lead" />
          <line x1="438" y1="250" x2="456" y2="270" className="lead" />
          <line x1="420" y1="208" x2="456" y2="170" className="lead" />
        </>
      )}
    </svg>
  );
}
