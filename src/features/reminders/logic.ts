// Promemoria del giorno: cosa c'è in programma adesso (pranzo o cena) e cosa tirare fuori prima.

export type ReminderSlot = 'lunch' | 'dinner';

/** Il pasto a cui pensare adesso: pranzo fino alle 14:30, poi cena fino alle 21:30, poi niente. */
export function slotForNow(date: Date): ReminderSlot | null {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 14 * 60 + 30) return 'lunch';
  if (minutes < 21 * 60 + 30) return 'dinner';
  return null;
}

type Ing = { name: string; aisle: string };

/** Cose da tirare fuori in anticipo: dal freezer (surgelati) e dal frigo (carne, pesce, latticini). */
export function takeOut(ingredients: Ing[]): { freezer: string[]; fridge: string[] } {
  const uniq = (list: string[]) => [...new Set(list.map((n) => n.trim().toLowerCase()).filter(Boolean))].slice(0, 4);
  return {
    freezer: uniq(ingredients.filter((i) => i.aisle === 'surgelati').map((i) => i.name)),
    fridge: uniq(ingredients.filter((i) => i.aisle === 'carne_pesce' || i.aisle === 'latticini').map((i) => i.name)),
  };
}

export const reminderKey = (date: string, slot: ReminderSlot) => `${date}|${slot}`;
