import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { parseAuthCallback } from './callbackUrl';

WebBrowser.maybeCompleteAuthSession();

/**
 * Indirizzo a cui Supabase rimanda dopo il login o dopo il clic sull'email di conferma.
 * Sul sito: https://<dominio>/<percorso>/auth/callback. In Expo Go: exp://…/--/auth/callback.
 */
export function getAuthRedirectUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const baseUrl = (Constants.expoConfig?.experiments?.baseUrl ?? '').replace(/\/+$/, '');
    return `${window.location.origin}${baseUrl}/auth/callback`;
  }
  return Linking.createURL('auth/callback');
}

export class AuthCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AuthCancelledError';
  }
}

/** Login con Google: apre la pagina di Google e poi torna su Morso. */
export async function signInWithGoogle() {
  const redirectTo = getAuthRedirectUrl();

  // Sul sito la pagina passa a Google e poi torna su /auth/callback, che completa l'accesso.
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw error;
    return;
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new AuthCancelledError();

  const parsed = parseAuthCallback(result.url);
  if (parsed.kind === 'error') throw new Error(parsed.message);
  if (parsed.kind === 'empty') throw new Error('missing_code');
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(parsed.code);
  if (exchangeError) throw exchangeError;
}

export async function isAppleSignInAvailable() {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Login con Apple (solo iPhone): usa la finestra nativa di Apple. */
export async function signInWithApple() {
  // Il "nonce" è un numero usa-e-getta che impedisce di riutilizzare un login rubato.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new AuthCancelledError();
    throw e;
  }
  if (!credential.identityToken) throw new Error('missing_identity_token');

  const { error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  // Apple comunica il nome solo al primo accesso: lo salviamo nel profilo.
  if (credential.fullName?.givenName) {
    const fullName = AppleAuthentication.formatFullName(credential.fullName);
    await supabase.auth.updateUser({ data: { full_name: fullName } });
  }
}

/**
 * Chiede a Supabase quali accessi "social" sono attivi (pagina pubblica /auth/v1/settings).
 * Se non risponde, si mostra comunque il pulsante: meglio un errore chiaro che un pulsante sparito per sbaglio.
 */
export async function enabledProviders(
  supabaseUrl: string,
  apiKey: string,
  doFetch: typeof fetch = fetch,
): Promise<{ google: boolean }> {
  try {
    const res = await doFetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: apiKey } });
    if (!res.ok) return { google: true };
    const data = (await res.json()) as { external?: Record<string, boolean> };
    return { google: data.external?.google === true };
  } catch {
    return { google: true };
  }
}
