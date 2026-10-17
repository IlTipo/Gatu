import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { PressableScale } from './Motion';

const MAX_ZOOM = 4;
type Point = { pageX: number; pageY: number };

/** Foto profilo in grande: due dita o − + per ingrandire, trascina per guardarla; tocca fuori per chiudere. */
export function AvatarViewer({ url, name, onClose }: { url: string; name: string | null | undefined; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const size = Math.min(width - spacing.lg * 2, 420);
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const [gesture, setGesture] = useState<{ start: typeof view; x0: number; y0: number; pinch: number | null } | null>(null);

  const clamp = (v: typeof view) => {
    const zoom = Math.min(MAX_ZOOM, Math.max(1, v.zoom));
    const max = (size * zoom - size) / 2;
    return { zoom, x: Math.min(max, Math.max(-max, v.x)), y: Math.min(max, Math.max(-max, v.y)) };
  };
  const touches = (e: GestureResponderEvent) => (e.nativeEvent.touches ?? []) as unknown as Point[];
  const distance = (list: Point[]) => (list.length >= 2 ? Math.hypot(list[0].pageX - list[1].pageX, list[0].pageY - list[1].pageY) : null);

  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) =>
      setGesture({ start: view, x0: e.nativeEvent.pageX, y0: e.nativeEvent.pageY, pinch: distance(touches(e)) }),
    onResponderMove: (e: GestureResponderEvent) => {
      if (!gesture) return;
      const { pageX, pageY } = e.nativeEvent;
      const d = distance(touches(e));
      if (d !== null) {
        if (gesture.pinch === null) setGesture({ start: view, x0: pageX, y0: pageY, pinch: d });
        else setView(clamp({ ...gesture.start, zoom: (gesture.start.zoom * d) / gesture.pinch }));
        return;
      }
      if (gesture.pinch !== null) setGesture({ start: view, x0: pageX, y0: pageY, pinch: null });
      else setView(clamp({ ...gesture.start, x: gesture.start.x + pageX - gesture.x0, y: gesture.start.y + pageY - gesture.y0 }));
    },
    onResponderRelease: () => setGesture(null),
    onResponderTerminate: () => setGesture(null),
  };

  const big = size * view.zoom;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('avatar.close')}>
        {/* toccare la foto non chiude: serve a spostarla */}
        <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2, borderColor: colors.surface }]} {...responder}>
          <Image
            source={{ uri: url }}
            style={{ position: 'absolute', width: big, height: big, left: (size - big) / 2 + view.x, top: (size - big) / 2 + view.y }}
            contentFit="cover"
            pointerEvents="none"
          />
        </View>
        {name ? (
          <AppText variant="heading" style={styles.name}>
            {name}
          </AppText>
        ) : null}
        <View style={styles.zoomRow}>
          <ZoomButton label="−" a11y={t('crop.zoomOut')} disabled={view.zoom <= 1} onPress={() => setView(clamp({ ...view, zoom: view.zoom - 0.5 }))} />
          <ZoomButton label="+" a11y={t('crop.zoomIn')} disabled={view.zoom >= MAX_ZOOM} onPress={() => setView(clamp({ ...view, zoom: view.zoom + 0.5 }))} />
        </View>
      </Pressable>
    </Modal>
  );
}

function ZoomButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled: boolean }) {
  return (
    <PressableScale
      scaleTo={0.88}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[styles.zoomButton, { opacity: disabled ? 0.4 : 1 }]}>
      <AppText variant="heading" style={styles.light}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.lg },
  circle: { overflow: 'hidden', borderWidth: 3, cursor: 'grab' as never },
  name: { color: '#FFFFFF', textAlign: 'center' },
  light: { color: '#FFFFFF' },
  zoomRow: { flexDirection: 'row', gap: spacing.lg },
  zoomButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
