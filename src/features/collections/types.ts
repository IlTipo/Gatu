import type { CollectionRules } from './rules';

export type Collection = {
  id: string;
  name: string;
  emoji: string | null;
  position: number;
  created_at: string;
  /** se presente la collezione è automatica: si riempie da sola con queste regole */
  rules: CollectionRules | null;
  /** ricette e posti contenuti */
  recipeIds: string[];
  placeIds: string[];
};

export type CollectionDraft = { name: string; emoji: string | null; rules?: CollectionRules | null };

/** Una ricetta o un posto da mettere in una collezione. */
export type CollectionTarget = { recipeId: string } | { placeId: string };

export const COLLECTION_EMOJIS = ['📁', '🍝', '🍕', '🥗', '🍰', '🥘', '🍣', '🌶️', '🍷', '☕', '🏖️', '❤️', '⭐', '🎉'];
