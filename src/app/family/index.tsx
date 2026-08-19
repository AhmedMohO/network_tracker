import { Stack, useRouter } from 'expo-router';
import { AlertCircle, ChevronRight, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { isTodayHeartbeat, TodayTotals } from '@/features/family/TodayTotals';
import type { ChildDevice } from '@/features/family/useChildren';
import { useChildren } from '@/features/family/useChildren';
import { useFamily } from '@/features/family/useFamily';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime, formatDay } from '@/i18n/format';

function ChildRow({ child, onPress }: { child: ChildDevice; onPress: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const when = child.lastSeen > 0 ? formatDateTime(child.lastSeen) : t('family.neverCheckedIn');

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('family.childRowA11y', { label: child.label, when })}
      accessibilityHint={t('family.childRowHint')}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.card, borderColor: theme.border },
      ]}>
      <View style={styles.rowBody}>
        <ThemedText type="default" numberOfLines={1} style={styles.rowLabel}>
          {child.label}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {child.lastSeen > 0 ? t('family.lastSeen', { when }) : when}
        </ThemedText>
        {child.recent && isTodayHeartbeat(child.recent.at) ? (
          <TodayTotals recent={child.recent} serverAt={child.recentServerAt} />
        ) : null}
      </View>
      <ChevronRight size={16} color={theme.textSecondary} style={{ opacity: 0.6 }} />
    </Pressable>
  );
}

export default function FamilyScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const { role } = useFamily();
  const { settings } = useUsageContext();
  const { children, loading } = useChildren();

  if (role !== 'parent') {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: t('family.listTitle') }} />
        <SafeAreaView edges={['top']} style={styles.safeArea}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.parentOnly}>
            {t('family.parentOnly')}
          </ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: t('family.listTitle') }} />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        {/* Screen-level: this device cannot reach the backend at all, which
            would otherwise make every child below look silently stale. */}
        {settings?.lastSyncErrorAt != null ? (
          <View
            style={[
              styles.banner,
              { backgroundColor: theme.card, borderColor: theme.destructive + '55' },
            ]}
            accessibilityRole="alert">
            <AlertCircle size={18} color={theme.destructive} />
            <View style={styles.bannerText}>
              <ThemedText type="smallBold" themeColor="destructive">
                {t('family.syncBrokenTitle')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('family.syncBrokenBody', { date: formatDay(settings.lastSyncErrorAt) })}
              </ThemedText>
            </View>
          </View>
        ) : null}

        {loading && children.length === 0 ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={theme.accent} accessibilityLabel={t('common.loading')} />
          </View>
        ) : (
          <FlatList
            data={children}
            keyExtractor={(c) => c.deviceId}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <ChildRow child={item} onPress={() => router.push(`/family/${item.deviceId}`)} />
            )}
            ListEmptyComponent={
              <Card style={styles.empty}>
                <Users size={32} color={theme.textSecondary} style={{ opacity: 0.6 }} />
                <ThemedText type="default" style={styles.emptyTitle}>
                  {t('family.emptyChildrenTitle')}
                </ThemedText>
                <Button
                  variant="outline"
                  title={t('family.emptyChildrenAction')}
                  onPress={() => router.push('/settings')}
                  accessibilityLabel={t('family.emptyChildrenAction')}
                />
              </Card>
            }
          />
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: {
    flex: 1,
    gap: Spacing.three,
    paddingTop: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  parentOnly: {
    padding: Spacing.four,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  bannerText: { flex: 1, gap: 2 },
  loadingBox: {
    paddingVertical: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1,
    gap: Spacing.two,
  },
  rowBody: { flex: 1, gap: 4 },
  rowLabel: { fontWeight: '600', fontSize: 15 },
  empty: {
    padding: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  emptyTitle: { fontWeight: '600', textAlign: 'center' },
});
