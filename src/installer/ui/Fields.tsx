import { useEffect, useRef, useState, type ReactNode } from 'react';

const show = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 1000) / 1000).replace('.', ',') : '');

export function NumField({ label, value, onChange, unit, min = 0, hint, wide }: {
  label: string; value: number; onChange: (v: number) => void; unit?: string; min?: number; hint?: string; wide?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [txt, setTxt] = useState(show(value));
  useEffect(() => { if (document.activeElement !== ref.current) setTxt(show(value)); }, [value]);
  return (
    <label className={wide ? 'ifld wide' : 'ifld'}>
      <span>{label}</span>
      <div className="ifld-in">
        <input
          ref={ref} inputMode="decimal" value={txt}
          onChange={(e) => {
            setTxt(e.target.value);
            const v = Number(e.target.value.replace(',', '.').replace(/\s/g, ''));
            if (e.target.value.trim() !== '' && Number.isFinite(v) && v >= min) onChange(v);
          }}
          onBlur={() => setTxt(show(value))}
        />
        {unit && <em>{unit}</em>}
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function SelField<T extends string | number>({ label, value, options, onChange, wide }: {
  label: string; value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; wide?: boolean;
}) {
  return (
    <label className={wide ? 'ifld wide' : 'ifld'}>
      <span>{label}</span>
      <select value={String(value)} onChange={(e) => {
        const o = options.find((x) => String(x.v) === e.target.value);
        if (o) onChange(o.v);
      }}>
        {options.map((o) => <option key={String(o.v)} value={String(o.v)}>{o.l}</option>)}
      </select>
    </label>
  );
}

export function TextField({ label, value, onChange, wide }: { label: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={wide ? 'ifld wide' : 'ifld'}>
      <span>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="itoggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function Section({ n, title, summary, open, children }: { n: number; title: string; summary?: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="isec" open={open}>
      <summary>
        <span className="isec-n">{n}</span>
        <span className="isec-t"><b>{title}</b>{summary && <small>{summary}</small>}</span>
      </summary>
      <div className="isec-body">{children}</div>
    </details>
  );
}
