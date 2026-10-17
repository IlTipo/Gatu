// "2 ore fa", "ieri", "3 giorni fa"… per i post e le notifiche.

export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'adesso';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? '1 minuto fa' : `${m} minuti fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? '1 ora fa' : `${h} ore fa`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ieri';
  if (d < 7) return `${d} giorni fa`;
  const w = Math.floor(d / 7);
  if (d < 31) return w === 1 ? '1 settimana fa' : `${w} settimane fa`;
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}
