import type { DietPlan } from './types';

// Piano appena letto dall'AI (non ancora salvato), da correggere nella pagina di modifica.
let draft: DietPlan | null = null;

export const setDietDraft = (plan: DietPlan | null) => {
  draft = plan;
};
export const takeDietDraft = (): DietPlan | null => {
  const d = draft;
  draft = null;
  return d;
};
