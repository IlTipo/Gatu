import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { EmptyState, InlineError } from '@/components/StateViews';
import { ConsentCheck } from '@/components/ConsentCheck';
import { TextField } from '@/components/TextField';
import { acceptTerms } from '@/features/legal/api';
import { config } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

import {
  AuthCancelledError,
  enabledProviders,
  getAuthRedirectUrl,
  isAppleSignInAvailable,
  signInWithApple,
  signInWithGoogle,
} from './oauth';
import { isValidEmail, isValidPassword } from './validation';

type Mode = 'sign-in' | 'sign-up';
type Busy = null | 'email' | 'google' | 'apple';

export function AuthForm({ mode }: { mode: Mode }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  // registrazione: età minima e Termini/Privacy accettati
  const [consent, setConsent] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Google si mostra solo se è attivo su Supabase (altrimenti porterebbe a una pagina di errore)
  const [googleAvailable, setGoogleAvailable] = useState(false);

  useEffect(() => {
    isAppleSignInAvailable().then(setAppleAvailable);
    if (config) enabledProviders(config.supabaseUrl, config.supabaseKey).then((p) => setGoogleAvailable(p.google));
  }, []);

  async function submitEmail() {
    const nextErrors: typeof fieldErrors = {};
    if (!isValidEmail(email)) nextErrors.email = t('auth.errors.emailInvalid');
    if (!isValidPassword(password)) nextErrors.password = t('auth.errors.passwordTooShort');
    setFieldErrors(nextErrors);
    setError(null);
    if (Object.keys(nextErrors).length) return;
    if (mode === 'sign-up' && !consent) {
      setError(t('legal.consentRequired'));
      return;
    }

    setBusy('email');
    try {
      if (mode === 'sign-in') {
        const { error: e } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (e) throw e;
      } else {
        const { data, error: e } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: getAuthRedirectUrl() },
        });
        if (e) throw e;
        // Se nel progetto è attiva la conferma email, la sessione arriva solo dopo il clic sul link
        // (e i termini si accettano al primo accesso).
        if (!data.session) setCheckEmail(true);
        else await acceptTerms().catch(() => {});
      }
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setBusy(null);
    }
  }

  async function social(provider: 'google' | 'apple') {
    setError(null);
    setBusy(provider);
    try {
      if (provider === 'google') await signInWithGoogle();
      else await signInWithApple();
    } catch (e) {
      if (!(e instanceof AuthCancelledError)) setError(errorMessage(e, t));
    } finally {
      setBusy(null);
    }
  }

  if (checkEmail) {
    return (
      <Screen>
        <EmptyState
          title={t('auth.checkEmailTitle')}
          body={t('auth.checkEmailBody')}
          action={<Button label={t('auth.goToSignIn')} variant="ghost" onPress={() => setCheckEmail(false)} />}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Image source={require('@/assets/images/splash-icon.png')} style={styles.logo} accessibilityIgnoresInvertColors />
          <AppText variant="title">{t('common.appName')}</AppText>
          <AppText variant="heading">{t('auth.welcomeTitle')}</AppText>
          <AppText tone="secondary">{t('auth.welcomeSubtitle')}</AppText>
        </View>

        <InlineError message={error} />

        <View style={styles.form}>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            error={fieldErrors.email}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <TextField
            label={t('auth.password')}
            value={password}
            onChangeText={setPassword}
            error={fieldErrors.password}
            hint={mode === 'sign-up' ? t('auth.passwordHint') : undefined}
            secureTextEntry
            autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
            textContentType={mode === 'sign-up' ? 'newPassword' : 'password'}
            returnKeyType="go"
            onSubmitEditing={submitEmail}
          />
          {mode === 'sign-up' ? <ConsentCheck checked={consent} onChange={setConsent} /> : null}
          <Button
            label={mode === 'sign-in' ? t('auth.signIn') : t('auth.signUp')}
            onPress={submitEmail}
            loading={busy === 'email'}
            disabled={!!busy}
          />
        </View>

        {googleAvailable || appleAvailable ? (
          <>
            <View style={styles.divider}>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
              <AppText variant="caption" tone="secondary">
                {t('common.or')}
              </AppText>
              <View style={[styles.line, { backgroundColor: colors.border }]} />
            </View>

            <View style={styles.form}>
              {googleAvailable ? (
                <Button
                  label={t('auth.continueWithGoogle')}
                  variant="secondary"
                  onPress={() => social('google')}
                  loading={busy === 'google'}
                  disabled={!!busy}
                />
              ) : null}
              {appleAvailable ? (
                <Button
                  label={t('auth.continueWithApple')}
                  variant="secondary"
                  onPress={() => social('apple')}
                  loading={busy === 'apple'}
                  disabled={!!busy}
                />
              ) : null}
            </View>
          </>
        ) : null}

        <Link href={mode === 'sign-in' ? '/sign-up' : '/sign-in'} replace style={styles.switch}>
          <AppText tone="primary" variant="bodyStrong">
            {mode === 'sign-in' ? t('auth.goToSignUp') : t('auth.goToSignIn')}
          </AppText>
        </Link>
        <AppText variant="caption" tone="secondary" style={styles.legal}>
          <Link href={{ pathname: '/legal/[doc]', params: { doc: 'privacy' } }}>{t('legal.privacy')}</Link>
          {'  ·  '}
          <Link href={{ pathname: '/legal/[doc]', params: { doc: 'terms' } }}>{t('legal.terms')}</Link>
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', gap: spacing.lg, maxWidth: 480, width: '100%', alignSelf: 'center' },
  header: { gap: spacing.sm },
  logo: { width: 56, height: 56 },
  form: { gap: spacing.md },
  legal: { textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  switch: { alignSelf: 'center', padding: spacing.sm },
});
