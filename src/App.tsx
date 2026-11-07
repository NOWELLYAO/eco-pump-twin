import { useEffect, useState } from 'react';
import {
  Activity, ArrowLeft, BookOpen, ChevronRight, Database, FlaskConical, Gauge, LayoutGrid, LineChart as LineIcon,
  Pause, Play, Plus, Settings as Cog, Wrench, SlidersHorizontal, Stethoscope, X,
} from 'lucide-react';
import { useTwin, type PumpState } from './hooks/useTwin';
import { energy, LIMITS } from './engine/twin';
import type { Analysis, Level, PumpConfig } from './engine/types';
import { Badge, HealthRing } from './ui/Status';
import { Synoptic } from './ui/Synoptic';
import { CurveCharts } from './ui/CurveCharts';
import { TrendChart } from './ui/TrendChart';
import { DiagnosticList, EnergyCard, ForecastCard } from './ui/Panels';
import { ConfigPanel, SettingsForm, SimLab } from './ui/Forms';
import { fmt, money, signed, simClock } from './ui/util';
import { InstallerPage } from './installer/ui/InstallerPage';

type Tab = 'overview' | 'curves' | 'history' | 'energy' | 'sim' | 'config';
const TABS: { id: Tab; label: string; icon: typeof Gauge }[] = [
  { id: 'overview', label: 'Vue d\'ensemble', icon: Gauge },
  { id: 'curves', label: 'Courbes', icon: Activity },
  { id: 'history', label: 'Historique', icon: LineIcon },
  { id: 'energy', label: 'Diagnostic & énergie', icon: Stethoscope },
  { id: 'sim', label: 'Simulateur', icon: FlaskConical },
  { id: 'config', label: 'Paramètres', icon: SlidersHorizontal },
];

function Kpi({ label, value, unit, sub, level = 'ok' }: { label: string; value: string; unit: string; sub: string; level?: Level }) {
  return (
    <div className={`kpi lv-${level}`}>
      <small>{label}</small>
      <b>{value}<span>{unit}</span></b>
      <em>{sub}</em>
    </div>
  );
}

function Kpis({ cfg, a }: { cfg: PumpConfig; a: Analysis | null }) {
  if (!a) return null;
  const L = LIMITS;
  const on = a.m.q > 0.01;
  const lvl = (bad: boolean, worse: boolean): Level => (worse ? 'critical' : bad ? 'warning' : 'ok');
  return (
    <div className="kpis">
      <Kpi label="Débit" value={fmt(a.m.q, 1)} unit="m³/h" sub={on ? `${fmt(a.x * 100, 0)} % de l'optimum` : 'à l\'arrêt'}
        level={on ? lvl(a.x < L.xLow || a.x > L.xHigh, a.x < L.xLowCrit || a.x > L.xHighCrit) : 'ok'} />
      <Kpi label="Hauteur" value={fmt(a.h, 1)} unit="m" sub={on ? `attendu ${fmt(a.hExp, 1)} m (${signed(a.devH)} %)` : '—'}
        level={on ? lvl(a.devH < L.devHWarn, a.devH < L.devHCrit) : 'ok'} />
      <Kpi label="Puissance" value={fmt(a.m.pElec, 2)} unit="kW" sub={on ? `attendu ${fmt(a.pExp, 2)} kW` : '—'}
        level={a.m.pElec > cfg.spec.motorKw / cfg.spec.etaMotor ? 'warning' : 'ok'} />
      <Kpi label="Rendement" value={fmt(a.eta, 1)} unit="%" sub={on ? `attendu ${fmt(a.etaExp, 1)} %` : '—'}
        level={on ? lvl(a.eta < a.etaExp - 4, a.eta < a.etaExp - 10) : 'ok'} />
      <Kpi label="Vibrations" value={fmt(a.m.vib, 1)} unit="mm/s" sub={`alerte ${fmt(L.vibWarn, 1)} · danger ${fmt(L.vibCrit, 1)}`}
        level={lvl(a.m.vib > L.vibWarn, a.m.vib > L.vibCrit)} />
      <Kpi label="Marge NPSH" value={fmt(a.margin, 2)} unit="m" sub={on ? `dispo ${fmt(a.npsha, 1)} / requis ${fmt(a.npshr, 1)}` : '—'}
        level={on ? lvl(a.margin < L.marginWarn, a.margin < L.marginCrit) : 'ok'} />
    </div>
  );
}

