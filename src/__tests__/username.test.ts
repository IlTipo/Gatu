import { cleanUsername, isValidUsername, suggestUsername } from '@/features/social/username';

describe('username', () => {
  it('regole come nel database', () => {
    expect(isValidUsername('giulia.rossi')).toBe(true);
    expect(isValidUsername('chef_88')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('.giulia')).toBe(false);
    expect(isValidUsername('giulia.')).toBe(false);
    expect(isValidUsername('giu..lia')).toBe(false);
    expect(isValidUsername('Giulia')).toBe(false);
  });
  it('pulisce quello che scrivi', () => {
    expect(cleanUsername('@Giulia Rossì!')).toBe('giulia.rossi');
    expect(cleanUsername('a  b')).toBe('a.b');
  });
  it('proposta dal nome o dall\'email', () => {
    expect(suggestUsername('Giulia Rossi', 'x@y.it')).toBe('giulia.rossi');
    expect(suggestUsername(null, 'mario.b@gmail.com')).toBe('mario.b');
    expect(isValidUsername(suggestUsername('Al', null))).toBe(true);
  });
});
