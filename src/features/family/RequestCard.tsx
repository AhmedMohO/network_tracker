import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Radius, Spacing } from '@/constants/theme';
import { useLimitStatus } from '@/features/limits/useLimitStatus';
import { formatBytes } from '@/features/usage/format';
import { saveSettings } from '@/features/usage/settings';
import { useUsageContext } from '@/features/usage/useUsageContext';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

import { suggestAskedBytes } from './request';
import { pushSnapshot } from './sync';

/**
 * The child's "ask for more data" control. Visible only on a paired child
 * device, and only once its own local mobile alert has actually crossed warn
 * or over — asking is not offered while nothing is wrong — or while a
 * request already sent is still awaiting an answer.
 *
 * `mobileLimitBytes` only, never Wi-Fi: it is the field a `grant` raises
 * (`features/family/request.ts`'s `applyGrant`), the same one
 * `useLimitStatus('MOBILE')` reads, and the same mobile-only convention the
 * parent's own per-child notification threshold already uses.
 */
export function RequestCard() {
  const theme = useTheme();
  const { t } = useTranslation();
  const { settings, reloadSettings } = useUsageContext();
  const limitView = useLimitStatus('MOBILE');
  const [busy, setBusy] = useState(false);

  if (!settings || settings.familyRole !== 'child' || !settings.pairToken) return null;

  const pending = settings.pendingLimitRequest;
  const eligible = !!limitView && limitView.status.state !== 'ok';
  if (!pending && !eligible) return null;

  const askedBytes = pending?.askedBytes ?? (limitView ? suggestAskedBytes(limitView.status) : 0);
  const label = settings.pairedLabel ?? '';

  const requestMore = async () => {
    setBusy(true);
    try {
      const at = Date.now();
      await pushSnapshot('request', 0, { askedBytes, at });
      await saveSettings({ pendingLimitRequest: { askedBytes, at } });
      reloadSettings();
      toast(t('family.requestSentToast'));
    } catch {
      toast(t('family.requestFailedToast'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: theme.accentMuted }]}>
          <Send size={16} color={theme.accent} />
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {t('family.requestHeading')}
        </ThemedText>
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {t('family.requestHint', { label })}
      </ThemedText>

      {pending ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('family.requestPending', {
            label,
            bytes: formatBytes(pending.askedBytes),
            when: formatDateTime(pending.at),
          })}
        </ThemedText>
      ) : (
        <Button
          variant="default"
          title={t('family.requestButton', { label, bytes: formatBytes(askedBytes) })}
          onPress={requestMore}
          loading={busy}
          disabled={busy}
          accessibilityLabel={t('family.requestButton', { label, bytes: formatBytes(askedBytes) })}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
