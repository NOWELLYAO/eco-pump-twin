import { Clock, Gauge, Leaf, Wrench, Zap } from 'lucide-react';
import type { Analysis, Diagnostic, PumpConfig, Settings } from '../engine/types';
import { energy, forecast } from '../engine/twin';
import { Badge, LevelIcon } from './Status';
import { duration, fmt, money, signed } from './util';

export function DiagnosticList({ diags, compact = false }: { diags: Diagnostic[]; compact?: boolean }) {
  const list = compact ? diags.slice(0, 2) : diags;
  return (
    <ul className="diags">
      {list.map((d) => (
        <li key={d.id} className={`diag lv-${d.level}`}>
          <div className="diag-head">
            <LevelIcon level={d.level} size={18} />
            <strong>{d.title}</strong>
            <Badge level={d.level} />
          </div>
          {!compact && <p className="diag-cause">{d.cause}</p>}
          {d.evidence.length > 0 && (
            <ul className="evidence">
              {d.evidence.map((e) => <li key={e}>{e}</li>)}
            </ul>
          )}
          <p className="diag-action"><Wrench size={14} aria-hidden /> <span>{d.action}</span></p>
        </li>
      ))}
    </ul>
  );
}

export function ForecastCard({ hist }: { hist: Analysis[] }) {
  const f = forecast(hist);
  return (
    <section className="card">
      <h3><Clock size={16} aria-hidden /> Prédiction</h3>
      {f.length === 0 ? (
        <p className="muted">Aucune dérive détectée : aucun indicateur ne se rapproche d'un seuil critique.</p>
      ) : (
        <ul className="forecast">
          {f.slice(0, 3).map((x) => (
            <li key={x.indicator}>
              <span className={x.hours < 24 * 7 ? 'fc-time urgent' : 'fc-time'}>{duration(x.hours)}</span>
              <span>
                <strong>{x.indicator}</strong>
                <small>actuel {x.current} → seuil critique {x.threshold}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">Tendance calculée sur les 72 dernières heures de mesures.</p>
    </section>
  );
}

export function EnergyCard({ cfg, a, settings, full = false }: { cfg: PumpConfig; a: Analysis | null; settings: Settings; full?: boolean }) {
  const e = energy(cfg, a, settings);
  if (!e || !a) return <section className="card"><h3><Zap size={16} aria-hidden /> Énergie</h3><p className="muted">Pompe à l'arrêt.</p></section>;
  return (
    <section className="card">
      <h3><Zap size={16} aria-hidden /> Énergie</h3>
      <div className="stats">
        <div><small>Coût par jour</small><b>{money(e.costDay, settings.currency)}</b><span>{fmt(e.kwhDay, 0)} kWh · {settings.hoursPerDay} h/j</span></div>
        <div><small>Coût par an</small><b>{money(e.costYear, settings.currency)}</b><span>{fmt(e.m3Day * 365, 0)} m³ pompés</span></div>
        <div><small>Énergie spécifique</small><b>{fmt(e.seNow * 1000, 0)} Wh/m³</b><span>optimum {fmt(e.seOpt * 1000, 0)} Wh/m³</span></div>
      </div>
      {e.savingYear > 0 ? (
        <div className="saving">
          <Leaf size={20} aria-hidden />
          <div>
            <b>{money(e.savingYear, settings.currency)} / an récupérables</b>
            <span>soit {fmt(e.savingPct, 0)} % de la facture, en corrigeant les défauts signalés.</span>
          </div>
        </div>
      ) : (
        <p className="muted ok-line"><Gauge size={15} aria-hidden /> La pompe fonctionne près de son optimum énergétique.</p>
      )}
      {full && (
        <table className="tbl">
          <tbody>
            <tr><th>Puissance absorbée</th><td>{fmt(a.m.pElec, 2)} kW</td><td className="muted">attendu {fmt(a.pExp, 2)} kW ({signed(a.devP)} %)</td></tr>
            <tr><th>Rendement pompe</th><td>{fmt(a.eta, 1)} %</td><td className="muted">attendu {fmt(a.etaExp, 1)} %</td></tr>
            <tr><th>Charge moteur</th><td>{fmt((a.m.pElec * cfg.spec.etaMotor / cfg.spec.motorKw) * 100, 0)} %</td><td className="muted">moteur {cfg.spec.motorKw} kW</td></tr>
            <tr><th>Tarif</th><td>{fmt(settings.pricePerKwh, 0)} {settings.currency}/kWh</td><td className="muted">modifiable dans Réglages</td></tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
