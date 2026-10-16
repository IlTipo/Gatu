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
  created_at: string;
};

export type PlaceDraft = Pick<Place, 'name' | 'city' | 'address' | 'cuisine' | 'price_level' | 'recommended_dishes'>;
