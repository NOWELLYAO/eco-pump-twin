// Fonction Vercel : ensoleillement moyen mensuel (NASA POWER, climatologie) pour un point GPS.
const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    res.status(400).json({ error: 'Coordonnées invalides' });
    return;
  }
  const url = `https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=ALLSKY_SFC_SW_DWN,T2M&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`;
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) { res.status(502).json({ error: `NASA POWER a répondu ${r.status}` }); return; }
    const j = await r.json();
    const P = j?.properties?.parameter;
    if (!P?.ALLSKY_SFC_SW_DWN) { res.status(502).json({ error: 'Réponse NASA POWER inattendue' }); return; }
    res.setHeader('Cache-Control', 's-maxage=2592000, stale-while-revalidate=86400');
    res.status(200).json({
      ghi: M.map((k) => P.ALLSKY_SFC_SW_DWN[k]),
      temp: M.map((k) => P.T2M?.[k] ?? 25),
      source: 'NASA POWER (climatologie)',
    });
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
