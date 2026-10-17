// Statistiche personali: numeri semplici dai propri dati. Niente rete: testabile.

import { addDays, toISODate } from '@/features/planner/dates';

export type CookEvent = { recipe_id: string; cooked_at: string };
export type StatRecipe = { id: string; title: string; tags: string[]; status: string; rating: number | null };
export type StatPlace = { status: string; cuisine: string | null; rating: number | null };
export type DayKcal = { eaten_on: string; kcal: number };

const localDay = (iso: string) => toISODate(new Date(iso));

/** Quante volte hai cucinato nel mese di `today` (e il mese prima, per il confronto). */
export function cookedThisMonth(events: CookEvent[], today: string): { now: number; before: number } {
  const month = today.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
  let now = 0;
  let before = 0;
  for (const e of events) {
    const mm = localDay(e.cooked_at).slice(0, 7);
    if (mm === month) now++;
    else if (mm === prev) before++;
  }
  return { now, before };
}

/** Le etichette (primo, veloce, vegetariano…) che cucini di più; se non hai ancora cucinato, quelle salvate. */
export function topTags(recipes: StatRecipe[], events: CookEvent[], limit = 5): { label: string; count: number }[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const counts = new Map<string, number>();
  const pool = events.length ? events.map((e) => byId.get(e.recipe_id)).filter(Boolean) : recipes;
  for (const r of pool as StatRecipe[]) for (const tag of r.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'it'))
    .slice(0, limit);
}

/** La ricetta cucinata più volte. */
export function favoriteRecipe(recipes: StatRecipe[], events: CookEvent[]): { title: string; times: number } | null {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.recipe_id, (counts.get(e.recipe_id) ?? 0) + 1);
  let best: { id: string; times: number } | null = null;
  for (const [id, times] of counts) if (!best || times > best.times) best = { id, times };
  const r = best && recipes.find((x) => x.id === best.id);
  return r && best ? { title: r.title, times: best.times } : null;
}

/** Calorie degli ultimi 7 giorni (oggi compreso), un valore per giorno, e la media dei giorni con qualcosa segnato. */
export function lastWeekKcal(entries: DayKcal[], today: string): { days: { date: string; kcal: number }[]; average: number | null } {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)).map((date) => ({
    date,
    kcal: Math.round(entries.filter((e) => e.eaten_on === date).reduce((s, e) => s + (Number(e.kcal) || 0), 0)),
  }));
  const logged = days.filter((d) => d.kcal > 0);
  return { days, average: logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : null };
}

/** Giorni di fila (fino a oggi o ieri) in cui hai cucinato. */
export function cookingStreak(events: CookEvent[], today: string): number {
  const days = new Set(events.map((e) => localDay(e.cooked_at)));
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

export function libraryCounts(recipes: StatRecipe[], places: StatPlace[]) {
  const rated = [...recipes, ...places].filter((x) => x.rating);
  return {
    recipes: recipes.length,
    triedRecipes: recipes.filter((r) => r.status === 'tried').length,
    places: places.length,
    visitedPlaces: places.filter((p) => p.status === 'tried').length,
    averageRating: rated.length ? Math.round((rated.reduce((s, x) => s + (x.rating ?? 0), 0) / rated.length) * 10) / 10 : null,
  };
}
