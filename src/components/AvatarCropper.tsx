import { Image } from 'expo-image';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type GestureResponderEvent, Modal, StyleSheet, View } from 'react-native';

import { baseScale, type CropState, clampCrop, cropRect, MAX_ZOOM, MIN_ZOOM } from '@/features/profile/crop';
import type { RawPhoto } from '@/lib/photo';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Button } from './Button';
import { PressableScale } from './Motion';

const BOX = 280;
const ZOOM_STEP = 0.25;

type Props = {
  photo: RawPhoto;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (rect: { originX: number; originY: number; side: number }) => void;
};

/** Sistema la foto profilo nel cerchio: trascina per spostarla, due dita (o − +) per ingrandirla. */
export function AvatarCropper({ photo, busy, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  // gesto in corso: da dove è partito il dito (o la distanza tra due dita) e com'era la foto
  const [gesture, setGesture] = useState<{
    start: CropState;
    x0: number;
    y0: number;
    pinch: number | null;
  } | null>(null);

  const update = (next: CropState) => setCrop(clampCrop(next, photo.width, photo.height, BOX));
  const distance = (touches: { pageX: number; pageY: number }[]) =>
    touches.length >= 2 ? Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY) : null;

  const responder = {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) =>
      setGesture({
        start: crop,
        x0: e.nativeEvent.pageX,
        y0: e.nativeEvent.pageY,
        pinch: distance((e.nativeEvent.touches ?? []) as unknown as { pageX: number; pageY: number }[]),
      }),
    onResponderMove: (e: GestureResponderEvent) => {
      if (!gesture) return;
      const { pageX, pageY } = e.nativeEvent;
      const d = distance((e.nativeEvent.touches ?? []) as unknown as { pageX: number; pageY: number }[]);
      if (d !== null) {
        // due dita: la distanza tra le dita decide l'ingrandimento
        if (gesture.pinch === null) setGesture({ start: crop, x0: pageX, y0: pageY, pinch: d });
        else
          update({
            ...gesture.start,
            zoom: (gesture.start.zoom * d) / gesture.pinch,
          });
        return;
      }
      // un dito solo (o il mouse): sposta la foto; se prima erano due, si riparte da qui
      if (gesture.pinch !== null) setGesture({ start: crop, x0: pageX, y0: pageY, pinch: null });
      else
        update({
          ...gesture.start,
          x: gesture.start.x + pageX - gesture.x0,
          y: gesture.start.y + pageY - gesture.y0,
        });
    },
    onResponderRelease: () => setGesture(null),
    onResponderTerminate: () => setGesture(null),
  };

  const scale = baseScale(photo.width, photo.height, BOX) * crop.zoom;
  const w = photo.width * scale;
  const h = photo.height * scale;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <AppText variant="heading">{t('crop.title')}</AppText>
          <AppText tone="secondary" style={styles.center}>
            {t('crop.hint')}
          </AppText>

          <View style={[styles.box, { backgroundColor: colors.surfaceMuted }]} {...responder}>
            <Image
              source={{ uri: photo.uri }}
              style={{
                position: 'absolute',
                width: w,
                height: h,
                left: (BOX - w) / 2 + crop.x,
                top: (BOX - h) / 2 + crop.y,
              }}
              contentFit="fill"
              pointerEvents="none"
            />
            {/* tutto fuori dal cerchio un po' scuro: si vede subito come verrà la foto */}
            <View pointerEvents="none" style={styles.mask} />
            <View pointerEvents="none" style={[styles.ring, { borderColor: colors.onPrimary }]} />
          </View>

          <View style={styles.zoomRow}>
            <ZoomButton
              label="−"
              a11y={t('crop.zoomOut')}
              disabled={crop.zoom <= MIN_ZOOM}
              onPress={() => update({ ...crop, zoom: crop.zoom - ZOOM_STEP })}
            />
            <AppText variant="bodyStrong" style={styles.zoomValue}>
              {Math.round(crop.zoom * 100)}%
            </AppText>
            <ZoomButton
              label="+"
              a11y={t('crop.zoomIn')}
              disabled={crop.zoom >= MAX_ZOOM}
              onPress={() => update({ ...crop, zoom: crop.zoom + ZOOM_STEP })}
            />
          </View>

          <Button
            label={t('crop.use')}
            onPress={() => onConfirm(cropRect(crop, photo.width, photo.height, BOX))}
            loading={busy}
          />
          <Button label={t('common.cancel')} variant="ghost" onPress={onCancel} disabled={busy} />
        </View>
      </View>
    </Modal>
  );
}

function ZoomButton({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      scaleTo={0.88}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[
        styles.zoomButton,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          opacity: disabled ? 0.4 : 1,
        },
      ]}>
      <AppText variant="heading">{label}</AppText>
    </PressableScale>
  );
}

const MASK = 600;
const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: 'stretch',
  },
  center: { textAlign: 'center' },
  box: {
    width: BOX,
    height: BOX,
    alignSelf: 'center',
    overflow: 'hidden',
    borderRadius: radius.md,
    cursor: 'grab' as never,
  },
  // un bordo enorme e semitrasparente intorno a un buco rotondo = tutto scuro tranne il cerchio
  mask: {
    position: 'absolute',
    width: BOX + MASK * 2,
    height: BOX + MASK * 2,
    left: -MASK,
    top: -MASK,
    borderRadius: BOX / 2 + MASK,
    borderWidth: MASK,
    borderColor: 'rgba(0,0,0,0.5)',
  },
  ring: {
    position: 'absolute',
    width: BOX,
    height: BOX,
    borderRadius: BOX / 2,
    borderWidth: 2,
  },
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  zoomValue: { minWidth: 60, textAlign: 'center' },
  zoomButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
