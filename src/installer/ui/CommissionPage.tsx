import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Eraser, Printer, Search, Wrench } from 'lucide-react';
import { analyzeCommissioning, type CDiag, type Commissioning, type CSev } from '../commissioning';
import type { Evaluation } from '../evaluate';
import type { Installation } from '../types';
import { LevelIcon } from '../../ui/Status';
import { fmt } from '../../ui/util';

const show = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) ? String(v).replace('.', ',') : '');

function OptNum({ label, unit, value, onChange, hint, ph }: { label: string; unit?: string; value: number | undefined; onChange: (v: number | undefined) => void; hint?: string; ph?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [txt, setTxt] = useState(show(value));
  useEffect(() => { if (document.activeElement !== ref.current) setTxt(show(value)); }, [value]);
  return (
    <label className="ifld">
      <span>{label}</span>
      <div className="ifld-in">
        <input ref={ref} inputMode="decimal" value={txt} placeholder={ph} onChange={(e) => {
          setTxt(e.target.value);
          const t = e.target.value.trim().replace(',', '.');
          if (t === '') onChange(undefined);
          else { const v = Number(t); if (Number.isFinite(v)) onChange(v); }
        }} />
        {unit && <em>{unit}</em>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

const LV = (s: CSev) => (s === 'critical' ? 'critical' : s === 'warning' ? 'warning' : s === 'info' ? 'info' : 'ok');

function DiagCard({ d, open, onToggle }: { d: CDiag; open: boolean; onToggle: () => void }) {
  return (
    <li className={`issue lv-${LV(d.sev)}`}>
      <button className="issue-head" onClick={onToggle} aria-expanded={open}>
        <LevelIcon level={LV(d.sev)} size={18} /><strong>{d.title}</strong>
        <span className={`badge lv-${LV(d.sev)}`}>{d.sev === 'critical' ? 'Critique' : d.sev === 'warning' ? 'Attention' : 'Info'}</span>
      </button>
      {open && (
        <div className="issue-body">
          <p>{d.detail}</p>
          <h5>Causes probables</h5><ul>{d.causes.map((c) => <li key={c}>{c}</li>)}</ul>
          <h5>Vérifications à faire sur place</h5><ul className="sol">{d.checks.map((c) => <li key={c}><Search size={13} aria-hidden /> {c}</li>)}</ul>
        </div>
      )}
    </li>
  );
}

export function CommissionResults({ i, ev }: { i: Installation; ev: Evaluation }) {
  const c = i.commissioning ?? {};
  const r = analyzeCommissioning(i, ev, c);
  const [openK, setOpenK] = useState<number | null>(0);
  if (!r.verdict) return null;
  return (
    <>
      <section className={`card cverdict lv-${LV(r.verdict.sev)}`}>
        <LevelIcon level={LV(r.verdict.sev)} size={28} />
        <div><small>Mise en service{c.date ? ` du ${new Date(c.date).toLocaleDateString('fr-FR')}` : ''}{c.tech ? ` · ${c.tech}` : ''}</small><h2>{r.verdict.label}</h2><p>{r.verdict.text}</p></div>
      </section>
      <section className="card">
        <h3>Mesuré / attendu</h3>
        <div className="tbl-wrap">
          <table className="tbl ctbl">
            <thead><tr><th>Grandeur</th><th>Mesuré</th><th>Calcul</th><th>Écart</th></tr></thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.label} className={`lv-${LV(x.sev)}`}>
                  <th>{x.label}</th><td><b>{x.meas}</b></td><td className="muted">{x.exp}</td>
                  <td><span className={`badge lv-${LV(x.sev)}`}><LevelIcon level={LV(x.sev)} size={12} /> {x.dev}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h3><Wrench size={16} aria-hidden /> Diagnostic de mise en service</h3>
        {r.diags.length === 0 ? <p className="ok-line muted"><CheckCircle2 size={16} aria-hidden /> Aucun écart : les mesures correspondent au calcul.</p> : (
          <ul className="issues">{r.diags.map((d, k) => <DiagCard key={d.title} d={d} open={openK === k} onToggle={() => setOpenK(openK === k ? null : k)} />)}</ul>
        )}
        {c.notes && <p className="cnotes"><b>Observations :</b> {c.notes}</p>}
      </section>
    </>
  );
}

export function CommissionPage({ i, ev, set }: { i: Installation; ev: Evaluation; set: (fn: (x: Installation) => Installation) => void }) {
  const c: Commissioning = i.commissioning ?? {};
  const up = (d: Partial<Commissioning>) => set((x) => ({ ...x, commissioning: { ...(x.commissioning ?? {}), ...d } }));
  const tri = i.elec.supply !== 'mono';
  const forage = i.pumpType === 'immergee_forage';
  const r = analyzeCommissioning(i, ev, c);
  const exp = r.exp;
  return (
    <div className="page-com">
      <aside className="com-form">
        <section className="card">
          <h3><ClipboardCheck size={16} aria-hidden /> Mesures relevées sur place</h3>
          <p className="muted small">Pompe en marche, régime stable. Laissez vide ce que vous n'avez pas mesuré : l'analyse s'adapte. Les valeurs attendues sont rappelées sous chaque champ.</p>
          <div className="igrid">
            <label className="ifld"><span>Date</span><input type="date" value={c.date ?? ''} onChange={(e) => up({ date: e.target.value })} /></label>
            <label className="ifld"><span>Technicien</span><input value={c.tech ?? ''} onChange={(e) => up({ tech: e.target.value })} /></label>
            <OptNum label="Débit (débitmètre / compteur)" unit="m³/h" value={c.q} onChange={(v) => up({ q: v })} hint={`attendu ${fmt(exp.q, 1)} m³/h`} />
            <OptNum label={forage ? 'Pression en tête de forage' : 'Pression au refoulement'} unit="bar" value={c.pRef} onChange={(v) => up({ pRef: v })} hint={`attendu ${fmt(exp.pRef, 2)} bar · vanne fermée ≈ ${fmt(r.closedBar, 1)} bar`} />
            {i.mode !== 'immergee' && <OptNum label="Pression à l'aspiration" unit="bar" value={c.pAsp} onChange={(v) => up({ pAsp: v })} hint={`attendu ${fmt(exp.pAsp, 2)} bar (négatif = dépression)`} />}
            {forage && <OptNum label="Niveau dynamique mesuré" unit="m" value={c.level} onChange={(v) => up({ level: v })} hint={`prévu ${fmt(i.geo.dynamicLevel, 1)} m`} />}
            <OptNum label={tri ? 'Courant phase 1' : 'Courant moteur'} unit="A" value={c.i1} onChange={(v) => up({ i1: v })} hint={`attendu ≈ ${fmt(exp.amps, 1)} A · In ${fmt(ev.elec.inom, 1)} A`} />
            {tri && <OptNum label="Courant phase 2" unit="A" value={c.i2} onChange={(v) => up({ i2: v })} />}
            {tri && <OptNum label="Courant phase 3" unit="A" value={c.i3} onChange={(v) => up({ i3: v })} />}
            <OptNum label="Tension (pompe en marche)" unit="V" value={c.u} onChange={(v) => up({ u: v })} hint={`nominale ${i.elec.voltage} V`} />
            {tri && (
              <label className="ifld"><span>Sens de rotation</span>
                <select value={c.rotation ?? 'inconnu'} onChange={(e) => up({ rotation: e.target.value as Commissioning['rotation'] })}>
                  <option value="inconnu">Non vérifié</option><option value="ok">Vérifié, correct</option><option value="non">Incorrect</option>
                </select>
              </label>
            )}
            <label className="ifld"><span>Bruit / vibrations</span>
              <select value={c.noise ?? 'normal'} onChange={(e) => up({ noise: e.target.value as Commissioning['noise'] })}>
                <option value="normal">Normal</option><option value="bruit">Léger</option><option value="fort">Anormal / fort</option>
              </select>
            </label>
            <label className="ifld wide"><span>Observations</span><textarea rows={3} value={c.notes ?? ''} onChange={(e) => up({ notes: e.target.value })} /></label>
          </div>
          <div className="row mt-xs">
            <button className="btn sm" onClick={() => set((x) => ({ ...x, commissioning: { date: new Date().toISOString().slice(0, 10) } }))}><Eraser size={14} aria-hidden /> Nouvelle série de mesures</button>
            <button className="btn sm" onClick={() => window.print()}><Printer size={14} aria-hidden /> Imprimer le PV</button>
          </div>
        </section>
      </aside>
      <div className="com-main">
        {r.verdict ? <CommissionResults i={i} ev={ev} /> : (
          <section className="card empty">
            <ClipboardCheck size={34} aria-hidden />
            <h3>Saisissez vos premières mesures</h3>
            <p className="muted">Dès qu'une valeur est entrée (pression, débit, courant…), l'application la compare au calcul et indique les causes probables d'écart : sens de rotation, vanne fermée, colmatage, entrée d'air, usure, déséquilibre électrique…</p>
          </section>
        )}
      </div>
    </div>
  );
}
