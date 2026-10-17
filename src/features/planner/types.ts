import type { Slot } from './dates';

export type MealEntry = {
  id: string;
  date: string;
  slot: Slot;
  recipe_id: string;
  servings: number | null;
  position: number;
  created_at: string;
};

export type NewMeal = { date: string; slot: Slot; recipeId: string; servings: number | null };
