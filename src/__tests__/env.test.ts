import { readConfig } from '@/lib/env';

describe('readConfig', () => {
  it('legge URL e chiave', () => {
    expect(
      readConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co/', EXPO_PUBLIC_SUPABASE_KEY: ' sb_publishable_x ' }),
    ).toEqual({ supabaseUrl: 'https://abc.supabase.co', supabaseKey: 'sb_publishable_x' });
  });

  it('restituisce null se manca qualcosa', () => {
    expect(readConfig({})).toBeNull();
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: 'https://abc.supabase.co' })).toBeNull();
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: '', EXPO_PUBLIC_SUPABASE_KEY: 'k' })).toBeNull();
  });

  it("rifiuta un URL senza https://", () => {
    expect(readConfig({ EXPO_PUBLIC_SUPABASE_URL: 'abc.supabase.co', EXPO_PUBLIC_SUPABASE_KEY: 'k' })).toBeNull();
  });
});
