import { splitPrefs } from '@/features/fridge/prefs';

describe('preferenze della ricetta', () => {
  it('divide il testo in preferenze', () => {
    expect(splitPrefs(' senza cipolla, poco sale;\nstile   giapponese ,, ')).toEqual(['senza cipolla', 'poco sale', 'stile giapponese']);
  });
});
