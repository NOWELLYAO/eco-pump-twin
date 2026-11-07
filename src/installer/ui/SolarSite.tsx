import { useState } from 'react';
import { CloudDownload, LocateFixed, Trash2 } from 'lucide-react';
import { MONTHS } from '../electrical';
import type { Solar } from '../types';
import { NumField, TextField } from './Fields';

const NASA_KEYS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

async function fetchMonthly(lat: number, lon: number): Promise<{ ghi: number[]; temp: number[]; source: string }> {
  // 1) via notre fonction Vercel ; 2) directement chez NASA POWER si le navigateur l'autorise
  try {
    const r = await fetch(`/api/solar?lat=${lat}&lon=${lon}`);
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.ghi) && j.ghi.length === 12) return j; }
  } catch { /* on essaie la source directe */ }
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`NASA POWER ${r.status}`);
  const j = await r.json();
  const P = j?.properties?.parameter;
  if (!P?.ALLSKY_SFC_SW_DWN) throw new Error('réponse inattendue');
  return { ghi: NASA_KEYS.map((k) => P.ALLSKY_SFC_SW_DWN[k]), temp: NASA_KEYS.map((k) => P.T2M?.[k] ?? 25), source: 'NASA POWER (climatologie)' };
}

/** Emplacement de l'installation et ensoleillement mois par mois. */
export function SolarSite({ s, set, designMonth }: { s: Solar; set: (d: Partial<Solar>) => void; designMonth: number }) {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const has = Array.isArray(s.ghi) && s.ghi.length === 12;
  const months = s.months && s.months.length === 12 ? s.months : Array(12).fill(true);

  const locate = () => {
    if (!navigator.geolocation) { setMsg({ ok: false, t: 'La localisation n\'est pas disponible sur cet appareil.' }); return; }
    setBusy(true); setMsg(null);
    navigator.geolocation.getCurrentPosition(
      (p) => { set({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4 }); setBusy(false); setMsg({ ok: true, t: 'Position récupérée. Chargez maintenant les données du lieu.' }); },
      () => { setBusy(false); setMsg({ ok: false, t: 'Position refusée ou indisponible : saisissez la latitude et la longitude.' }); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  const load = async () => {
    if (s.lat == null || s.lon == null) { setMsg({ ok: false, t: 'Indiquez d\'abord la position (bouton GPS ou coordonnées).' }); return; }
    setBusy(true); setMsg(null);
    try {
      const d = await fetchMonthly(s.lat, s.lon);
      set({ ghi: d.ghi.map((v) => Math.round(v * 100) / 100), temp: d.temp.map((v) => Math.round(v * 10) / 10), source: d.source, months: s.months ?? Array(12).fill(true) });
      setMsg({ ok: true, t: `Données chargées (${d.source}). Elles restent enregistrées pour une utilisation hors ligne.` });
    } catch {
      setMsg({ ok: false, t: navigator.onLine ? 'Données indisponibles pour le moment : saisissez les valeurs mensuelles à la main.' : 'Hors ligne : saisissez les valeurs à la main ou réessayez avec internet.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="solarsite">
      <div className="igrid">
        <TextField label="Lieu" value={s.place ?? ''} onChange={(v) => set({ place: v })} wide />
        <NumField label="Latitude" value={s.lat ?? 0} min={-90} onChange={(v) => set({ lat: v })} />
        <NumField label="Longitude" value={s.lon ?? 0} min={-180} onChange={(v) => set({ lon: v })} />
      </div>
      <div className="row mt-xs">
        <button type="button" className="btn sm" onClick={locate} disabled={busy}><LocateFixed size={14} aria-hidden /> Ma position (GPS)</button>
        <button type="button" className="btn primary sm" onClick={load} disabled={busy}><CloudDownload size={14} aria-hidden /> {busy ? 'Chargement…' : 'Ensoleillement du lieu'}</button>
        {!has && <button type="button" className="btn sm" onClick={() => set({ ghi: Array(12).fill(s.psh), temp: Array(12).fill(25), months: Array(12).fill(true), source: 'saisie manuelle' })}>Saisir mois par mois</button>}
      </div>
      {msg && <p className={msg.ok ? 'note ok small' : 'note err small'}>{msg.t}</p>}
      {!has ? (
        <div className="igrid mt-xs">
          <NumField label="Ensoleillement moyen" unit="kWh/m²/j" value={s.psh} onChange={(v) => v > 0 && set({ psh: v })} hint="Valeur unique (sans données mensuelles)" wide />
        </div>
      ) : (
        <>
          <p className="ihint">Cochez les mois où la pompe doit fournir le besoin (saison d'irrigation, par exemple). Le champ solaire est dimensionné sur le mois coché le moins ensoleillé{designMonth >= 0 ? ` : ${MONTHS[designMonth].toLowerCase()}` : ''}.</p>
          <table className="mtable">
            <thead><tr><th>Mois</th><th>kWh/m²/j</th><th>°C</th><th>Utilisé</th></tr></thead>
            <tbody>
              {MONTHS.map((m, k) => (
                <tr key={m} className={k === designMonth ? 'design' : ''}>
                  <td>{m}</td>
                  <td><input inputMode="decimal" value={String(s.ghi![k]).replace('.', ',')} onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v) && v > 0) { const g = [...s.ghi!]; g[k] = v; set({ ghi: g }); } }} /></td>
                  <td><input inputMode="decimal" value={String(s.temp?.[k] ?? 25).replace('.', ',')} onChange={(e) => { const v = Number(e.target.value.replace(',', '.')); if (Number.isFinite(v)) { const t = [...(s.temp ?? Array(12).fill(25))]; t[k] = v; set({ temp: t }); } }} /></td>
                  <td><input type="checkbox" checked={months[k]} onChange={(e) => { const mm = [...months]; mm[k] = e.target.checked; if (mm.some(Boolean)) set({ months: mm }); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row mt-xs">
            <small className="muted">Source : {s.source ?? 'saisie manuelle'}</small>
            <button type="button" className="link" onClick={() => set({ ghi: undefined, temp: undefined, months: undefined, source: undefined })}><Trash2 size={13} aria-hidden /> Revenir à une valeur unique</button>
          </div>
        </>
      )}
    </div>
  );
}
