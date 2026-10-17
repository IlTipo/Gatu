import { detectPlatform, shouldShowInstall } from '@/features/install/logic';

describe('telefono', () => {
  it('riconosce iPhone, iPad e Android', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari')).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 5)).toBe('ios');
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/140 Mobile')).toBe('android');
  });
  it('un computer è "altro"', () => {
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari', 0)).toBe('other');
    expect(detectPlatform('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140')).toBe('other');
  });
});

describe('quando mostrare la pagina', () => {
  it('solo sul sito, non già come app e non se è stato scelto "non mostrare più"', () => {
    expect(shouldShowInstall({ isWeb: true, standalone: false, dismissed: false })).toBe(true);
    expect(shouldShowInstall({ isWeb: true, standalone: true, dismissed: false })).toBe(false);
    expect(shouldShowInstall({ isWeb: true, standalone: false, dismissed: true })).toBe(false);
    expect(shouldShowInstall({ isWeb: false, standalone: false, dismissed: false })).toBe(false);
  });
});
