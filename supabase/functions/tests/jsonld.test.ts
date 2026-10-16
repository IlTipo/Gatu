import { assert, assertEquals } from 'jsr:@std/assert@1';

import {
  detectTimerSeconds,
  guessAisle,
  isItalian,
  isoDurationToMinutes,
  parseIngredientLine,
  recipeFromJsonLd,
} from '../_shared/jsonld.ts';

Deno.test('righe di ingredienti italiane', () => {
  assertEquals(parseIngredientLine('320 g di spaghetti'), {
    quantity: 320,
    unit: 'g',
    name: 'spaghetti',
    note: null,
    aisle: 'dispensa',
  });
  assertEquals(parseIngredientLine('200gr farina 00'), {
    quantity: 200,
    unit: 'g',
    name: 'farina 00',
    note: null,
    aisle: 'dispensa',
  });
  assertEquals(parseIngredientLine('2 uova'), {
    quantity: 2,
    unit: null,
    name: 'uova',
    note: null,
    aisle: 'latticini',
  });
  assertEquals(parseIngredientLine('1/2 cucchiaino di sale')?.quantity, 0.5);
  assertEquals(parseIngredientLine('1/2 cucchiaino di sale')?.unit, 'cucchiaino');
  assertEquals(parseIngredientLine('1 ½ cucchiai di zucchero')?.quantity, 1.5);
  assertEquals(parseIngredientLine('Sale q.b.'), {
    quantity: null,
    unit: null,
    name: 'sale',
    note: 'q.b.',
    aisle: 'dispensa',
  });
  assertEquals(parseIngredientLine('un pizzico di pepe'), {
    quantity: 1,
    unit: 'pizzico',
    name: 'pepe',
    note: null,
    aisle: 'dispensa',
  });
  assertEquals(parseIngredientLine("1 spicchio d'aglio")?.name, 'aglio');
  assertEquals(parseIngredientLine('150 g guanciale (o pancetta)')?.note, 'o pancetta');
  assertEquals(parseIngredientLine('1,5 l di latte intero')?.quantity, 1.5);
  assertEquals(parseIngredientLine('2-3 pomodori')?.quantity, 2);
  assertEquals(parseIngredientLine('   '), null);
});

Deno.test('righe americane → unità metriche', () => {
  assertEquals(parseIngredientLine('1 cup milk'), {
    quantity: 240,
    unit: 'ml',
    name: 'milk',
    note: null,
    aisle: 'latticini',
  });
  assertEquals(parseIngredientLine('8 oz cream cheese')?.quantity, 224);
  assertEquals(parseIngredientLine('2 tbsp olive oil')?.unit, 'cucchiaio');
  assertEquals(parseIngredientLine('1 lb ground beef')?.quantity, 454);
});

Deno.test('reparti', () => {
  assertEquals(guessAisle('mozzarella di bufala'), 'latticini');
  assertEquals(guessAisle('petto di pollo'), 'carne_pesce');
  assertEquals(guessAisle('zucchine'), 'frutta_verdura');
  assertEquals(guessAisle('piselli surgelati'), 'surgelati');
  assertEquals(guessAisle('ingrediente misterioso'), 'altro');
});

Deno.test('tempi', () => {
  assertEquals(isoDurationToMinutes('PT1H30M'), 90);
  assertEquals(isoDurationToMinutes('PT20M'), 20);
  assertEquals(isoDurationToMinutes('P0DT0H45M'), 45);
  assertEquals(isoDurationToMinutes('PT0S'), null);
  assertEquals(isoDurationToMinutes('30 minuti'), null);
  assertEquals(detectTimerSeconds('Cuoci in forno per 25 minuti.'), 1500);
  assertEquals(detectTimerSeconds('Lascia lievitare 2 ore'), 7200);
  assertEquals(detectTimerSeconds('Mescola bene.'), null);
});

Deno.test('scheda schema.org completa (con sezioni di passaggi)', () => {
  const result = recipeFromJsonLd({
    '@type': 'Recipe',
    name: 'Tiramisù',
    description: '<p>Il dolce al cucchiaio più amato.</p>',
    recipeYield: ['8', '8 porzioni'],
    prepTime: 'PT30M',
    totalTime: 'PT4H30M',
    recipeCategory: 'Dolci',
    keywords: 'tiramisù, dolce, mascarpone',
    recipeIngredient: ['500 g di mascarpone', '4 uova', '100 g di zucchero', '300 g di savoiardi', 'Cacao amaro q.b.'],
    recipeInstructions: [
      {
        '@type': 'HowToSection',
        name: 'Crema',
        itemListElement: [
          { '@type': 'HowToStep', text: 'Monta i tuorli con lo zucchero.' },
          { '@type': 'HowToStep', text: 'Aggiungi il mascarpone.' },
        ],
      },
      { '@type': 'HowToStep', text: 'Fai riposare in frigo per 4 ore.' },
    ],
  })!;
  assertEquals(result.kind, 'recipe');
  const r = result.recipe!;
  assertEquals(r.title, 'Tiramisù');
  assertEquals(r.description, 'Il dolce al cucchiaio più amato.');
  assertEquals(r.servings, 8);
  assertEquals(r.prep_minutes, 30);
  assertEquals(r.total_minutes, 270);
  assertEquals(r.ingredients.length, 5);
  assertEquals(r.steps.map((s) => s.text), [
    'Monta i tuorli con lo zucchero.',
    'Aggiungi il mascarpone.',
    'Fai riposare in frigo per 4 ore.',
  ]);
  assertEquals(r.steps[2].timer_seconds, 14400);
  assert(r.tags.includes('dolce'));
  assertEquals(r.tags.includes('veloce'), false);
});

Deno.test('scheda con procedimento in un unico testo e ricetta veloce', () => {
  const result = recipeFromJsonLd({
    name: 'Pasta aglio e olio',
    recipeIngredient: ['200 g spaghetti', '2 spicchi di aglio', 'olio extravergine'],
    recipeInstructions: "Cuoci la pasta.\nSoffriggi l'aglio nell'olio.\nSalta la pasta in padella.",
    totalTime: 'PT15M',
    suitableForDiet: 'https://schema.org/VegetarianDiet',
  })!;
  assertEquals(result.recipe!.steps.length, 3);
  assert(result.recipe!.tags.includes('veloce'));
  assert(result.recipe!.tags.includes('vegetariano'));
});

Deno.test("scheda incompleta → null (ci pensa l'AI)", () => {
  assertEquals(recipeFromJsonLd({ name: 'Senza ingredienti' }), null);
  assertEquals(recipeFromJsonLd({ recipeIngredient: ['1 uovo'] }), null);
});

Deno.test('lingua della scheda', () => {
  assertEquals(isItalian({ inLanguage: 'it-IT' }, 'https://x.com/'), true);
  assertEquals(isItalian({ inLanguage: 'en-US' }, 'https://x.it/'), false);
  assertEquals(isItalian({}, 'https://www.giallozafferano.it/x'), true);
  assertEquals(isItalian({}, 'https://www.allrecipes.com/x'), false);
});
