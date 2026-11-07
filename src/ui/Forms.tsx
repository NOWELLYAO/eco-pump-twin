import { useRef, useState } from 'react';
import { Download, FlaskConical, Power, RotateCcw, Trash2, Upload } from 'lucide-react';
import { parseCsv, templateCsv } from '../engine/csv';
import { healthyControls } from '../engine/defaults';
import type { FaultKey, Measurement, PumpConfig, Settings } from '../engine/types';
import { download, fmt } from './util';

function Slider({ label, value, min, max, step = 1, unit, onChange, help }: {
  label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void; help?: string;
}) {
  return (
    <label className="slider">
      <span className="sl-top"><span>{label}</span><b>{fmt(value, 0)} {unit}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {help && <small>{help}</small>}
    </label>
  );
}

const FAULTS: { key: FaultKey; label: string; help: string }[] = [
  { key: 'wear', label: 'Usure de la roue / bagues', help: 'Baisse de hauteur et de rendement à débit égal.' },
  { key: 'cavitation', label: 'Baisse du niveau d\'aspiration', help: 'Réduit le NPSH disponible → cavitation.' },
  { key: 'clogging', label: 'Crépine colmatée', help: 'Pertes de charge à l\'aspiration et au réseau.' },
  { key: 'bearing', label: 'Roulement dégradé', help: 'Vibrations et échauffement du palier.' },
];

const SCENARIOS: { label: string; apply: (c: PumpConfig) => PumpConfig }[] = [
  { label: 'Pompe neuve', apply: (c) => ({ ...c, controls: { ...healthyControls() } }) },
  { label: 'Usure avancée', apply: (c) => ({ ...c, controls: { ...healthyControls(), faults: { wear: 70, cavitation: 0, bearing: 0, clogging: 0 } } }) },
  { label: 'Cavitation', apply: (c) => ({ ...c, controls: { ...healthyControls(), faults: { wear: 0, cavitation: 85, bearing: 0, clogging: 0 } } }) },
  { label: 'Vanne trop fermée', apply: (c) => ({ ...c, controls: { ...healthyControls(), valvePct: 35 } }) },
  { label: 'Roulement HS', apply: (c) => ({ ...c, controls: { ...healthyControls(), faults: { wear: 0, cavitation: 0, bearing: 80, clogging: 0 } } }) },
  { label: 'Vieillissement accéléré', apply: (c) => ({ ...c, controls: { ...healthyControls(), faults: { wear: 10, cavitation: 0, bearing: 10, clogging: 0 }, autoAging: true } }) },
];

export function SimLab({ cfg, onChange }: { cfg: PumpConfig; onChange: (fn: (c: PumpConfig) => PumpConfig) => void }) {
  const ctl = cfg.controls;
  const set = (patch: Partial<typeof ctl>) => onChange((c) => ({ ...c, controls: { ...c.controls, ...patch } }));
  const setFault = (k: FaultKey, v: number) => onChange((c) => ({ ...c, controls: { ...c.controls, faults: { ...c.controls.faults, [k]: v } } }));

  if (cfg.source === 'csv') {
    return <section className="card"><p className="muted">Cette pompe affiche des données importées. Repassez en simulation depuis l'onglet Paramètres pour utiliser le simulateur.</p></section>;
  }

  return (
    <div className="grid2">
      <section className="card">
        <h3><FlaskConical size={16} aria-hidden /> Scénarios prêts à l'emploi</h3>
        <p className="muted">Créez une panne en un clic, puis regardez le jumeau la détecter dans Vue d'ensemble.</p>
        <div className="scenarios">
          {SCENARIOS.map((s) => (
            <button key={s.label} className="btn" onClick={() => onChange(s.apply)}>{s.label}</button>
          ))}
        </div>
        <h3 className="mt">Pilotage</h3>
        <button className={ctl.running ? 'btn toggle on' : 'btn toggle'} onClick={() => set({ running: !ctl.running })} aria-pressed={ctl.running}>
          <Power size={16} aria-hidden /> {ctl.running ? 'Pompe en marche' : 'Pompe arrêtée'}
        </button>
        <Slider label="Vitesse (variateur)" value={ctl.speedPct} min={50} max={110} unit="%" onChange={(v) => set({ speedPct: v })}
          help={`${fmt((cfg.spec.nn * ctl.speedPct) / 100, 0)} tr/min`} />
        <Slider label="Ouverture vanne de refoulement" value={ctl.valvePct} min={10} max={100} unit="%" onChange={(v) => set({ valvePct: v })} />
      </section>
      <section className="card">
        <h3>Défauts simulés</h3>
        <p className="muted">Ce que le jumeau ne voit pas : il ne reçoit que les mesures des capteurs et doit en déduire la cause.</p>
        {FAULTS.map((f) => (
          <Slider key={f.key} label={f.label} value={Math.round(ctl.faults[f.key])} min={0} max={100} unit="%" help={f.help} onChange={(v) => setFault(f.key, v)} />
        ))}
        <label className="check">
          <input type="checkbox" checked={ctl.autoAging} onChange={(e) => set({ autoAging: e.target.checked })} />
          <span>Usure progressive automatique <small>(pour tester la prédiction)</small></span>
        </label>
      </section>
    </div>
  );
}

function Num({ label, value, onChange, step = 'any', unit }: { label: string; value: number; onChange: (v: number) => void; step?: string; unit?: string }) {
  const [txt, setTxt] = useState(String(value).replace('.', ','));
  return (
    <label className="fld">
      <span>{label}{unit && <em> ({unit})</em>}</span>
      <input
        inputMode="decimal" step={step} value={txt}
        onChange={(e) => {
          setTxt(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          if (Number.isFinite(v) && v > 0) onChange(v);
        }}
      />
    </label>
  );
}

function Txt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="fld"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} /></label>
  );
}

