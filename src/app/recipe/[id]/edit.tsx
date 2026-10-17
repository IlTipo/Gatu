import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { BackButton } from '@/components/BackButton';
import { RecipeForm } from '@/components/RecipeForm';
import { Screen } from '@/components/Screen';
import { ErrorState, LoadingState } from '@/components/StateViews';
import { useRecipe } from '@/features/recipes/api';
import { errorMessage } from '@/lib/errors';

export default function EditRecipeScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const recipe = useRecipe(id);

  if (recipe.isPending) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }
  if (recipe.isError) {
    return (
      <Screen>
        <BackButton />
        <ErrorState message={errorMessage(recipe.error, t)} onRetry={() => recipe.refetch()} />
      </Screen>
    );
  }
  return <RecipeForm recipe={recipe.data} />;
}
