import { parseThemePreference, resolveScheme } from '@/theme/preference';

describe('tema', () => {
  it('Automatico segue il telefono', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
  });
  it('Chiaro e Scuro vincono sul telefono', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });
  it('un valore salvato strano torna ad Automatico', () => {
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('blu')).toBe('system');
    expect(parseThemePreference(null)).toBe('system');
  });
});
