import { assertEquals } from 'jsr:@std/assert@1';

import { cleanDietPlan } from '../_shared/dietPlan.ts';

Deno.test('piano alimentare: pulito e nei limiti', () => {
  const plan = cleanDietPlan({
    title: '  Piano  ',
    notes: ['  acqua  ', ''],
    days: [
      {
        label: 'Martedì',
        weekday: 2,
        meals: [
          { slot: 'brunch', options: [{ text: '', items: [{ name: 'Uova', quantity: 2, unit: null }] }] },
          { slot: 'cena', options: [] },
        ],
      },
      { label: 'Vuoto', weekday: 9, meals: [] },
    ],
  });
  assertEquals(plan, {
    title: 'Piano',
    notes: ['acqua'],
    days: [{ label: 'Martedì', weekday: 2, meals: [{ slot: 'altro', options: [{ text: '2 uova', items: [{ name: 'uova', quantity: 2, unit: null }] }] }] }],
  });
});
