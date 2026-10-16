export type ItemStatus = 'to_try' | 'tried';

export type Ingredient = {
  id: string;
  position: number;
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  aisle: string;
};

export type Step = {
  id: string;
  position: number;
  text: string;
  timer_seconds: number | null;
};

export type Recipe = {
  id: string;
  source_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  status: ItemStatus;
  rating: number | null;
  notes: string | null;
  created_at: string;
};

export type RecipeWithDetails = Recipe & {
  recipe_ingredients: Ingredient[];
  recipe_steps: Step[];
  sources: { url: string; platform: string } | null;
};

/** Dati modificabili a mano (stessa forma attesa dalla funzione update_recipe). */
export type RecipeDraft = {
  title: string;
  description: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  ingredients: { quantity: number | null; unit: string | null; name: string; note: string | null; aisle: string }[];
  steps: { text: string; timer_seconds: number | null }[];
};
