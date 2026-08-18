import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, formatSpan } from '@/i18n/format';

import { validateCustomRange } from './customRange';
import { presetRange, type PresetId } from './range';
import { useUsageContext } from './useUsageContext';

const PRESETS: PresetId[] = [
  'today',
  'yesterday',
  'last24h',
  'last7d',
  'last30d',
  'thisCycle',
  'lastCycle',
];

/** Android's date dialog compares `minimumDate` loosely, so bound it by day. */
function startOfDay(ts: number): Date {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Chains Android's date dialog into its time dialog and returns one timestamp. */
function pickDateTime(initial: number, onDone: (ts: number) => void, minimum?: number) {
  DateTimePickerAndroid.open({
    value: new Date(initial),
    mode: 'date',
    maximumDate: new Date(),
    minimumDate: minimum === undefined ? undefined : startOfDay(minimum),
    onChange: (_, date) => {
      if (!date) return;
      DateTimePickerAndroid.open({
        value: date,
        mode: 'time',
        is24Hour: true,
        onChange: (__, time) => {
          if (!time) return;
          const merged = new Date(date);
          merged.setHours(time.getHours(), time.getMinutes(), 0, 0);
          onDone(merged.getTime());
        },
      });
    },
  });
}

/** One editable end of the range: what it is set to, tappable to change. */
function Endpoint({
  label,
  value,
  onPress,
}: {
  label: string;
  value: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${formatDateTime(value)}`}
      style={({ pressed }) => [
        styles.endpoint,
        { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="default">{formatDateTime(value)}</ThemedText>
    </Pressable>
  );
}

/**
 * Preset chips plus a custom-range sheet. The sheet edits a draft the user can
 * see in full before applying it, rather than the old blind chain of four
 * system dialogs whose result only became visible once it was already active.
 */
export function RangePicker() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { range, setRange, settings } = useUsageContext();
  const [draft, setDraft] = useState<{ start: number; end: number } | null>(null);

  const problem = draft ? validateCustomRange(draft.start, draft.end, Date.now()) : null;

  const apply = () => {
    if (!draft || problem) return;
    setRange({ ...draft, preset: 'custom' });
    setDraft(null);
    toast(
      t('range.applied', {
        from: formatDateTime(draft.start),
        to: formatDateTime(draft.end),
      })
    );
  };

  const chip = (label: string, onPress: () => void, active: boolean) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.accentMuted : 'transparent',
          borderColor: active ? theme.accent : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <ThemedText type={active ? 'smallBold' : 'small'} themeColor={active ? 'accent' : 'text'}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}>
        {PRESETS.map((id) =>
          chip(
            t(`range.${id}`),
            () => setRange(presetRange(id, Date.now(), settings?.cycleStartDay ?? 1)),
            range.preset === id
          )
        )}
        {chip(
          t('range.customChip'),
          () => setDraft({ start: range.start, end: range.end }),
          range.preset === 'custom'
        )}
      </ScrollView>

      {/* The active window in words: a chip alone never says which days it is. */}
      <ThemedText type="small" themeColor="textSecondary" style={styles.summary} numberOfLines={1}>
        {formatDateTime(range.start)} – {formatDateTime(range.end)}
      </ThemedText>

      <Modal
        visible={draft !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setDraft(null)}>
        <Pressable
          style={styles.backdrop}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={() => setDraft(null)}
        />
        <ThemedView style={styles.sheet}>
          {draft ? (
            <>
              <ThemedText type="default">{t('range.customTitle')}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('range.customHint')}
              </ThemedText>

              <Endpoint
                label={t('range.from')}
                value={draft.start}
                onPress={() =>
                  pickDateTime(draft.start, (start) => setDraft((d) => d && { ...d, start }))
                }
              />
              <Endpoint
                label={t('range.to')}
                value={draft.end}
                onPress={() =>
                  pickDateTime(
                    draft.end,
                    (end) => setDraft((d) => d && { ...d, end }),
                    draft.start
                  )
                }
              />

              {problem ? (
                <ThemedText type="small" themeColor="danger" accessibilityRole="alert">
                  {t(problem)}
                </ThemedText>
              ) : (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('range.duration', { duration: formatSpan(draft.end - draft.start) })}
                </ThemedText>
              )}

              <View style={styles.actions}>
                <Pressable
                  onPress={() => setDraft(null)}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.action,
                    { borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText type="default">{t('common.cancel')}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={apply}
                  disabled={problem !== null}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: problem !== null }}
                  style={({ pressed }) => [
                    styles.action,
                    {
                      backgroundColor: theme.accent,
                      borderColor: theme.accent,
                      opacity: problem ? 0.5 : pressed ? 0.8 : 1,
                    },
                  ]}>
                  <ThemedText type="default" themeColor="accentForeground">
                    {t('common.apply')}
                  </ThemedText>
                </Pressable>
              </View>
            </>
          ) : null}
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { gap: Spacing.two, paddingHorizontal: Spacing.three, alignItems: 'center' },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: 999,
    borderWidth: 1,
  },
  summary: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
  backdrop: { flex: 1, backgroundColor: '#00000080' },
  sheet: {
    padding: Spacing.four,
    gap: Spacing.three,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  endpoint: {
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.half,
    minHeight: 64,
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: Spacing.two },
  action: {
    flex: 1,
    minHeight: 48,
    borderRadius: Spacing.three,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
