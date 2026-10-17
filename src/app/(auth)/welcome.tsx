import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Screen } from '@/components/Screen';
import { canPromptInstall, currentPlatform, promptInstall, setInstallDismissed } from '@/features/install/device';
import type { DevicePlatform } from '@/features/install/logic';
import { radius, spacing, useTheme } from '@/theme';

const GUIDES: { platform: Exclude<DevicePlatform, 'other'>; icon: string; steps: number }[] = [
  { platform: 'ios', icon: '🍎', steps: 4 },
  { platform: 'android', icon: '🤖', steps: 3 },
];

/** Prima schermata del sito: invita ad aggiungere Morso alla schermata Home. */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [platform] = useState(currentPlatform);
  const [dontShow, setDontShow] = useState(false);
  const [canInstall] = useState(canPromptInstall);
  const [installing, setInstalling] = useState(false);

  // il telefono in uso va per primo
  const guides = platform === 'android' ? [...GUIDES].reverse() : GUIDES;

  const goOn = () => {
    if (dontShow) setInstallDismissed(true);
    router.replace('/sign-in');
  };
  const install = async () => {
    setInstalling(true);
    try {
      if (await promptInstall()) {
        setInstallDismissed(true);
        router.replace('/sign-in');
      }
    } finally {
      setInstalling(false);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <AppText style={styles.emoji}>📲</AppText>
        <AppText variant="title" style={styles.center}>
          {t('install.title')}
        </AppText>
        <AppText tone="secondary" style={styles.center}>
          {t('install.subtitle')}
        </AppText>

        {canInstall ? <Button label={t('install.installNow')} onPress={install} loading={installing} /> : null}

        {guides.map((g) => {
          const mine = g.platform === platform;
          return (
            <View
              key={g.platform}
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: mine ? colors.primary : colors.border },
              ]}>
              <AppText variant="heading">
                {g.icon} {t(`install.${g.platform}.title`)}
                {mine ? (
                  <AppText variant="caption" tone="primary">
                    {'  '}
                    {t('install.yourPhone')}
                  </AppText>
                ) : null}
              </AppText>
              {Array.from({ length: g.steps }, (_, i) => (
                <View key={i} style={styles.step}>
                  <View style={[styles.num, { backgroundColor: colors.primary }]}>
                    <AppText variant="caption" tone="onPrimary">
                      {i + 1}
                    </AppText>
                  </View>
                  <AppText style={styles.flex}>{t(`install.${g.platform}.step${i + 1}` as 'install.ios.step1')}</AppText>
                </View>
              ))}
            </View>
          );
        })}

        <Pressable
          onPress={() => setDontShow((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: dontShow }}
          style={({ pressed }) => [styles.check, { opacity: pressed ? 0.7 : 1 }]}>
          <View
            style={[
              styles.box,
              { borderColor: dontShow ? colors.primary : colors.border, backgroundColor: dontShow ? colors.primary : 'transparent' },
            ]}>
            {dontShow ? (
              <AppText variant="caption" tone="onPrimary">
                ✓
              </AppText>
            ) : null}
          </View>
          <AppText>{t('install.dontShowAgain')}</AppText>
        </Pressable>

        <Button label={t('install.continue')} variant={canInstall ? 'secondary' : 'primary'} onPress={goOn} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingBottom: spacing.xl },
  emoji: { fontSize: 48, lineHeight: 56, textAlign: 'center', marginTop: spacing.md },
  center: { textAlign: 'center' },
  card: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  step: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
});
