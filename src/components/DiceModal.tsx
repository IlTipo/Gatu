import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import type { LibraryRecipe } from '@/features/library/filter';
import { pickRandom } from '@/features/library/pantry';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { RecipeCard } from './RecipeCard';

/** "Che cucino stasera?": pesca una ricetta a caso tra quelle passate. */
export function DiceModal({ recipes, onClose }: { recipes: LibraryRecipe[]; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [current, setCurrent] = useState(() => pickRandom(recipes, null));

  const open = () => {
    if (!current) return;
    onClose();
    router.push({ pathname: '/recipe/[id]', params: { id: current.id } });
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityLabel={t('dice.close')}>
        {/* il riquadro intercetta i tocchi: toccare fuori chiude */}
        <Pressable style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <AppText variant="heading">{t('dice.title')}</AppText>
          {current ? (
            <>
              <View style={styles.card}>
                <RecipeCard key={current.id} recipe={current} onPress={open} />
              </View>
              <Button label={t('dice.open')} onPress={open} />
              {recipes.length > 1 ? (
                <Button
                  label={t('dice.again')}
                  variant="secondary"
                  onPress={() => setCurrent(pickRandom(recipes, current.id))}
                />
              ) : null}
              <AppText variant="caption" tone="secondary">
                {t('dice.filtersNote')}
              </AppText>
            </>
          ) : (
            <AppText tone="secondary">{t('dice.none')}</AppText>
          )}
          <Button label={t('dice.close')} variant="ghost" onPress={onClose} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  sheet: { width: '100%', maxWidth: 380, gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  card: { width: '62%', alignSelf: 'center' },
});
