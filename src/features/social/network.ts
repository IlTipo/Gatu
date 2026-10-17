import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invokeExtract } from '@/features/sources/api';
import { supabase } from '@/lib/supabase';

// Parte social: persone, seguire, Novità, mi piace, commenti, notifiche.
// Tutto passa da funzioni del database che controllano chi può vedere cosa.

export type Following = 'none' | 'pending' | 'accepted';
export type PersonCard = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_public: boolean;
  following: Following;
  is_friend: boolean;
};
export type Person = PersonCard & {
  bio: string | null;
  is_me: boolean;
  follows_me: boolean;
  can_view: boolean;
  recipes_count: number;
  followers_count: number;
  following_count: number;
  recipes: { id: string; title: string; image_url: string | null; created_at: string; likes: number }[];
};
export type FeedPost = {
  id: string;
  title: string;
  image_url: string | null;
  total_minutes: number | null;
  kcal_per_serving: number | null;
  homemade: boolean;
  created_at: string;
  author_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  likes: number;
  comments: number;
  liked: boolean;
};
export type Comment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  can_delete: boolean;
};
export type RecipeSocial = { likes: number; liked: boolean; comments: Comment[] };
export type Notification = {
  id: string;
  kind: 'like' | 'comment' | 'follow' | 'follow_request' | 'follow_accepted' | 'friend_request';
  read: boolean;
  created_at: string;
  recipe_id: string | null;
  recipe_title: string | null;
  comment: string | null;
  actor_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

const rpc = async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
};

export const socialKeys = {
  person: (id: string) => ['person', id] as const,
  search: (q: string) => ['people-search', q] as const,
  feed: ['social-feed'] as const,
  requests: ['follow-requests'] as const,
  recipe: (id: string) => ['recipe-social', id] as const,
  notifications: ['notifications'] as const,
  unread: ['notifications', 'unread'] as const,
};

/** Dopo un segui/smetti: si aggiornano profili, ricerca, Novità e richieste. */
function useRefreshPeople() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [['person'], ['people-search'], socialKeys.feed, socialKeys.requests, ['friends-recipes']]) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

export function useUsernameAvailable(username: string, enabled: boolean) {
  return useQuery({
    queryKey: ['username-available', username],
    enabled,
    staleTime: 10_000,
    queryFn: () => rpc<boolean>('username_available', { p_username: username }),
  });
}

export function useSearchPeople(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: socialKeys.search(q),
    enabled: q.replace(/^@/, '').length >= 2,
    staleTime: 30_000,
    queryFn: () => rpc<PersonCard[]>('search_people', { p_query: q }),
  });
}

/** Profilo di una persona ("me" = il mio). */
export function usePerson(id: string) {
  return useQuery({
    queryKey: socialKeys.person(id),
    queryFn: () => rpc<Person>('get_person', { p_user: id === 'me' ? null : id }),
  });
}

export function useFollow() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (userId: string) => rpc<'following' | 'requested' | 'already' | 'self' | 'limit'>('follow_user', { p_user: userId }),
    onSettled: refresh,
  });
}

export function useUnfollow() {
  const refresh = useRefreshPeople();
  return useMutation({ mutationFn: (userId: string) => rpc<void>('unfollow_user', { p_user: userId }), onSettled: refresh });
}

export function useFollowRequests() {
  return useQuery({ queryKey: socialKeys.requests, queryFn: () => rpc<PersonCard[]>('follow_requests'), refetchInterval: 30_000 });
}

export function useRespondFollow() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: ({ userId, accept }: { userId: string; accept: boolean }) =>
      rpc<void>('respond_follow', { p_follower: userId, p_accept: accept }),
    onSettled: refresh,
  });
}

/** "Novità": le ultime ricette di chi segui e dei tuoi amici, 20 alla volta. */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: socialKeys.feed,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => rpc<FeedPost[]>('social_feed', { p_before: pageParam, p_limit: 20 }),
    getNextPageParam: (last) => (last.length === 20 ? last[last.length - 1].created_at : undefined),
  });
}

export function useRecipeSocial(recipeId: string, enabled = true) {
  return useQuery({
    queryKey: socialKeys.recipe(recipeId),
    enabled,
    queryFn: () => rpc<RecipeSocial>('recipe_social', { p_recipe: recipeId }),
  });
}

/** ❤️: si accende subito, poi il server conferma. */
export function useToggleLike(recipeId: string) {
  const queryClient = useQueryClient();
  const key = socialKeys.recipe(recipeId);
  return useMutation({
    mutationFn: () => rpc<boolean>('toggle_like', { p_recipe: recipeId }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<RecipeSocial>(key);
      if (previous) {
        queryClient.setQueryData<RecipeSocial>(key, {
          ...previous,
          liked: !previous.liked,
          likes: previous.likes + (previous.liked ? -1 : 1),
        });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: socialKeys.feed });
    },
  });
}

export function useAddComment(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => rpc<string>('add_comment', { p_recipe: recipeId, p_body: body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: socialKeys.recipe(recipeId) });
      queryClient.invalidateQueries({ queryKey: socialKeys.feed });
    },
  });
}

export function useDeleteComment(recipeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => rpc<void>('delete_comment', { p_comment: commentId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: socialKeys.recipe(recipeId) }),
  });
}

export function useReportComment() {
  return useMutation({
    mutationFn: ({ commentId, reason }: { commentId: string; reason: string }) =>
      invokeExtract<{ status: 'sent' | 'saved' }>({ action: 'report_comment', commentId, reason }),
  });
}

export function useNotifications() {
  return useQuery({ queryKey: socialKeys.notifications, queryFn: () => rpc<Notification[]>('my_notifications') });
}

/** Numero delle notifiche non lette (per il cuoricino), aggiornato ogni 30 secondi. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: socialKeys.unread,
    enabled,
    refetchInterval: 30_000,
    queryFn: () => rpc<number>('unread_notifications'),
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => rpc<void>('mark_notifications_read'),
    onSuccess: () => queryClient.setQueryData(socialKeys.unread, 0),
  });
}
