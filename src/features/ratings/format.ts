import { fromISODate, toISODate } from '@/features/planner/dates';

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

/** "oggi" · "ieri" · "3 giorni fa" · "il 12 ottobre" · "il 3 marzo 2025" (in base al giorno locale). */
export function formatWhen(timestamp: string, now = new Date()): string {
  const day = toISODate(new Date(timestamp));
  const today = toISODate(now);
  const days = Math.round((fromISODate(today).getTime() - fromISODate(day).getTime()) / 86_400_000);
  if (days <= 0) return 'oggi';
  if (days === 1) return 'ieri';
  if (days < 7) return `${days} giorni fa`;
  const d = fromISODate(day);
  const year = d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : '';
  return `il ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** ★★★☆☆ */
export function starsText(rating: number | null): string {
  if (!rating) return '';
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

export const MAX_NOTES = 5000;
