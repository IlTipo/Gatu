import '@/i18n';
import '@/features/install/device'; // cattura subito l'invito "Installa" di Chrome

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/StateViews';
import { TimersPill } from '@/components/TimersPill';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { config } from '@/lib/env';
import { queryClient } from '@/lib/queryClient';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const { scheme, colors } = useTheme();
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...base,
    colors: {
      ...base.colors,
      primary: colors.primary,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
    },
  };

  // sul sito anche lo sfondo della pagina e la barra del browser seguono il tema scelto
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.documentElement.style.colorScheme = scheme;
    document.documentElement.style.backgroundColor = colors.background;
    document.body.style.backgroundColor = colors.background;
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.removeAttribute('media');
      m.setAttribute('content', colors.background);
    });
  }, [scheme, colors.background]);

  return (
    <ThemeProvider value={navigationTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {config ? (
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </QueryClientProvider>
      ) : (
        <MissingConfig />
      )}
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { session, initializing } = useAuth();

  useEffect(() => {
    if (!initializing) SplashScreen.hideAsync().catch(() => {});
  }, [initializing]);

  // Lo splash resta visibile finché non sappiamo se l'utente è già collegato.
  if (initializing) return null;

  const signedIn = !!session;
  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        {/* Le tab sono visibili solo a chi ha fatto l'accesso... */}
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="source/[id]" />
          <Stack.Screen name="recipe/[id]/index" />
          <Stack.Screen name="recipe/[id]/edit" />
          <Stack.Screen name="recipe/[id]/variant" />
          <Stack.Screen name="recipe/[id]/cook" options={{ gestureEnabled: false }} />
          <Stack.Screen name="place/[id]/index" />
          <Stack.Screen name="place/[id]/edit" />
          <Stack.Screen name="nearby" />
          <Stack.Screen name="collection/[id]" />
          <Stack.Screen name="collect" options={{ presentation: 'modal' }} />
          <Stack.Screen name="collections" />
          <Stack.Screen name="ask" />
          <Stack.Screen name="pantry" />
          <Stack.Screen name="plan/add" options={{ presentation: 'modal' }} />
        </Stack.Protected>
        {/* ...e le schermate di accesso solo a chi non l'ha fatto. */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
      </Stack>
      {signedIn ? <TimersPill /> : null}
    </>
  );
}

function MissingConfig() {
  const { t } = useTranslation();
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <Screen>
      <EmptyState title={t('config.missingTitle')} body={t('config.missingBody')} />
    </Screen>
  );
}
