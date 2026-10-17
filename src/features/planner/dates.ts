// Date del planner: si lavora sempre con la data LOCALE ("2026-10-19"), mai con l'ora UTC,
// altrimenti di sera un pasto potrebbe finire nel giorno sbagliato.

export type Slot = 'lunch' | 'dinner';
export const SLOTS: Slot[] = ['lunch', 'dinner'];

/** Date → "2026-10-19" (ora locale). */
export function toISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10-19" → Date a mezzogiorno locale (così i cambi d'ora non spostano il giorno). */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso: string, days: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Il lunedì della settimana che contiene la data. */
export function startOfWeek(iso: string): string {
  const d = fromISODate(iso);
  const fromMonday = (d.getDay() + 6) % 7; // domenica = 6
  return addDays(iso, -fromMonday);
}

/** I 7 giorni (da lunedì) della settimana che inizia con "monday". */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

export function isValidISODate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && toISODate(fromISODate(value)) === value;
}

const DAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "2026-10-19" → "Lunedì 19" */
export function dayLabel(iso: string): string {
  const d = fromISODate(iso);
  const name = DAYS[d.getDay()];
  return `${name[0].toUpperCase()}${name.slice(1)} ${d.getDate()}`;
}

/** "2026-10-19" → "lun 19 ott" (breve, per pulsanti) */
export function shortDayLabel(iso: string): string {
  const d = fromISODate(iso);
  return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
}

/** "19–25 ottobre 2026" oppure "27 ottobre – 2 novembre 2026" */
export function weekLabel(monday: string): string {
  const a = fromISODate(monday);
  const b = fromISODate(addDays(monday, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  const yearA = a.getFullYear() !== b.getFullYear() ? ` ${a.getFullYear()}` : '';
  return `${a.getDate()} ${MONTHS[a.getMonth()]}${yearA} – ${b.getDate()} ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
}

/** Pasto proposto per una ricetta aggiunta "adesso": oggi a pranzo prima delle 15, altrimenti a cena. */
export function nextMealSlot(now = new Date()): { date: string; slot: Slot } {
  return { date: toISODate(now), slot: now.getHours() < 15 ? 'lunch' : 'dinner' };
}
