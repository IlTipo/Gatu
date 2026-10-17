import type { ItemStatus } from '../recipes/types';

export type Place = {
  id: string;
  source_id: string | null;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  google_place_id: string | null;
  verified: boolean;
  cuisine: string | null;
  price_level: number | null;
  recommended_dishes: string[];
  image_url: string | null;
  status: ItemStatus;
  rating: number | null;
  notes: string | null;
  visited_at: string | null;
  created_at: string;
  phone: string | null;
  website: string | null;
  /** formato OpenStreetMap ("Mo-Sa 12:00-15:00") o righe di Google separate da "; " */
  opening_hours: string | null;
  /** nella lista "Voglio andarci" */
  wishlist: boolean;
};

export type PlaceDraft = Pick<Place, 'name' | 'city' | 'address' | 'cuisine' | 'price_level' | 'recommended_dishes'>;
