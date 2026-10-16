import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

import { parseAuthCallback } from './callbackUrl';

WebBrowser.maybeCompleteAuthSession();

/** Indirizzo a cui Supabase rimanda dopo il login (in Expo Go è del tipo exp://…/--/auth/callback). */
export const authRedirectUrl = Linking.createURL('auth/callback');

export class AuthCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AuthCancelledError';
  }
}

/** Login con Google: apre la pagina di Google in un browser interno e poi torna nell'app. */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: authRedirectUrl, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, authRedirectUrl);
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
