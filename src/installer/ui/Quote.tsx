import { useEffect, useRef, useState } from 'react';
import { FileDown, FileSpreadsheet, MessageCircle, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { Evaluation } from '../evaluate';
import { QCAT, finalItems, quoteCsv, quoteText, type QCat, type QuoteMeta } from '../quote';
import type { Installation } from '../types';
import { buildReportPdf, shareOrDownload } from '../../ui/pdf';

const safe = (s: string) => s.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'projet';

function Qty({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [t, setT] = useState(String(value).replace('.', ','));
  useEffect(() => { if (document.activeElement !== ref.current) setT(String(value).replace('.', ',')); }, [value]);
  return <input ref={ref} className="qqty" inputMode="decimal" value={t} aria-label="Quantité"
    onChange={(e) => { setT(e.target.value); const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v >= 0) onChange(v); }}
    onBlur={() => setT(String(value).replace('.', ','))} />;
}

/** Tableau imprimable de la demande de devis (aussi utilisé dans le rapport). */
export function QuoteTable({ i, ev, print }: { i: Installation; ev: Evaluation; print?: boolean }) {
  const rows = finalItems(i, ev).filter((x) => !x.off);
  let cat: QCat | '' = '';
  let n = 0;
  return (
    <table className="tbl qtable">
      <thead><tr><th>N°</th><th>Désignation</th><th>Caractéristiques</th><th>Qté</th>{print && <th>Prix unit.</th>}{print && <th>Total</th>}</tr></thead>
      <tbody>
        {rows.flatMap((x) => {
          const out = [];
          if (x.cat !== cat) { cat = x.cat; out.push(<tr key={`c-${x.cat}`} className="qcat"><td colSpan={print ? 6 : 4}>{QCAT[x.cat]}</td></tr>); }
          out.push(<tr key={x.id}><td className="num">{++n}</td><td>{x.desig}{x.note && <small className="muted"> · {x.note}</small>}</td><td className="small">{x.spec}</td><td className="num nowrap">{String(x.qty).replace('.', ',')} {x.unit}</td>{print && <td />}{print && <td />}</tr>);
          return out;
        })}
      </tbody>
    </table>
  );
}

export function QuoteRequest({ i, ev, set }: { i: Installation; ev: Evaluation; set: (fn: (x: Installation) => Installation) => void }) {
  const q: QuoteMeta = i.quote ?? {};
  const meta = (p: Partial<QuoteMeta>) => set((x) => ({ ...x, quote: { ...(x.quote ?? {}), ...p } }));
  const over = (id: string, p: { qty?: number; off?: boolean }) => set((x) => {
    const o = { ...(x.quote?.over ?? {}) };
    o[id] = { ...(o[id] ?? {}), ...p };
    return { ...x, quote: { ...(x.quote ?? {}), over: o } };
  });
  const items = finalItems(i, ev);
  const [busy, setBusy] = useState<string | null>(null);
  const [nd, setNd] = useState({ desig: '', spec: '', qty: 1, unit: 'u' });
  const nOn = items.filter((x) => !x.off).length;
  const nOff = items.length - nOn;

  const pdf = async () => {
    setBusy('Création du PDF…');
    document.body.classList.add('pdf-export');
    try {
      await new Promise((r) => window.setTimeout(r, 300));
      const el = document.querySelector<HTMLElement>('.print-quote');
      if (!el) throw new Error('document introuvable');
      const blob = await buildReportPdf(el, `Demande de devis — ${i.name}`);
      document.body.classList.remove('pdf-export');
      const r = await shareOrDownload(blob, `Demande-de-devis-${safe(i.name)}.pdf`, `Demande de devis — ${i.name}`);
      setBusy(r === 'downloaded' ? 'PDF téléchargé.' : r === 'shared' ? 'PDF partagé.' : null);
    } catch (e) { document.body.classList.remove('pdf-export'); setBusy(`Échec du PDF (${(e as Error).message}).`); }
    window.setTimeout(() => setBusy(null), 3000);
  };
  const csv = async () => {
    const r = await shareOrDownload(quoteCsv(i, ev), `Demande-de-devis-${safe(i.name)}.csv`, `Demande de devis — ${i.name}`);
    setBusy(r === 'downloaded' ? 'Fichier Excel (CSV) téléchargé.' : r === 'shared' ? 'Fichier partagé.' : null);
    window.setTimeout(() => setBusy(null), 3000);
  };
  const whatsapp = () => {
    const t = quoteText(i, ev);
    if (navigator.share) { navigator.share({ title: `Demande de devis — ${i.name}`, text: t }).catch(() => undefined); return; }
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank');
  };

  let cat: QCat | '' = '';
  return (
    <section className="card quote">
      <h3><FileSpreadsheet size={17} aria-hidden /> Demande de devis</h3>
      <p className="small muted">Tous les éléments de l'installation, avec leurs caractéristiques, calculés à partir de la conception. Ajustez les quantités, décochez ce que vous avez déjà, ajoutez des lignes, puis envoyez la liste à vos fournisseurs.</p>
      <div className="igrid">
        <label className="ifld"><span>Client / société</span><input value={q.client ?? ''} onChange={(e) => meta({ client: e.target.value })} /></label>
        <label className="ifld"><span>Lieu du chantier</span><input value={q.site ?? ''} onChange={(e) => meta({ site: e.target.value })} /></label>
        <label className="ifld"><span>Contact (tél. / e-mail)</span><input value={q.contact ?? ''} onChange={(e) => meta({ contact: e.target.value })} /></label>
        <label className="ifld"><span>Réponse souhaitée pour le</span><input type="date" value={q.date ?? ''} onChange={(e) => meta({ date: e.target.value })} /></label>
        <label className="ifld wide"><span>Remarques pour le fournisseur</span><input value={q.note ?? ''} onChange={(e) => meta({ note: e.target.value })} placeholder="Ex. : délai, marque souhaitée, livraison sur site…" /></label>
      </div>
      <div className="quote-actions">
        <button type="button" className="btn primary" onClick={() => void pdf()} disabled={!!busy?.startsWith('Création')}><FileDown size={16} aria-hidden /> {busy?.startsWith('Création') ? busy : 'PDF de la demande'}</button>
        <button type="button" className="btn" onClick={() => void csv()}><FileSpreadsheet size={16} aria-hidden /> Excel (CSV)</button>
        <button type="button" className="btn" onClick={whatsapp}><MessageCircle size={16} aria-hidden /> WhatsApp / texte</button>
      </div>
      {busy && !busy.startsWith('Création') && <p className="note ok">{busy}</p>}
      <p className="small"><b>{nOn} lignes</b>{nOff ? ` · ${nOff} retirée(s)` : ''}</p>
      <div className="qlist">
        {items.map((x) => {
          const head = x.cat !== cat ? (cat = x.cat, <h4 key={`h-${x.cat}`} className="qh">{QCAT[x.cat]}</h4>) : null;
          const isExtra = x.id.startsWith('extra_');
          return (
            <div key={x.id}>
              {head}
              <div className={`qrow ${x.off ? 'off' : ''}`}>
                <input type="checkbox" checked={!x.off} aria-label={`Inclure ${x.desig}`} onChange={(e) => (isExtra ? undefined : over(x.id, { off: !e.target.checked }))} disabled={isExtra} />
                <div className="qtxt"><b>{x.desig}</b>{x.spec && <small>{x.spec}</small>}{x.note && <small className="muted">{x.note}</small>}</div>
                <div className="qq">
                  {isExtra ? <span>{x.qty}</span> : <Qty value={x.qty} onChange={(v) => over(x.id, { qty: v })} />}
                  <small>{x.unit}</small>
                  {x.edited && !isExtra && <button type="button" className="icon-btn sm" title="Quantité calculée" aria-label="Revenir à la quantité calculée" onClick={() => over(x.id, { qty: undefined })}><RotateCcw size={13} /></button>}
                  {isExtra && <button type="button" className="icon-btn sm" aria-label="Supprimer la ligne" onClick={() => set((y) => ({ ...y, quote: { ...(y.quote ?? {}), extra: (y.quote?.extra ?? []).filter((_, k) => `extra_${k}` !== x.id) } }))}><Trash2 size={13} /></button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <h4 className="qh">Ajouter une ligne</h4>
      <div className="qadd">
        <input placeholder="Désignation" value={nd.desig} onChange={(e) => setNd({ ...nd, desig: e.target.value })} />
        <input placeholder="Caractéristiques" value={nd.spec} onChange={(e) => setNd({ ...nd, spec: e.target.value })} />
        <input inputMode="decimal" aria-label="Quantité" value={nd.qty} onChange={(e) => setNd({ ...nd, qty: Number(e.target.value.replace(',', '.')) || 0 })} />
        <input aria-label="Unité" value={nd.unit} onChange={(e) => setNd({ ...nd, unit: e.target.value })} />
        <button type="button" className="btn" disabled={!nd.desig.trim()} onClick={() => { set((y) => ({ ...y, quote: { ...(y.quote ?? {}), extra: [...(y.quote?.extra ?? []), { ...nd, desig: nd.desig.trim() }] } })); setNd({ desig: '', spec: '', qty: 1, unit: 'u' }); }}><Plus size={15} aria-hidden /> Ajouter</button>
      </div>
      {/* Document imprimable (hors écran, pour le PDF) */}
      <div className="print-quote print-report" aria-hidden>
        <h1>Demande de devis — {i.name}</h1>
        <table className="tbl kv">
          <tbody>
            {q.client && <tr><th>Client</th><td>{q.client}</td></tr>}
            {q.site && <tr><th>Lieu du chantier</th><td>{q.site}</td></tr>}
            {q.contact && <tr><th>Contact</th><td>{q.contact}</td></tr>}
            {q.date && <tr><th>Réponse souhaitée pour le</th><td>{new Date(q.date).toLocaleDateString('fr-FR')}</td></tr>}
            <tr><th>Installation</th><td>{i.name} · {ev.hydro.q.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m³/h à {ev.hydro.h.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} m</td></tr>
            {q.note && <tr><th>Remarques</th><td>{q.note}</td></tr>}
          </tbody>
        </table>
        <QuoteTable i={i} ev={ev} print />
        <p className="small muted">Merci d'indiquer pour chaque ligne la marque, la référence, le prix unitaire, le délai de livraison et la garantie. Les caractéristiques sont des minimums : toute équivalence doit être signalée.</p>
      </div>
    </section>
  );
}
