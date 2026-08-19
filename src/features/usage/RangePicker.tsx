import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Calendar, CalendarRange, Clock, X } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
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
        {
          borderColor: theme.border,
          backgroundColor: theme.card,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <View style={styles.endpointHeader}>
        <Clock size={14} color={theme.textSecondary} />
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
      <ThemedText type="default" style={styles.endpointValue}>
        {formatDateTime(value)}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Preset chips plus a custom-range sheet with sleek Shadcn UI styling.
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

  const chip = (label: string, onPress: () => void, active: boolean, isCustom = false) => (
    <Pressable
      key={label}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? theme.accentMuted : theme.card,
          borderColor: active ? theme.accent : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      {isCustom ? (
        <CalendarRange size={13} color={active ? theme.accent : theme.textSecondary} />
      ) : null}
      <ThemedText
        type={active ? 'smallBold' : 'small'}
        themeColor={active ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <View style={styles.container}>
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
          range.preset === 'custom',
          true
        )}
      </ScrollView>

      {/* The active window in words with calendar icon */}
      <View style={styles.summaryContainer}>
        <Calendar size={13} color={theme.textSecondary} />
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.summary}
          numberOfLines={1}>
          {formatDateTime(range.start)} – {formatDateTime(range.end)}
        </ThemedText>
      </View>

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
        <ThemedView type="card" style={[styles.sheet, { borderColor: theme.border }]}>
          {draft ? (
            <>
              <View style={styles.sheetHeader}>
                <View style={styles.sheetTitleGroup}>
                  <CalendarRange size={20} color={theme.accent} />
                  <ThemedText type="default" style={styles.sheetTitle}>
                    {t('range.customTitle')}
                  </ThemedText>
                </View>
                <Pressable
                  onPress={() => setDraft(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}>
                  <X size={20} color={theme.textSecondary} />
                </Pressable>
              </View>

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
                <Button
                  variant="outline"
                  title={t('common.cancel')}
                  onPress={() => setDraft(null)}
                  style={styles.actionBtn}
                />
                <Button
                  variant="default"
                  title={t('common.apply')}
                  onPress={apply}
                  disabled={problem !== null}
                  style={styles.actionBtn}
                />
              </View>
            </>
          ) : null}
        </ThemedView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  chipRow: {
    gap: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  summaryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.one,
  },
  summary: {
    flex: 1,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
  sheet: {
    padding: Spacing.four,
    gap: Spacing.three,
    borderTopLeftRadius: Radius['2xl'],
    borderTopRightRadius: Radius['2xl'],
    borderTopWidth: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sheetTitle: {
    fontWeight: '700',
    fontSize: 18,
  },
  endpoint: {
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
    gap: Spacing.half,
    minHeight: 60,
    justifyContent: 'center',
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  endpointValue: {
    fontWeight: '600',
  },
  actions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  actionBtn: {
    flex: 1,
  },
});
