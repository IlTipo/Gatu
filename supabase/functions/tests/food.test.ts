import { assertEquals } from 'jsr:@std/assert@1';

import { buildFoodMessage, cleanFood } from '../_shared/food.ts';

Deno.test('cibo: valori puliti e nome di riserva', () => {
  const food = cleanFood({ name: '  ', kcal: 450.6, protein_g: -3, carbs_g: 50.55, fat_g: 99999, items: null }, 'Pizza margherita');
  assertEquals(food, { name: 'Pizza margherita', kcal: 451, protein_g: null, carbs_g: 50.6, fat_g: null, items: [] });
});

Deno.test('cibo: niente calorie → non è cibo', () => {
  assertEquals(cleanFood({ name: 'Sedia', kcal: 0 }, 'sedia'), null);
  assertEquals(cleanFood({ name: 'x', kcal: null }, 'x'), null);
});

Deno.test('cibo: il testo va tra i tag (è un dato, non un ordine)', () => {
  assertEquals(buildFoodMessage('pasta al pomodoro'), '<cosa_ho_mangiato>pasta al pomodoro</cosa_ho_mangiato>');
  assertEquals(buildFoodMessage(''), 'Stima quello che si vede nella foto del piatto.');
});
