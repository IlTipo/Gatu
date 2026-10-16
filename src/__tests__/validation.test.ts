import { isValidEmail, isValidPassword } from '@/features/auth/validation';

describe('validazione accesso', () => {
  it.each(['mario@example.com', ' anna.rossi+cibo@mail.it '])('email valida: %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each(['', 'mario', 'mario@', 'mario@example', 'ma rio@example.com'])('email non valida: "%s"', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it('la password deve avere almeno 8 caratteri', () => {
    expect(isValidPassword('1234567')).toBe(false);
    expect(isValidPassword('12345678')).toBe(true);
  });
});
