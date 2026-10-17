import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { useMyProfile } from '@/features/social/api';
import { useUnreadCount } from '@/features/social/network';
import { useNews, useUpdateState } from '@/lib/updates';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Icon>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color, focused }: { color: ComponentProps<typeof Icon>['color']; focused: boolean }) {
    return <TabIconPill name={name} color={color} focused={focused} />;
  };
}

/** Icona della scheda; quella attiva ha dietro una "pillola" colorata, così si vede subito dove sei. */
function TabIconPill({ name, color, focused }: { name: IconName; color: ComponentProps<typeof Icon>['color']; focused: boolean }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        focused && { backgroundColor: scheme === 'dark' ? 'rgba(240,122,74,0.18)' : 'rgba(224,89,42,0.12)' },
      ]}>
      <Icon name={name} size={22} color={focused ? colors.primary : color} />
    </View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors, scheme } = useTheme();
  // spazio per la barretta dell'iPhone (e un minimo anche dove non c'è), così le scritte non si tagliano
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  // pallino sul Profilo: versione nuova disponibile o novità ancora da leggere
  const update = useUpdateState();
  const news = useNews();
  const profileBadge = update.kind === 'version' || news ? '1' : undefined;
  // la parte social ha bisogno di uno username: chi non l'ha ancora scelto lo sceglie subito
  const me = useMyProfile();
  const unread = useUnreadCount(!!me.data?.username);
  if (me.data && !me.data.username) return <Redirect href="/username" />;
  const socialBadge = unread.data ? (unread.data > 9 ? '9+' : String(unread.data)) : undefined;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          // icona con pillola (32) + scritta (16) + respiro sopra e sotto, più la barretta dell'iPhone
          height: 64 + bottom,
          paddingTop: 6,
          paddingBottom: bottom,
          paddingHorizontal: 4,
          // ombra leggera: la barra si stacca dal contenuto che scorre sotto
          shadowColor: colors.shadow,
          shadowOpacity: scheme === 'dark' ? 0.4 : 0.08,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: -2 },
          elevation: 8,
        },
        // tutte le schede larghe uguali, icona e scritta centrate
        tabBarItemStyle: { flex: 1, paddingVertical: 0, justifyContent: 'center', alignItems: 'center' },
        tabBarIconStyle: { marginBottom: 0 },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11, lineHeight: 14, marginTop: 2 },
        tabBarAllowFontScaling: false,
      }}>
      <Tabs.Screen
        name="library"
        options={{ title: t('tabs.library'), tabBarIcon: tabIcon({ ios: 'book', android: 'menu_book' }) }}
      />
      <Tabs.Screen
        name="fridge"
        options={{ title: t('tabs.fridge'), tabBarIcon: tabIcon({ ios: 'refrigerator', android: 'kitchen' }) }}
      />
      <Tabs.Screen
        name="planner"
        options={{ title: t('tabs.planner'), tabBarIcon: tabIcon({ ios: 'calendar', android: 'calendar_month' }) }}
      />
      <Tabs.Screen
        name="shopping"
        options={{ title: t('tabs.shopping'), tabBarIcon: tabIcon({ ios: 'cart', android: 'shopping_cart' }) }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: t('tabs.social'),
          tabBarIcon: tabIcon({ ios: 'person.2', android: 'group' }),
          tabBarBadge: socialBadge,
          tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.onPrimary },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabs.profile'),
          tabBarIcon: tabIcon({ ios: 'person.crop.circle', android: 'person' }),
          tabBarBadge: profileBadge,
          tabBarBadgeStyle: { backgroundColor: colors.primary, color: colors.onPrimary },
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  pill: { width: 48, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
});
