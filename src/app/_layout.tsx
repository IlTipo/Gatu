import '@/i18n';
import '@/features/install/device'; // cattura subito l'invito "Installa" di Chrome

import { QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/components/AppText';
import { PullToRefresh } from '@/components/PullToRefresh';
import { Screen } from '@/components/Screen';
import { EmptyState } from '@/components/StateViews';
import { TimersPill } from '@/components/TimersPill';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { takePendingInvite } from '@/features/social/invite';
import { config } from '@/lib/env';
import { registerServiceWorker, useOnline } from '@/lib/offline';
import { reloadApp, useUpdateChecker, useUpdateState } from '@/lib/updates';
import { queryClient } from '@/lib/queryClient';
import { useTheme } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
// sul sito: file disponibili anche senza internet
registerServiceWorker();

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
          <Stack.Screen name="recipe/new" />
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
          <Stack.Screen name="planner" />
          <Stack.Screen name="shopping" />
          <Stack.Screen name="plan/add" options={{ presentation: 'modal' }} />
          <Stack.Screen name="friends" />
          <Stack.Screen name="friends-recipes" />
          <Stack.Screen name="stats" />
          <Stack.Screen name="username" options={{ gestureEnabled: false }} />
          <Stack.Screen name="consent" options={{ gestureEnabled: false }} />
          <Stack.Screen name="blocked" />
          <Stack.Screen name="map" />
          <Stack.Screen name="search" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="u/[id]" />
          <Stack.Screen name="friend/[id]" />
          <Stack.Screen name="friend/recipe/[id]" />
        </Stack.Protected>
        {/* ...e le schermate di accesso solo a chi non l'ha fatto. */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="invite/[code]" />
        <Stack.Screen name="legal/[doc]" />
      </Stack>
      {signedIn ? <TimersPill /> : null}
      {signedIn ? <PendingInvite /> : null}
      <OfflineBanner />
      <UpdateBanner />
      <PullToRefresh />
    </>
  );
}

/** Versione nuova pubblicata mentre l'app è aperta: un tocco e si aggiorna. */
function UpdateBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  useUpdateChecker();
  const update = useUpdateState();
  const insets = useSafeAreaInsets();
  // solo per le versioni nuove: gli aggiornamenti semplici si applicano da soli
  if (update.kind !== 'version') return null;
  return (
    <Pressable
      onPress={reloadApp}
      accessibilityRole="button"
      style={[styles.offline, { bottom: insets.bottom + 90, backgroundColor: colors.primary }]}>
      <AppText variant="caption" tone="onPrimary" style={{ fontWeight: '700' }}>
        {t('refresh.updateAvailable', { version: update.version })}
      </AppText>
    </Pressable>
  );
}

/** Senza internet: una striscia in alto che spiega cosa si può fare. */
function OfflineBanner() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const online = useOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      pointerEvents="none"
      style={[styles.offline, { top: insets.top + 6, backgroundColor: colors.text }]}
      accessibilityLiveRegion="polite">
      <AppText variant="caption" style={{ color: colors.background, fontWeight: '600' }}>
        {t('offline.banner')}
      </AppText>
    </View>
  );
}

/** Dopo l'accesso: se prima era stato aperto un link d'invito, lo riprende. */
function PendingInvite() {
  useEffect(() => {
    const code = takePendingInvite();
    if (code) router.push({ pathname: '/invite/[code]', params: { code } });
  }, []);
  return null;
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

const styles = StyleSheet.create({
  offline: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    maxWidth: '92%',
  },
});
