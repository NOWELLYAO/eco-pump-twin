import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ClipboardList, Gauge, Minus, Plus, Trash2 } from 'lucide-react';
import { FIELD_TESTS, TEST_CAT, type FieldTest, type TCtx, type TestCat, type TestResult } from '../fieldtests';
import { clock } from '../sim';

export interface TestLog { key: number; t: number; test: FieldTest; res: TestResult }
export interface TestsApi { tc: TCtx; log: TestLog[]; run: (id: string) => void; clear: () => void }

const LVL_TXT = { ok: 'normal', warn: 'à surveiller', bad: 'anormal' } as const;

/** Bouton +/- pour déplier ou replier. */
function Fold({ open, onClick, what }: { open: boolean; onClick: () => void; what: string }) {
  return (
    <button type="button" className="fold" onClick={onClick} aria-expanded={open} aria-label={`${open ? 'Replier' : 'Déplier'} ${what}`} title={open ? 'Replier' : 'Déplier'}>
      {open ? <Minus size={14} aria-hidden /> : <Plus size={14} aria-hidden />}
    </button>
  );
}

/** Bilan d'un test en quelques mots (visible même replié). */
function verdict(r: TestLog) {
  const n = (l: 'bad' | 'warn') => r.res.lines.filter((x) => x.lvl === l).length;
  const b = n('bad'), w = n('warn');
  return b ? { cls: 'bad', txt: `${b} anormal${b > 1 ? 's' : ''}` } : w ? { cls: 'warn', txt: `${w} à surveiller` } : r.res.lines.some((x) => x.lvl) ? { cls: 'ok', txt: 'normal' } : { cls: '', txt: 'relevé' };
}

/** Résultat d'un test : valeur mesurée, valeur attendue, et un repère de couleur (avec un mot, pas seulement la couleur). */
export function TestCard({ r, compact, id, open: open0 = true }: { r: TestLog; compact?: boolean; id?: string; open?: boolean }) {
  const [open, setOpen] = useState(open0);
  useEffect(() => { setOpen(open0); }, [open0]); // un nouveau test arrive : l'ancien se replie
  const v = verdict(r);
  return (
    <div className={`tcard${compact ? ' compact' : ''}${open ? '' : ' closed'}`} id={id}>
      <div className="tc-h">
        <div className="tc-t">{compact ? <b>Résultat</b> : <b>{r.test.label}</b>}<small>{compact ? '' : `${r.test.tool} · `}{clock(r.t)}{v.txt ? <> · <span className={`tc-sum ${v.cls}`}>{v.txt}</span></> : null}</small></div>
        <Fold open={open} onClick={() => setOpen(!open)} what="le résultat" />
      </div>
      {open && (
        <>
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
        </>
      )}
    </div>
  );
}

/** Boîte à outils du technicien : tous les tests possibles sur cette installation, et le carnet des mesures faites. */
export function FieldKit({ tests }: { tests: TestsApi }) {
  const avail = FIELD_TESTS.filter((t) => t.applies(tests.tc));
  const cats = (Object.keys(TEST_CAT) as TestCat[]).filter((c) => avail.some((t) => t.cat === c));
  // Le résultat d'un test lancé depuis la boîte à outils s'affiche dans le carnet, plus bas : on l'amène à l'écran
  const [want, setWant] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(true);
  const top = useRef<number | null>(null);
  useEffect(() => {
    const r = tests.log[0];
    if (!r || !want || r.test.id !== want || top.current === r.key) return;
    top.current = r.key; setWant(null); setLogOpen(true);
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
          <div className="tlog-h">
            <h5><ClipboardList size={15} aria-hidden /> Carnet de mesures <small className="muted">({tests.log.length})</small></h5>
            <span className="row">
              <button type="button" className="btn sm" onClick={tests.clear}><Trash2 size={13} aria-hidden /> Effacer</button>
              <Fold open={logOpen} onClick={() => setLogOpen(!logOpen)} what="le carnet de mesures" />
            </span>
          </div>
          {/* Le plus récent déplié, les précédents repliés (un clic sur + pour les revoir) */}
          {logOpen && tests.log.map((r, k) => <TestCard key={r.key} r={r} id={`tc-${r.key}`} open={k === 0} />)}
        </div>
      )}
    </div>
  );
}
