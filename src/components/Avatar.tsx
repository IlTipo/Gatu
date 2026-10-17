import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';

import { AppText } from './AppText';
import { AvatarViewer } from './AvatarViewer';

type Props = {
  url: string | null | undefined;
  name: string | null | undefined;
  size?: number;
  /** tocco sulla foto → si apre in grande e si può ingrandire */
  zoomable?: boolean;
};

/** Foto profilo rotonda; senza foto mostra l'iniziale del nome. */
export function Avatar({ url, name, size = 48, zoomable }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const circle = <AvatarCircle url={url} name={name} size={size} />;
  if (!zoomable || !url) return circle;
  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="imagebutton" accessibilityLabel={t('avatar.open', { name: name ?? '' })} hitSlop={4}>
        {circle}
      </Pressable>
      {open ? <AvatarViewer url={url} name={name} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function AvatarCircle({ url, name, size }: { url: string | null | undefined; name: string | null | undefined; size: number }) {
  const { colors } = useTheme();
  const initial = (name?.trim()[0] ?? '?').toUpperCase();
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: url ? colors.surfaceMuted : colors.primary },
      ]}>
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <AppText tone="onPrimary" style={{ fontSize: size * 0.42, lineHeight: size * 0.5, fontWeight: '700' }}>
          {initial}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
