import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { validateCustomRange } from './customRange';
import { presetRange, type PresetId } from './range';
import { useUsageContext } from './useUsageContext';

const CUSTOM_LABEL = 'Custom';

// Labels are identical to the ones `presetRange` puts on the Range it returns,
// which is what makes the `range.label` comparison below a valid active check.
const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last24h', label: 'Last 24 hours' },
  { id: 'last7d', label: 'Last 7 days' },
  { id: 'last30d', label: 'Last 30 days' },
  { id: 'thisCycle', label: 'This cycle' },
  { id: 'lastCycle', label: 'Last cycle' },
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

export function RangePicker() {
  const theme = useTheme();
  const { range, setRange, settings } = useUsageContext();
  const [error, setError] = useState<string | null>(null);

  const applyCustom = (start: number, end: number) => {
    const problem = validateCustomRange(start, end, Date.now());
    setError(problem);
    if (problem) return;
    setRange({ start, end, label: CUSTOM_LABEL });
  };

  // The end dialog opens on the start the user just picked and cannot go
  // below it, so the pair can never come back reversed.
  const startCustom = () =>
    pickDateTime(range.start, (start) =>
      pickDateTime(start, (end) => applyCustom(start, end), start)
    );

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
        {PRESETS.map((p) =>
          chip(
            p.label,
            () => {
              setError(null);
              setRange(presetRange(p.id, Date.now(), settings?.cycleStartDay ?? 1));
            },
            range.label === p.label
          )
        )}
        {chip('Custom…', startCustom, range.label === CUSTOM_LABEL)}
      </ScrollView>
      {error ? (
        <ThemedText type="small" themeColor="danger" style={styles.error} accessibilityRole="alert">
          {error}
        </ThemedText>
      ) : null}
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
  error: { paddingHorizontal: Spacing.three, paddingTop: Spacing.two },
});
