import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardList, Gauge, Trash2 } from 'lucide-react';
import { FIELD_TESTS, TEST_CAT, type FieldTest, type TCtx, type TestCat, type TestResult } from '../fieldtests';
import { clock } from '../sim';

export interface TestLog { key: number; t: number; test: FieldTest; res: TestResult }
export interface TestsApi { tc: TCtx; log: TestLog[]; run: (id: string) => void; clear: () => void }

const LVL_TXT = { ok: 'normal', warn: 'à surveiller', bad: 'anormal' } as const;

/** Résultat d'un test : valeur mesurée, valeur attendue, et un repère de couleur (avec un mot, pas seulement la couleur). */
export function TestCard({ r, compact, id }: { r: TestLog; compact?: boolean; id?: string }) {
  return (
    <div className={`tcard${compact ? ' compact' : ''}`} id={id}>
      {!compact && <div className="tc-h"><b>{r.test.label}</b><small>{r.test.tool} · {clock(r.t)}</small></div>}
      {r.res.how && <p className="tc-how">{r.res.how}</p>}
      <dl className="tc-lines">
        {r.res.lines.map((l, k) => (
          <div key={k} className={`tc-l ${l.lvl ?? ''}`}>
            <dt>{l.k}</dt>
            <dd><span className="tc-v">{l.v}</span>{l.lvl && <span className="tc-tag">{LVL_TXT[l.lvl]}</span>}{l.ref && <small className="tc-ref">attendu : {l.ref}</small>}</dd>
          </div>
        ))}
      </dl>
      {r.res.note && <p className="tc-note">{r.res.note}</p>}
    </div>
  );
}

/** Boîte à outils du technicien : tous les tests possibles sur cette installation, et le carnet des mesures faites. */
export function FieldKit({ tests }: { tests: TestsApi }) {
  const avail = FIELD_TESTS.filter((t) => t.applies(tests.tc));
  const cats = (Object.keys(TEST_CAT) as TestCat[]).filter((c) => avail.some((t) => t.cat === c));
  // Le résultat d'un test lancé depuis la boîte à outils s'affiche dans le carnet, plus bas : on l'amène à l'écran
  const [want, setWant] = useState<string | null>(null);
  const top = useRef<number | null>(null);
  useEffect(() => {
    const r = tests.log[0];
    if (!r || !want || r.test.id !== want || top.current === r.key) return;
    top.current = r.key; setWant(null);
    document.getElementById(`tc-${r.key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tests.log, want]);
  return (
    <div className="fkit">
      <h4 className="fh"><Gauge size={16} aria-hidden /> Tests sur le terrain</h4>
      <p className="muted small">Mesures et contrôles d'un technicien, faits sur l'installation simulée telle qu'elle est maintenant. Chaque résultat est comparé à la valeur normale : à vous de conclure.</p>
      <div className="fgroups">
        {cats.map((c) => {
          const ts = avail.filter((t) => t.cat === c);
          return (
            <details key={c} className="fgroup">
              <summary><span>{TEST_CAT[c]}</span><small>{ts.length} test{ts.length > 1 ? 's' : ''}</small><ChevronDown size={16} aria-hidden className="chev" /></summary>
              <div className="tlist">
                {ts.map((t) => (
                  <button key={t.id} type="button" className="tbtn" onClick={() => { setWant(t.id); tests.run(t.id); }}>
                    <b>{t.label}</b><small>{t.tool}</small>
                  </button>
                ))}
              </div>
            </details>
          );
        })}
      </div>
      {tests.log.length > 0 && (
        <div className="tlog">
          <div className="tlog-h"><h5><ClipboardList size={15} aria-hidden /> Carnet de mesures</h5><button type="button" className="btn sm" onClick={tests.clear}><Trash2 size={13} aria-hidden /> Effacer</button></div>
          {tests.log.map((r) => <TestCard key={r.key} r={r} id={`tc-${r.key}`} />)}
        </div>
      )}
    </div>
  );
}
