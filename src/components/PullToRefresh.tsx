import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkForUpdate, reloadApp } from '@/lib/updates';
import { useTheme } from '@/theme';

import { AppText } from './AppText';

const TRIGGER = 70;
const MAX = 120;

/** La lista sotto il dito è già in cima? (nessun contenitore scorrevole spostato più in basso) */
function atTop(target: EventTarget | null): boolean {
  let el = target instanceof Element ? target : null;
  while (el && el !== document.body) {
    // sulla mappa il dito serve a spostare la mappa, non ad aggiornare
    if (el.classList.contains('leaflet-container')) return false;
    const style = window.getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1 && el.scrollTop > 0) return false;
    el = el.parentElement;
  }
  return true;
}

/**
 * Sul sito: trascina verso il basso (quando sei in cima alla pagina) per aggiornare tutto:
 * ricette, amici, richieste… e, se c'è, anche la nuova versione dell'app.
 */
export function PullToRefresh() {
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const start = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const refresh = async () => {
      setRefreshing(true);
      try {
        if (await checkForUpdate()) {
          reloadApp();
          return;
        }
        await queryClient.refetchQueries({ type: 'active' });
      } finally {
        setRefreshing(false);
      }
    };
    const onStart = (e: TouchEvent) => {
      start.current = e.touches.length === 1 && atTop(e.target) ? e.touches[0].clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null) return;
      const dy = e.touches[0].clientY - start.current;
      const next = dy > 0 ? Math.min(MAX, dy * 0.5) : 0;
      pullRef.current = next;
      setPull(next);
    };
    const onEnd = () => {
      if (start.current !== null && pullRef.current >= TRIGGER) refresh();
      start.current = null;
      pullRef.current = 0;
      setPull(0);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [queryClient]);

  if (!pull && !refreshing) return null;
  const offset = refreshing ? 56 : pull;
  const ready = refreshing || pull >= TRIGGER;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + offset - 44 }]}>
      <View
        style={[
          styles.circle,
          {
            backgroundColor: colors.surface,
            borderColor: colors.border,
            shadowColor: colors.shadow,
            transform: [{ rotate: `${(pull / TRIGGER) * 270}deg` }],
          },
        ]}>
        {refreshing ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <AppText variant="heading" tone={ready ? 'primary' : 'secondary'}>
            ↻
          </AppText>
        )}
      </View>
      {ready && !refreshing ? (
        <View style={[styles.label, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="caption" tone="secondary">
            {t('refresh.release')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  label: { marginTop: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
});
