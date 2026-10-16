export type ItemStatus = 'to_try' | 'tried';

export type Ingredient = {
  id: string;
  position: number;
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  aisle: string;
  /** true se la dose è stata stimata dall'AI (non era scritta nella ricetta). */
  estimated: boolean;
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
  servings_estimated: boolean;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  status: ItemStatus;
  rating: number | null;
  notes: string | null;
  created_at: string;
  // stime indicative per porzione (AI o scheda del sito)
  kcal_per_serving: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  difficulty: 'facile' | 'media' | 'difficile' | null;
  cost_level: number | null;
  insights_at: string | null;
};

export type VariantKind = 'vegana' | 'vegetariana' | 'senza_glutine' | 'senza_lattosio' | 'light' | 'veloce';

/** Variante proposta dall'AI (non ancora salvata). */
export type RecipeVariant = {
  kind: VariantKind;
  title: string;
  changes: string[];
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  image_url: string | null;
  description: string | null;
  ingredients: { quantity: number | null; unit: string | null; name: string; note: string | null; aisle: string; estimated: boolean }[];
  steps: { text: string; timer_seconds: number | null }[];
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
  servings_estimated: boolean;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  ingredients: {
    quantity: number | null;
    unit: string | null;
    name: string;
    note: string | null;
    aisle: string;
    estimated: boolean;
  }[];
  steps: { text: string; timer_seconds: number | null }[];
};
