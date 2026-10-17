import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { recipeKeys } from '@/features/recipes/api';
import { invokeExtract } from '@/features/sources/api';
import { pickRecipePhoto } from '@/lib/photo';
import { supabase } from '@/lib/supabase';

export type MyProfile = {
  display_name: string | null;
  avatar_url: string | null;
  friend_code: string;
  share_cooking: boolean;
  share_planner: boolean;
  share_diary: boolean;
};
type ProfilePatch = Partial<Pick<MyProfile, 'display_name' | 'avatar_url' | 'share_cooking' | 'share_planner' | 'share_diary'>>;

export type Friend = {
  id: string; // id dell'amicizia
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  status: 'pending' | 'accepted';
  incoming: boolean;
};

export type FriendFeed = {
  display_name: string | null;
  avatar_url: string | null;
  share_cooking: boolean;
  share_planner: boolean;
  share_diary: boolean;
  cooked: { id: string; title: string; image_url: string | null; rating: number | null; last_cooked_at: string; kcal_per_serving: number | null }[] | null;
  planner: { date: string; slot: 'lunch' | 'dinner'; recipe_id: string; title: string; image_url: string | null }[] | null;
  diary: { slot: string; name: string; kcal: number; protein_g: number | null; created_at: string }[] | null;
};

export type FriendRecipe = {
  title: string;
  description: string | null;
  image_url: string | null;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  tags: string[];
  kcal_per_serving: number | null;
  ingredients: { quantity: number | null; unit: string | null; name: string; note: string | null; aisle: string; estimated: boolean }[];
  steps: { text: string; timer_seconds: number | null }[];
};

const keys = {
  me: (uid?: string) => ['my-profile', uid] as const,
  friends: ['friends'] as const,
  feed: (id: string, day: string) => ['friend-feed', id, day] as const,
  recipe: (id: string) => ['friend-recipe', id] as const,
};

/** Il mio profilo: nome, foto, codice amico e cosa condivido con gli amici. */
export function useMyProfile() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: keys.me(uid),
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('display_name, avatar_url, friend_code, share_cooking, share_planner, share_diary')
        .eq('id', uid!)
        .single();
      if (error) throw error;
      return data as MyProfile;
    },
  });
}

export function useUpdateMyProfile() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const uid = session?.user.id;
  const key = keys.me(uid);
  return useMutation({
    mutationFn: async (patch: ProfilePatch) => {
      if (!uid) throw new Error('not signed in');
      const { error } = await supabase.from('profiles').update(patch).eq('id', uid);
      if (error) throw error;
    },
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<MyProfile>(key);
      if (previous) queryClient.setQueryData(key, { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _p, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Sceglie una foto, la rimpicciolisce (512 px) e la mette come foto profilo. false se annullato. */
export function useChangeAvatar() {
  const update = useUpdateMyProfile();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async (previousUrl: string | null) => {
      const uid = session?.user.id;
      if (!uid) throw new Error('not signed in');
      const photo = await pickRecipePhoto(512);
      if (!photo) return false;
      const bytes = Uint8Array.from(atob(photo.base64), (c) => c.charCodeAt(0));
      const path = `${uid}/avatar-${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('images').upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
      if (error) throw error;
      const url = supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
      await update.mutateAsync({ avatar_url: url });
      // la foto vecchia non serve più
      const old = previousUrl?.split('/object/public/images/')[1];
      if (old?.startsWith(`${uid}/avatar-`)) await supabase.storage.from('images').remove([old]).then(
        () => {},
        () => {},
      );
      return true;
    },
  });
}

export type FeedbackResult = { status: 'sent' | 'saved' };

/** "Cosa aggiungeresti?": il consiglio arriva per email a chi gestisce Morso. */
export function useSendFeedback() {
  return useMutation({
    mutationFn: (message: string) => invokeExtract<FeedbackResult>({ action: 'send_feedback', message }),
  });
}

export function useFriends() {
  return useQuery({
    queryKey: keys.friends,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_friends');
      if (error) throw error;
      return data as Friend[];
    },
  });
}

export type FriendRequestResult = 'sent' | 'accepted' | 'already' | 'not_found' | 'self' | 'limit';

export function useSendFriendRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc('send_friend_request', { p_code: code });
      if (error) throw error;
      return data as FriendRequestResult;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.friends }),
  });
}

export function useRespondFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc('respond_friend_request', { p_id: id, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.friends }),
  });
}

export function useRemoveFriend() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('remove_friend', { p_id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.friends }),
  });
}

/** Cosa condivide un amico (ricette cucinate, planner della settimana da `day`, diario di `day`). */
export function useFriendFeed(userId: string, day: string) {
  return useQuery({
    queryKey: keys.feed(userId, day),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('friend_feed', { p_user: userId, p_day: day });
      if (error) throw error;
      return data as FriendFeed;
    },
  });
}

export function useFriendRecipe(recipeId: string) {
  return useQuery({
    queryKey: keys.recipe(recipeId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('friend_recipe', { p_recipe: recipeId });
      if (error) throw error;
      return data as FriendRecipe;
    },
  });
}

/** Salva nella MIA libreria una copia della ricetta di un amico. */
export function useCopyFriendRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recipe: FriendRecipe) => {
      const { kcal_per_serving: _k, ...rest } = recipe;
      const { data, error } = await supabase.rpc('create_recipe', { p_recipe: rest });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recipeKeys.all }),
  });
}
