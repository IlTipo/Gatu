import { enabledProviders } from '@/features/auth/oauth';

// jest sposta da solo i mock prima degli import
jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('expo-apple-authentication', () => ({}));
jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: () => {} }));

const reply = (status: number, body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;

describe('accessi social attivi', () => {
  it('legge le impostazioni pubbliche di Supabase', async () => {
    expect(await enabledProviders('https://x.supabase.co', 'k', reply(200, { external: { google: false, email: true } }))).toEqual({ google: false });
    expect(await enabledProviders('https://x.supabase.co', 'k', reply(200, { external: { google: true } }))).toEqual({ google: true });
  });

  it('se Supabase non risponde, il pulsante resta', async () => {
    expect(await enabledProviders('https://x.supabase.co', 'k', reply(500, {}))).toEqual({ google: true });
    const offline = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await enabledProviders('https://x.supabase.co', 'k', offline)).toEqual({ google: true });
  });
});
