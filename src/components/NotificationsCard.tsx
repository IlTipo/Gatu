import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { type NotificationSettings, useNotificationSettings, usePushDevice, useUpdateNotificationSettings } from '@/features/notifications/api';
import { shiftTime } from '@/features/notifications/time';
import { errorMessage } from '@/lib/errors';
import { radius, spacing, useTheme } from '@/theme';

import { AppText } from './AppText';
import { Chip } from './Chip';
import { Collapsible } from './Collapsible';
import { PressableScale } from './Motion';
import { InlineError } from './StateViews';

const STEP = 15; // minuti

/** Profilo → 🔔 Notifiche: attiva su questo dispositivo e scegli cosa ricevere, a che ora e quando no. */
export function NotificationsCard() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { state, toggle } = usePushDevice();
  const settings = useNotificationSettings();
  const update = useUpdateNotificationSettings();
  const s = settings.data;
  const set = (patch: Partial<NotificationSettings>) => update.mutate(patch);
  const device = state.data;
  const muted = !!s?.muted_until && new Date(s.muted_until) > new Date();

  const summary =
    device === 'on'
      ? muted
        ? t('push.summaryPaused')
        : t('push.summaryOn')
      : device === 'needs-install'
        ? t('push.summaryInstall')
        : t('push.summaryOff');

  const sw = (value: boolean, onChange: (v: boolean) => void, label: string) => (
    <Switch
      value={value}
      onValueChange={onChange}
      trackColor={{ true: colors.primary, false: colors.border }}
      thumbColor={colors.surface}
      accessibilityLabel={label}
    />
  );

  const row = (key: 'social' | 'meals' | 'shopping' | 'updates') => (
    <View style={styles.row} key={key}>
      <View style={styles.flex}>
        <AppText variant="bodyStrong">{t(`push.kinds.${key}`)}</AppText>
        <AppText variant="caption" tone="secondary">
          {t(`push.kinds.${key}Hint`)}
        </AppText>
      </View>
      {sw(!!s?.[key], (v) => set({ [key]: v }), t(`push.kinds.${key}`))}
    </View>
  );

  const time = (field: 'lunch_time' | 'dinner_time' | 'shopping_time' | 'quiet_start' | 'quiet_end', label: string) =>
    s ? <TimeStepper key={field} label={label} value={s[field]} onChange={(v) => set({ [field]: v })} /> : null;

  return (
    <Collapsible title={t('push.title')} summary={summary}>
      {device === 'needs-install' ? (
        <AppText tone="secondary">{t('push.needsInstall')}</AppText>
      ) : device === 'unsupported' ? (
        <AppText tone="secondary">{t('push.unsupported')}</AppText>
      ) : device === 'denied' ? (
        <AppText tone="secondary">{t('push.denied')}</AppText>
      ) : (
        <View style={styles.row}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">{t('push.thisDevice')}</AppText>
            <AppText variant="caption" tone="secondary">
              {device === 'on' ? t('push.thisDeviceOn') : t('push.thisDeviceOff')}
            </AppText>
          </View>
          {sw(device === 'on', (v) => toggle.mutate(v), t('push.thisDevice'))}
        </View>
      )}
      <InlineError message={toggle.isError ? errorMessage(toggle.error, t) : null} />

      {s ? (
        <>
          <AppText variant="caption" tone="secondary" style={styles.section}>
            {t('push.whatTitle')}
          </AppText>
          {row('social')}
          {row('meals')}
          {s.meals ? (
            <View style={styles.times}>
              {time('lunch_time', t('push.lunchAt'))}
              {time('dinner_time', t('push.dinnerAt'))}
            </View>
          ) : null}
          {row('shopping')}
          {s.shopping ? <View style={styles.times}>{time('shopping_time', t('push.shoppingAt'))}</View> : null}
          {row('updates')}

          <AppText variant="caption" tone="secondary" style={styles.section}>
            {t('push.quietTitle')}
          </AppText>
          <View style={styles.row}>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{t('push.quiet')}</AppText>
              <AppText variant="caption" tone="secondary">
                {t('push.quietHint')}
              </AppText>
            </View>
            {sw(s.quiet_enabled, (v) => set({ quiet_enabled: v }), t('push.quiet'))}
          </View>
          {s.quiet_enabled ? (
            <View style={styles.times}>
              {time('quiet_start', t('push.quietFrom'))}
              {time('quiet_end', t('push.quietTo'))}
            </View>
          ) : null}

          <AppText variant="bodyStrong">{t('push.pause')}</AppText>
          {muted ? (
            <View style={styles.row}>
              <AppText tone="secondary" style={styles.flex}>
                {t('push.pausedUntil', {
                  date: new Date(s.muted_until!).toLocaleString('it-IT', { weekday: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
                })}
              </AppText>
              <Chip label={t('push.resume')} selected onPress={() => set({ muted_until: null })} />
            </View>
          ) : (
            <View style={styles.chips}>
              <Chip label={t('push.pauseDay')} onPress={() => set({ muted_until: new Date(Date.now() + 86_400_000).toISOString() })} />
              <Chip label={t('push.pauseWeek')} onPress={() => set({ muted_until: new Date(Date.now() + 7 * 86_400_000).toISOString() })} />
            </View>
          )}
        </>
      ) : null}
      <InlineError message={update.isError ? errorMessage(update.error, t) : settings.isError ? errorMessage(settings.error, t) : null} />
    </Collapsible>
  );
}

/** Orario con − e + (15 minuti alla volta). */
function TimeStepper({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const button = (delta: number, symbol: string, a11y: string) => (
    <PressableScale
      onPress={() => onChange(shiftTime(value, delta))}
      accessibilityRole="button"
      accessibilityLabel={`${a11y} ${label}`}
      hitSlop={6}
      style={[styles.step, { backgroundColor: colors.surfaceMuted }]}>
      <AppText variant="bodyStrong">{symbol}</AppText>
    </PressableScale>
  );
  return (
    <View style={styles.timeRow}>
      <AppText style={styles.flex}>{label}</AppText>
      {button(-STEP, '−', t('push.earlier'))}
      <AppText variant="bodyStrong" style={styles.time}>
        {value.slice(0, 5)}
      </AppText>
      {button(STEP, '+', t('push.later'))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  section: { marginTop: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  times: { gap: spacing.xs, paddingLeft: spacing.md },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  step: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  time: { minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
});
