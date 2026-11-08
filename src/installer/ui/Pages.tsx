import { AlertOctagon } from 'lucide-react';
import type { Evaluation } from '../evaluate';
import { QuoteRequest } from './Quote';
import { defaultsLeft } from '../defaults';
import type { Installation, Issue } from '../types';
import { LevelIcon } from '../../ui/Status';
import { DiagramPanel } from './DiagramPanel';
import { InstallerForm } from './InstallerForm';
import { Alerts, Bom, ElecCard, Goods, InstCurve, KeyFigures, LossTable, MountOrder, PartsAtRisk, Recommendations, ScoreCard } from './Report';

export interface Shared {
  inst: Installation;
  set: (fn: (i: Installation) => Installation) => void;
  ev: Evaluation;
  highlight: string[];
  selected: string | null;
  activeIssue: Issue | null;
  pick: (t: string | null) => void;
  selectIssue: (x: Issue) => void;
  fix: (x: Issue) => void;
  clearIssue: () => void;
}

function Diagram({ s, live }: { s: Shared; live?: Parameters<typeof DiagramPanel>[0]['live'] }) {
  return (
    <DiagramPanel i={s.inst} ev={s.ev} highlight={s.highlight} selected={s.selected} onPick={s.pick} onIssue={s.selectIssue} onSet={s.set}
      live={live} banner={s.activeIssue} onCloseBanner={s.clearIssue} />
  );
}

/* ============================ Conception ============================ */
export function DesignPage({ s, goDiag }: { s: Shared; goDiag: (x?: Issue) => void }) {
  const crit = s.ev.issues.filter((x) => x.sev !== 'info');
  return (
    <div className="page-design">
      <aside className="inst-form">
        <InstallerForm inst={s.inst} set={s.set} needs={s.ev.needs} er={s.ev.elec} />
      </aside>
      <div className="design-main">
        <MiniScore ev={s.ev} onClick={() => goDiag()} />
        {defaultsLeft(s.inst).length > 0 && (
          <div className="dflt-banner" role="note">
            <b>{defaultsLeft(s.inst).length} valeur{defaultsLeft(s.inst).length > 1 ? 's' : ''} par défaut à vérifier</b>
            <span>{defaultsLeft(s.inst).map((x) => x.label).join(' · ')}</span>
            <small>Elles sont marquées « par défaut · à vérifier » dans le formulaire. Remplacez-les par les mesures du site.</small>
          </div>
        )}
        <Diagram s={s} />
        <KeyFigures i={s.inst} ev={s.ev} />
        <section className="card">
          <h3><AlertOctagon size={16} aria-hidden /> Alertes principales <small>cliquez pour les voir sur le schéma</small></h3>
          {crit.length === 0 ? <p className="muted">Aucune alerte : l'installation respecte les règles de l'art.</p> : (
            <ul className="quick">
              {crit.slice(0, 6).map((x) => (
                <li key={x.id}>
                  <button className={`relbtn lv-${x.sev}${s.activeIssue?.id === x.id ? ' on' : ''}`} onClick={() => s.selectIssue(x)}>
                    <LevelIcon level={x.sev === 'critical' ? 'critical' : 'warning'} size={15} /> {x.title}
                  </button>
                </li>
              ))}
              {crit.length > 6 && <li><button className="link" onClick={() => goDiag()}>Voir les {crit.length} alertes →</button></li>}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function MiniScore({ ev, onClick }: { ev: Evaluation; onClick: () => void }) {
  const lvl = ev.verdict.level === 'excellent' || ev.verdict.level === 'good' ? 'ok' : ev.verdict.level === 'fair' ? 'warning' : 'critical';
  const nC = ev.issues.filter((x) => x.sev === 'critical').length;
  const nW = ev.issues.filter((x) => x.sev === 'warning').length;
  return (
    <button className={`miniscore lv-${lvl}`} onClick={onClick}>
      <span className="ms-num">{ev.score}<small>/100</small></span>
      <span className="ms-txt"><b>{ev.verdict.label}</b><small>{nC} critique{nC > 1 ? 's' : ''} · {nW} alerte{nW > 1 ? 's' : ''} — voir le diagnostic →</small></span>
    </button>
  );
}

/* ============================ Diagnostic ============================ */
export function DiagPage({ s }: { s: Shared }) {
  return (
    <div className="page-diag">
      <div className="diag-list">
        <ScoreCard ev={s.ev} />
        <Alerts ev={s.ev} onFix={s.fix} onSelect={s.selectIssue} activeId={s.activeIssue?.id} />
        <Recommendations ev={s.ev} />
        <PartsAtRisk ev={s.ev} />
        <Goods ev={s.ev} />
      </div>
      <div className="diag-side">
        <Diagram s={s} />
      </div>
    </div>
  );
}

/* ============================ Matériel & rapport ============================ */
export function MaterialPage({ s }: { s: Shared }) {
  return (
    <div className="page-mat">
      <KeyFigures i={s.inst} ev={s.ev} />
      <div className="mat-cols">
        <div className="stack"><QuoteRequest i={s.inst} ev={s.ev} set={s.set} /><MountOrder i={s.inst} ev={s.ev} onFix={s.fix} /><Bom i={s.inst} ev={s.ev} onFix={s.fix} /><LossTable ev={s.ev} /></div>
        <div className="stack"><ElecCard i={s.inst} ev={s.ev} /><section className="card"><InstCurve i={s.inst} ev={s.ev} /></section></div>
      </div>
    </div>
  );
}
