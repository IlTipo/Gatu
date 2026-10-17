import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/Icon';
import { useTheme } from '@/theme';

type IconName = ComponentProps<typeof Icon>['name'];

function tabIcon(name: IconName) {
  return function TabIcon({ color }: { color: ComponentProps<typeof Icon>['color'] }) {
    return <Icon name={name} size={24} color={color} />;
  };
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  // spazio per la barretta dell'iPhone (e un minimo anche dove non c'è), così le scritte non si tagliano
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // icona (28) + scritta (18) + margini del pulsante (10) + respiro sopra e sotto
          height: 68 + bottom,
          paddingTop: 6,
          paddingBottom: bottom,
        },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 12, lineHeight: 16, marginTop: 2 },
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
      <Tabs.Screen name="map" options={{ title: t('tabs.map'), tabBarIcon: tabIcon({ ios: 'map', android: 'map' }) }} />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon({ ios: 'person.crop.circle', android: 'person' }) }}
      />
    </Tabs>
  );
}
