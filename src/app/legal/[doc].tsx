import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Screen } from '@/components/Screen';
import { LEGAL, type LegalDoc } from '@/features/legal/content';
import { spacing } from '@/theme';

/** Informativa privacy (/legal/privacy) e Termini d'uso (/legal/terms): si leggono anche senza account. */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const page = LEGAL[(doc === 'terms' ? 'terms' : 'privacy') as LegalDoc];
  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton fallback="/" />
        <AppText variant="title">{page.title}</AppText>
        {page.sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <AppText variant="heading">{s.title}</AppText>
            {s.body.map((p, i) => (
              <AppText key={i} tone="secondary">
                {p}
              </AppText>
            ))}
          </View>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.lg, paddingBottom: spacing.xl },
  section: { gap: spacing.sm },
});
