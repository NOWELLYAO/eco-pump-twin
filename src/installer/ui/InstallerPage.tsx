import { useEffect, useMemo, useState } from 'react';
import { Activity, Eye, FileText, Network, PencilRuler, Printer, Send } from 'lucide-react';
import { evaluate } from '../evaluate';
import { pressureHead, staticHead } from '../hydraulics';
import { ensureElec } from '../electrical';
import { PRESETS } from '../presets';
import type { Installation, Issue } from '../types';
import type { PumpConfig } from '../../engine/types';
import { healthyControls } from '../../engine/defaults';
import { InstallerForm } from './InstallerForm';
import { RealView } from './RealView';
import { PidView } from './PidView';
import { Alerts, Bom, ElecCard, Goods, InstCurve, KeyFigures, LossTable, PartsAtRisk, Recommendations, ScoreCard } from './Report';

const KEY = 'ecopump-installer-v1';

function load(): Installation {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return ensureElec(JSON.parse(raw) as Installation);
  } catch { /* ignore */ }
  return PRESETS[2].build();
}

type View = 'real' | 'pid' | 'curve';
type MTab = 'form' | 'views' | 'report';

export function InstallerPage({ onSendToTwin }: { onSendToTwin: (cfg: PumpConfig) => void }) {
  const [inst, setInst] = useState<Installation>(load);
  const [view, setView] = useState<View>('real');
  const [mtab, setMtab] = useState<MTab>('form');
  const [sent, setSent] = useState(false);
  const ev = useMemo(() => evaluate(inst), [inst]);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(inst)); } catch { /* ignore */ } }, [inst]);
  useEffect(() => { setSent(false); }, [inst]);

  const set = (fn: (i: Installation) => Installation) => setInst((i) => ensureElec(fn(i)));
  const onFix = (x: Issue) => { if (x.fix) setInst((i) => ensureElec(x.fix!.apply(i))); };

  const toTwin = () => {
    const h = ev.hydro;
    onSendToTwin({
      id: `p${Date.now().toString(36)}`,
      name: inst.name, site: 'Depuis le configurateur', model: `${inst.pump.qn} m³/h × ${inst.pump.hn} m`,
      spec: { qn: inst.pump.qn, hn: inst.pump.hn, etaBep: inst.pump.eta, nn: inst.pump.nn, motorKw: inst.pump.motorKw, etaMotor: 0.88, npshrBep: inst.pump.npshr, shutoffRatio: inst.pump.shutoff },
      system: { hStatic: Math.max(0, Math.min(inst.pump.hn * 0.95, staticHead(inst) + pressureHead(inst))), npsha: Math.max(0.5, h.npsha) },
      controls: healthyControls(), source: 'sim',
    });
    setSent(true);
  };

  const nC = ev.issues.filter((x) => x.sev === 'critical').length;
  const lvl = ev.verdict.level === 'excellent' || ev.verdict.level === 'good' ? 'ok' : ev.verdict.level === 'fair' ? 'warning' : 'critical';

  return (
    <div className="inst">
      <div className="inst-head">
        <div>
          <h1>Configurateur d'installation</h1>
          <p className="muted">Décrivez l'installation : le schéma se dessine et l'expertise se met à jour à chaque saisie.</p>
        </div>
        <div className="row no-print">
          <button className="btn" onClick={() => window.print()}><Printer size={16} aria-hidden /> Imprimer le rapport</button>
          <button className="btn primary" onClick={toTwin} disabled={sent}><Send size={16} aria-hidden /> {sent ? 'Ajoutée au parc' : 'Suivre dans le jumeau'}</button>
        </div>
      </div>

      <div className="mtabs no-print" role="tablist">
        <button role="tab" aria-selected={mtab === 'form'} onClick={() => setMtab('form')}><PencilRuler size={16} aria-hidden /> Saisie</button>
        <button role="tab" aria-selected={mtab === 'views'} onClick={() => setMtab('views')}><Eye size={16} aria-hidden /> Schémas</button>
        <button role="tab" aria-selected={mtab === 'report'} onClick={() => setMtab('report')}>
          <FileText size={16} aria-hidden /> Rapport <span className={`mscore lv-${lvl}`}>{ev.score}</span>{nC > 0 && <span className="mcrit">{nC}</span>}
        </button>
      </div>

      <div className={`inst-grid show-${mtab}`}>
        <aside className="inst-form no-print">
          <InstallerForm inst={inst} set={set} needs={ev.needs} er={ev.elec} />
        </aside>
        <div className="inst-main">
          <div className="inst-top">
            <section className="card views m-views">
              <div className="vtabs" role="tablist">
                <button role="tab" aria-selected={view === 'real'} onClick={() => setView('real')}><Eye size={15} aria-hidden /> Vue réelle</button>
                <button role="tab" aria-selected={view === 'pid'} onClick={() => setView('pid')}><Network size={15} aria-hidden /> Schéma P&ID</button>
                <button role="tab" aria-selected={view === 'curve'} onClick={() => setView('curve')}><Activity size={15} aria-hidden /> Courbes</button>
              </div>
              <div className="vbody">
                {view === 'real' && <RealView i={inst} h={ev.hydro} />}
                {view === 'pid' && <PidView i={inst} h={ev.hydro} />}
                {view === 'curve' && <InstCurve i={inst} ev={ev} />}
              </div>
              <div className="print-only"><PidView i={inst} h={ev.hydro} /></div>
            </section>
            <div className="m-report m-views-score"><ScoreCard ev={ev} /></div>
          </div>
          <div className="m-report">
            <KeyFigures i={inst} ev={ev} />
            <div className="inst-cols">
              <div className="stack">
                <Alerts ev={ev} onFix={onFix} />
                <Recommendations ev={ev} />
              </div>
              <div className="stack">
                <ElecCard i={inst} ev={ev} />
                <PartsAtRisk ev={ev} />
                <Goods ev={ev} />
                <LossTable ev={ev} />
              </div>
            </div>
            <Bom i={inst} ev={ev} onFix={onFix} />
          </div>
        </div>
      </div>
    </div>
  );
}
