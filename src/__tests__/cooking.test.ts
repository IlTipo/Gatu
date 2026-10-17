import { formatCountdown, ingredientsForStep, parseVoiceCommand, timerLabel } from '@/features/cooking/logic';

const ingredients = [
  { name: 'spaghetti' },
  { name: 'guanciale' },
  { name: 'tuorli' },
  { name: 'pecorino romano' },
  { name: 'pepe nero' },
  { name: 'olio extravergine di oliva' },
  { name: 'zucchine' },
];
const names = (step: string) => ingredientsForStep(step, ingredients).map((i) => i.name);

describe('ingredienti del passaggio', () => {
  it('trova gli ingredienti nominati, anche al singolare/plurale', () => {
    expect(names('Sbatti il tuorlo con il pecorino e tanto pepe.')).toEqual(['tuorli', 'pecorino romano', 'pepe nero']);
    expect(names('Taglia la zucchina a rondelle e scaldala in un filo di olio.')).toEqual([
      'olio extravergine di oliva',
      'zucchine',
    ]);
  });

  it('il nome generico vale per quello specifico', () => {
    expect(names('Cuoci la pasta in acqua salata.')).toEqual(['spaghetti']);
  });

  it('nessun falso positivo da parole simili', () => {
    expect(names('Servi subito.')).toEqual([]);
  });
});

describe('formatCountdown', () => {
  it('minuti e secondi, ore se servono, mai negativo', () => {
    expect(formatCountdown(605_000)).toBe('10:05');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
    expect(formatCountdown(400)).toBe('0:01');
    expect(formatCountdown(-5000)).toBe('0:00');
  });
});

describe('comandi vocali', () => {
  it('riconosce i comandi in italiano', () => {
    expect(parseVoiceCommand('Avanti')).toBe('next');
    expect(parseVoiceCommand('torna indietro')).toBe('prev');
    expect(parseVoiceCommand('avvia il timer')).toBe('timer');
    expect(parseVoiceCommand('ferma la sveglia')).toBe('stop');
    expect(parseVoiceCommand('che bello cucinare')).toBeNull();
  });

  it("vince l'ultimo comando detto", () => {
    expect(parseVoiceCommand('avanti no aspetta indietro')).toBe('prev');
  });
});

describe('timerLabel', () => {
  it('accorcia il testo', () => {
    expect(timerLabel(3, 'Cuoci la pasta in abbondante acqua salata')).toBe('3 · Cuoci la pasta in abbon…');
    expect(timerLabel(1, 'Inforna')).toBe('1 · Inforna');
  });
});