export function ConfigPanel({ cfg, onChange, onImport, onBackToSim, onDelete, canDelete }: {
  cfg: PumpConfig;
  onChange: (fn: (c: PumpConfig) => PumpConfig) => void;
  onImport: (rows: Measurement[]) => void;
  onBackToSim: () => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const spec = (k: keyof PumpConfig['spec'], scale = 1) => (v: number) => onChange((c) => ({ ...c, spec: { ...c.spec, [k]: v / scale } }));
  const sys = (k: keyof PumpConfig['system']) => (v: number) => onChange((c) => ({ ...c, system: { ...c.system, [k]: v } }));

  const onFile = async (f: File) => {
    const { rows, errors } = parseCsv(await f.text());
    if (!rows.length) { setMsg({ ok: false, text: errors.join(' ') || 'Aucune ligne valide.' }); return; }
    onImport(rows);
    setMsg({ ok: true, text: `${rows.length} relevés importés.${errors.length ? ' ' + errors.join(' ') : ''}` });
  };

  return (
    <div className="grid2" key={cfg.id}>
      <section className="card">
        <h3>Identification</h3>
        <div className="form">
          <Txt label="Nom" value={cfg.name} onChange={(v) => onChange((c) => ({ ...c, name: v }))} />
          <Txt label="Site / usage" value={cfg.site} onChange={(v) => onChange((c) => ({ ...c, site: v }))} />
          <Txt label="Modèle" value={cfg.model} onChange={(v) => onChange((c) => ({ ...c, model: v }))} />
        </div>
        <h3 className="mt">Fiche constructeur <small>(au point de meilleur rendement)</small></h3>
        <div className="form two">
          <Num label="Débit nominal" unit="m³/h" value={cfg.spec.qn} onChange={spec('qn')} />
          <Num label="Hauteur nominale" unit="m" value={cfg.spec.hn} onChange={spec('hn')} />
          <Num label="Rendement pompe" unit="%" value={Math.round(cfg.spec.etaBep * 100)} onChange={spec('etaBep', 100)} />
          <Num label="Vitesse nominale" unit="tr/min" value={cfg.spec.nn} onChange={spec('nn')} />
          <Num label="Puissance moteur" unit="kW" value={cfg.spec.motorKw} onChange={spec('motorKw')} />
          <Num label="Rendement moteur" unit="%" value={Math.round(cfg.spec.etaMotor * 100)} onChange={spec('etaMotor', 100)} />
          <Num label="NPSH requis" unit="m" value={cfg.spec.npshrBep} onChange={spec('npshrBep')} />
          <Num label="H à débit nul / H nominale" value={cfg.spec.shutoffRatio} onChange={spec('shutoffRatio')} />
        </div>
        <h3 className="mt">Installation</h3>
        <div className="form two">
          <Num label="Hauteur géométrique" unit="m" value={cfg.system.hStatic} onChange={sys('hStatic')} />
          <Num label="NPSH disponible" unit="m" value={cfg.system.npsha} onChange={sys('npsha')} />
        </div>
      </section>
      <section className="card">
        <h3>Données réelles (relevés capteurs)</h3>
        <p className="muted">
          Importez les relevés de votre enregistreur au format CSV : le jumeau les analyse avec la fiche de cette pompe.
          Colonnes : horodatage, débit (m³/h), pressions aspiration et refoulement (bar), vitesse (tr/min), puissance (kW), vibrations (mm/s), température palier (°C).
        </p>
        <div className="row">
          <button className="btn" onClick={() => download(`modele-releves-${cfg.name.replace(/\W+/g, '-').toLowerCase()}.csv`, templateCsv(cfg))}>
            <Download size={16} aria-hidden /> Fichier modèle
          </button>
          <button className="btn primary" onClick={() => file.current?.click()}><Upload size={16} aria-hidden /> Importer un CSV</button>
          <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
        </div>
        {msg && <p className={msg.ok ? 'note ok' : 'note err'}>{msg.text}</p>}
        {cfg.source === 'csv' && (
          <div className="row mt">
            <span className="pill">Source : données importées</span>
            <button className="btn" onClick={onBackToSim}><RotateCcw size={16} aria-hidden /> Revenir à la simulation</button>
          </div>
        )}
        <h3 className="mt">Zone de danger</h3>
        <button className="btn danger" disabled={!canDelete} onClick={() => { if (window.confirm(`Supprimer « ${cfg.name} » ?`)) onDelete(); }}>
          <Trash2 size={16} aria-hidden /> Supprimer cette pompe
        </button>
      </section>
    </div>
  );
}

export function SettingsForm({ s, onChange, onReset }: { s: Settings; onChange: (s: Settings) => void; onReset: () => void }) {
  return (
    <div className="form">
      <label className="fld"><span>Devise</span>
        <select value={s.currency} onChange={(e) => onChange({ ...s, currency: e.target.value })}>
          {['FCFA', 'KES', 'EUR', 'USD', 'MAD', 'GNF', 'CDF', 'XAF'].map((c) => <option key={c}>{c}</option>)}
        </select>
      </label>
      <Num label="Prix de l'électricité" unit={`${s.currency}/kWh`} value={s.pricePerKwh} onChange={(v) => onChange({ ...s, pricePerKwh: v })} />
      <Num label="Heures de fonctionnement par jour" unit="h" value={s.hoursPerDay} onChange={(v) => onChange({ ...s, hoursPerDay: Math.min(24, v) })} />
      <button className="btn danger mt" onClick={() => { if (window.confirm('Effacer toutes les pompes et réglages et revenir à la démo ?')) onReset(); }}>
        <RotateCcw size={16} aria-hidden /> Réinitialiser la démo
      </button>
    </div>
  );
}
