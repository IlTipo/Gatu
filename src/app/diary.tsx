import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { CaloriesPanel } from '@/components/CaloriesPanel';
import { Screen } from '@/components/Screen';
import { spacing } from '@/theme';

/** 🔥 Calorie: il diario di cosa hai mangiato, con obiettivi e stime dell'AI. */
export default function DiaryScreen() {
  const { t } = useTranslation();
  return (
    <Screen scroll>
      <View style={styles.container}>
        <BackButton />
        <AppText variant="title">{t('diary.title')}</AppText>
        <CaloriesPanel />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ container: { gap: spacing.lg, paddingBottom: spacing.xl } });