function FleetView({ states, onOpen, twin }: { states: PumpState[]; onOpen: (id: string) => void; twin: ReturnType<typeof useTwin> }) {
  const crit = states.filter((s) => s.level === 'critical').length;
  const warn = states.filter((s) => s.level === 'warning').length;
  let cost = 0, saving = 0;
  for (const s of states) {
    const e = energy(s.cfg, s.now, twin.settings);
    if (e) { cost += e.costYear; saving += e.savingYear; }
  }
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Parc de pompes</h1>
          <p className="muted">Chaque pompe est comparée en continu à son modèle numérique « pompe saine ».</p>
        </div>
        <button className="btn primary" onClick={() => onOpen(twin.add())}><Plus size={16} aria-hidden /> Ajouter une pompe</button>
      </div>
      <div className="summary">
        <div><small>Pompes suivies</small><b>{states.length}</b></div>
        <div className={crit ? 'lv-critical' : ''}><small>Critiques</small><b>{crit}</b></div>
        <div className={warn ? 'lv-warning' : ''}><small>À surveiller</small><b>{warn}</b></div>
        <div><small>Facture énergie / an</small><b>{money(cost, twin.settings.currency)}</b></div>
        <div className="lv-ok"><small>Économies possibles / an</small><b>{money(saving, twin.settings.currency)}</b></div>
      </div>
      <div className="fleet-grid">
        {states.map((s) => (
          <button key={s.cfg.id} className={`pump-card lv-${s.level}`} onClick={() => onOpen(s.cfg.id)}>
            <div className="pc-top">
              <HealthRing score={s.score} level={s.level} size={56} />
              <div className="pc-id">
                <strong>{s.cfg.name}</strong>
                <span>{s.cfg.model} · {s.cfg.site}</span>
              </div>
              <ChevronRight size={18} className="chev" aria-hidden />
            </div>
            <div className="pc-diag"><Badge level={s.level} label={s.diags[0]?.title} /></div>
            {s.now && (
              <div className="pc-vals">
                <span><b>{fmt(s.now.m.q, 1)}</b> m³/h</span>
                <span><b>{fmt(s.now.h, 1)}</b> m</span>
                <span><b>{fmt(s.now.m.pElec, 1)}</b> kW</span>
                <span><b>{fmt(s.now.m.vib, 1)}</b> mm/s</span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function PumpView({ st, twin, tab, setTab, onBack, onDeleted }: {
  st: PumpState; twin: ReturnType<typeof useTwin>; tab: Tab; setTab: (t: Tab) => void; onBack: () => void; onDeleted: () => void;
}) {
  const { cfg, now, diags, hist, score, level } = st;
  const upd = (fn: (c: PumpConfig) => PumpConfig) => twin.update(cfg.id, fn);
  return (
    <div className="page">
      <div className="pump-head">
        <button className="icon-btn back" onClick={onBack} aria-label="Retour au parc"><ArrowLeft size={20} /></button>
        <HealthRing score={score} level={level} size={60} />
        <div className="ph-id">
          <h1>{cfg.name}</h1>
          <p className="muted">{cfg.model} · {cfg.site} · {fmt(cfg.spec.qn, 0)} m³/h à {fmt(cfg.spec.hn, 0)} m</p>
        </div>
        <div className="ph-badges">
          <Badge level={level} />
          <span className="pill"><Database size={13} aria-hidden /> {cfg.source === 'csv' ? 'Données importées' : 'Simulation'}</span>
        </div>
      </div>
      <nav className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'tab on' : 'tab'} onClick={() => setTab(t.id)}>
            <t.icon size={16} aria-hidden /> {t.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <>
          <Kpis cfg={cfg} a={now} />
          <div className="grid-main">
            <section className="card span2">
              <h3>Installation en direct</h3>
              <div className="syn-wrap"><Synoptic cfg={cfg} a={now} /></div>
              <p className="hint mobile-only">Faites glisser le schéma horizontalement pour voir tous les capteurs.</p>
            </section>
            <section className="card">
              <h3>Diagnostic</h3>
              <DiagnosticList diags={diags} compact />
              {diags.length > 2 && <button className="link" onClick={() => setTab('energy')}>Voir les {diags.length} diagnostics →</button>}
            </section>
            <section className="card span2">
              <h3>Point de fonctionnement</h3>
              <CurveCharts cfg={cfg} a={now} compact />
            </section>
            <ForecastCard hist={hist} />
          </div>
        </>
      )}
      {tab === 'curves' && (
        <section className="card">
          <h3>Courbes caractéristiques</h3>
          <p className="muted">Trait bleu : ce que la pompe devrait faire si elle était neuve, à sa vitesse actuelle. Point orange : ce qu'elle fait réellement. L'écart entre les deux révèle l'usure ou la cavitation.</p>
          <CurveCharts cfg={cfg} a={now} />
        </section>
      )}
      {tab === 'history' && (
        <section className="card">
          <h3>Historique des mesures</h3>
          <TrendChart hist={hist} />
        </section>
      )}
      {tab === 'energy' && (
        <div className="grid2">
          <section className="card">
            <h3>Tous les diagnostics</h3>
            <DiagnosticList diags={diags} />
          </section>
          <div className="stack">
            <EnergyCard cfg={cfg} a={now} settings={twin.settings} full />
            <ForecastCard hist={hist} />
          </div>
        </div>
      )}
      {tab === 'sim' && <SimLab cfg={cfg} onChange={upd} />}
      {tab === 'config' && (
        <ConfigPanel
          cfg={cfg} onChange={upd}
          onImport={(rows) => { twin.importCsv(cfg.id, rows); setTab('overview'); }}
          onBackToSim={() => twin.backToSim(cfg.id)}
          onDelete={() => { twin.remove(cfg.id); onDeleted(); }}
          canDelete={twin.states.length > 1}
        />
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button></div>
        {children}
      </div>
    </div>
  );
}

function Guide() {
  return (
    <div className="guide">
      <p><b>Un jumeau numérique</b> est une copie virtuelle de chaque pompe. Il connaît ses courbes constructeur et calcule en permanence ce qu'une pompe <i>saine</i> devrait faire. Il compare ensuite aux mesures des capteurs.</p>
      <ol>
        <li><b>Mesures</b> : pressions aspiration et refoulement, débit, vitesse, puissance, vibrations, température palier.</li>
        <li><b>Comparaison</b> : la hauteur et le rendement réels sont comparés au modèle, au même débit et à la même vitesse.</li>
        <li><b>Diagnostic</b> : chaque écart a une signature (usure, cavitation, hors plage, roulement…). L'app nomme la cause et l'action.</li>
        <li><b>Prédiction</b> : la tendance des indicateurs donne le temps restant avant le seuil critique.</li>
        <li><b>Énergie</b> : l'app chiffre ce que coûtent les défauts, dans votre devise.</li>
      </ol>
      <p><b>Pour tester</b> : ouvrez une pompe → <i>Simulateur</i> → choisissez une panne, puis revenez sur <i>Vue d'ensemble</i>. Accélérez le temps (×24) pour voir la prédiction évoluer.</p>
      <p><b>Avec de vraies pompes</b> : <i>Paramètres</i> → saisissez la fiche constructeur, puis importez les relevés de vos capteurs au format CSV (un fichier modèle est fourni).</p>
    </div>
  );
}

export default function App() {
  const twin = useTwin();
  const [sel, setSel] = useState<string | null>(null);
  const [section, setSection] = useState<'twin' | 'installer'>(() => (window.location.hash === '#installation' ? 'installer' : 'twin'));
  useEffect(() => { window.history.replaceState(null, '', section === 'installer' ? '#installation' : '#'); }, [section]);
  const [tab, setTab] = useState<Tab>('overview');
  const [modal, setModal] = useState<'settings' | 'guide' | null>(null);
  const current = twin.states.find((s) => s.cfg.id === sel) ?? null;
  const open = (id: string) => { setSection('twin'); setSel(id); setTab('overview'); window.scrollTo({ top: 0 }); };
  const goFleet = () => { setSection('twin'); setSel(null); };

  return (
    <div className={`app ${current ? 'has-pump' : ''} sec-${section}`}>
      <header className="appbar">
        <button className="brand" onClick={goFleet} aria-label="Accueil : parc de pompes">
          <img src="/logo.png" alt="ECO PUMP AFRIK" />
        </button>
        <nav className="topnav" aria-label="Modules">
          <button aria-pressed={section === 'twin'} onClick={goFleet}><Gauge size={16} aria-hidden /><span>Jumeau numérique</span></button>
          <button aria-pressed={section === 'installer'} onClick={() => setSection('installer')}><Wrench size={16} aria-hidden /><span>Configurateur</span></button>
        </nav>
        <div className="sp" />
        <div className="clock twin-only" title="Temps simulé">
          <span className="live" data-on={twin.playing} aria-hidden />
          {simClock(twin.t)}
        </div>
        <div className="seg twin-only" role="group" aria-label="Vitesse du temps">
          {[1, 6, 24].map((r) => (
            <button key={r} aria-pressed={twin.rate === r} onClick={() => twin.setRate(r)} title={`${r} h simulée(s) par seconde`}>×{r}</button>
          ))}
        </div>
        <button className="icon-btn twin-only" onClick={() => twin.setPlaying(!twin.playing)} aria-label={twin.playing ? 'Pause' : 'Lecture'}>
          {twin.playing ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="icon-btn" onClick={() => setModal('guide')} aria-label="Guide"><BookOpen size={18} /></button>
        <button className="icon-btn" onClick={() => setModal('settings')} aria-label="Réglages"><Cog size={18} /></button>
      </header>

      <div className="layout">
        <aside className="side">
          <button className={section === 'installer' ? 'side-item on' : 'side-item'} onClick={() => setSection('installer')}>
            <Wrench size={18} aria-hidden /><span className="si-name">Configurateur d'installation</span>
          </button>
          <button className={section === 'twin' && !current ? 'side-item on' : 'side-item'} onClick={goFleet}>
            <LayoutGrid size={18} aria-hidden /><span className="si-name">Parc de pompes</span>
          </button>
          <div className="side-label">Pompes</div>
          {twin.states.map((s) => (
            <button key={s.cfg.id} className={section === 'twin' && s.cfg.id === sel ? 'side-item on' : 'side-item'} onClick={() => open(s.cfg.id)}>
              <span className={`dot lv-${s.level}`} aria-hidden />
              <span className="si-name">{s.cfg.name}<small>{s.diags[0]?.title}</small></span>
              <span className="si-score">{s.score}</span>
            </button>
          ))}
          <button className="side-item add" onClick={() => open(twin.add())}><Plus size={18} aria-hidden /><span className="si-name">Ajouter une pompe</span></button>
        </aside>
        <main>
          {section === 'installer'
            ? <InstallerPage onSendToTwin={(cfg) => twin.addConfig(cfg)} />
            : current
              ? <PumpView st={current} twin={twin} tab={tab} setTab={setTab} onBack={() => setSel(null)} onDeleted={() => setSel(null)} />
              : <FleetView states={twin.states} onOpen={open} twin={twin} />}
        </main>
      </div>

      {modal === 'settings' && (
        <Modal title="Réglages" onClose={() => setModal(null)}>
          <SettingsForm s={twin.settings} onChange={twin.setSettings} onReset={twin.reset} />
        </Modal>
      )}
      {modal === 'guide' && (
        <Modal title="Comment ça marche" onClose={() => setModal(null)}>
          <Guide />
        </Modal>
      )}
    </div>
  );
}
