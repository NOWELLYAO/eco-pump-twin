import type { ReactNode } from 'react';
import { FAULTS, FAULT_CAT, SYM_LABEL } from '../installer/faults';
import type { Evaluation } from '../installer/evaluate';
import { simKind } from '../installer/sim';
import type { Installation } from '../installer/types';
import { CommissionResults } from '../installer/ui/CommissionPage';
import { CabinetView, WiringView } from '../installer/ui/Electrical';
import { PidView } from '../installer/ui/PidView';
import { RealView } from '../installer/ui/RealView';
import { QuoteTable } from '../installer/ui/Quote';
import { Alerts, Bom, ElecCard, Goods, InstCurve, KeyFigures, LossTable, MountOrder, PartsAtRisk, Recommendations, ScoreCard } from '../installer/ui/Report';

function Part({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return <section className="rp-part"><h2 className="rp-h"><span>{n}</span>{title}</h2>{children}</section>;
}

/** Guide de dépannage : les pannes possibles sur cette installation, leurs symptômes, la vérification et la réparation. */
function FaultGuide({ i }: { i: Installation }) {
  const k = simKind(i);
  const list = FAULTS.filter((f) => f.applies(i, k));
  return (
    <table className="tbl rp-faults">
      <thead><tr><th>Panne</th><th>Symptômes</th><th>Comment vérifier</th><th>Réparation</th></tr></thead>
      <tbody>
        {list.map((f) => (
          <tr key={f.id}>
            <td><b>{f.label}</b><br /><small className="muted">{FAULT_CAT[f.cat]}</small></td>
            <td>{f.sig.map((s) => SYM_LABEL[s]).join(' · ')}</td>
            <td>{f.checks.slice(0, 2).join(' ; ')}</td>
            <td>{f.fix.slice(0, 2).join(' ; ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Rapport complet, monté seulement au moment de l'export (PDF ou impression). */
export function PrintReport({ inst, ev, extra }: { inst: Installation; ev: Evaluation; extra?: ReactNode }) {
  const date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  let n = 0;
  return (
    <div className="print-report main" aria-hidden>
      <h1>Rapport d'installation — {inst.name}</h1>
      <p className="muted small">Établi le {date} avec le configurateur ECO PUMP AFRIK.</p>
      <Part n={++n} title="Synthèse"><ScoreCard ev={ev} /><KeyFigures i={inst} ev={ev} /></Part>
      <Part n={++n} title="Vue d'ensemble de l'installation"><section className="card rp-fig"><RealView i={inst} h={ev.hydro} /></section></Part>
      <Part n={++n} title="Schéma P&ID"><section className="card rp-fig"><PidView i={inst} h={ev.hydro} /></section></Part>
      <Part n={++n} title="Courbes : pompe et installation"><section className="card"><InstCurve i={inst} ev={ev} /></section></Part>
      <Part n={++n} title="Alertes et diagnostic"><Alerts ev={ev} onFix={() => undefined} printAll /><Recommendations ev={ev} /><PartsAtRisk ev={ev} /><Goods ev={ev} /></Part>
      <Part n={++n} title="Électricité"><ElecCard i={inst} ev={ev} /></Part>
      <Part n={++n} title="Coffret électrique"><section className="card rp-fig"><CabinetView i={inst} ev={ev} print /></section></Part>
      <Part n={++n} title="Schéma électrique"><section className="card rp-fig"><WiringView i={inst} ev={ev} /></section></Part>
      <Part n={++n} title="Pertes de charge et montage"><LossTable ev={ev} /><MountOrder i={inst} ev={ev} onFix={() => undefined} /></Part>
      <Part n={++n} title="Liste du matériel"><Bom i={inst} ev={ev} onFix={() => undefined} />{extra}</Part>
      <Part n={++n} title="Liste détaillée pour demande de devis"><section className="card"><QuoteTable i={inst} ev={ev} /></section></Part>
      <Part n={++n} title="Guide de dépannage"><section className="card"><p className="small muted">Pannes possibles sur ce type d'installation, à garder avec le coffret.</p><FaultGuide i={inst} /></section></Part>
      {inst.commissioning && <Part n={++n} title="Mise en service"><CommissionResults i={inst} ev={ev} /></Part>}
    </div>
  );
}
