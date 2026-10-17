import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { InlineError } from '@/components/StateViews';
import { errorMessage } from '@/lib/errors';
import { enablePush, markPushIntroSeen } from '@/lib/push';
import { spacing } from '@/theme';

/** Una volta sola dopo l'accesso: "Vuoi le notifiche?" (poi si cambiano dal Profilo). */
export default function PushIntroScreen() {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const done = () => {
    markPushIntroSeen();
    router.replace('/library');
  };
  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush();
      done();
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };
  return (
    <Screen scroll>
      <View style={styles.container}>
        <AppText variant="title">🔔 {t('push.introTitle')}</AppText>
        <AppText tone="secondary">{t('push.introBody')}</AppText>
        <View style={styles.list}>
          {(['social', 'meals', 'shopping', 'updates'] as const).map((k) => (
            <AppText key={k}>
              {t(`push.introItems.${k}`)}
            </AppText>
          ))}
        </View>
        <AppText variant="caption" tone="secondary">
          {t('push.introFoot')}
        </AppText>
        <InlineError message={error ? errorMessage(error, t) : null} />
        <Button label={t('push.introEnable')} onPress={enable} loading={busy} />
        <Button label={t('push.introLater')} variant="ghost" onPress={done} disabled={busy} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg },
  list: { gap: spacing.sm },
});
