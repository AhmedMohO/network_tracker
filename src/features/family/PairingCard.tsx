import { Smartphone, UserMinus, UserPlus, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDateTime } from '@/i18n/format';

import { pairLink, parsePairLink } from './pair';
import { useChildren } from './useChildren';
import { defaultDeviceLabel, useFamily } from './useFamily';

/** Matches the section header used by every other card on the settings screen. */
function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIconBox, { backgroundColor: theme.accentMuted }]}>{icon}</View>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title}
      </ThemedText>
    </View>
  );
}

/**
 * The settings section that owns the whole pairing lifecycle: choosing a
 * role, sharing or pasting a link, editing this device's label, seeing
 * paired children (parent), and the two unpair paths. Both unpair actions
 * confirm first — deletion is not reversible.
 */
export function PairingCard() {
  const theme = useTheme();
  const { t } = useTranslation();
  const family = useFamily();
  const { children } = useChildren();
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [labelDraft, setLabelDraft] = useState('');

  useEffect(() => {
    setLabelDraft(family.deviceLabel ?? '');
  }, [family.deviceLabel]);

  const confirmUnpair = (titleKey: string, bodyKey: string, actionKey: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert(t(titleKey), t(bodyKey), [
        { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
        { text: t(actionKey), style: 'destructive', onPress: () => resolve(true) },
      ]);
    });

  const doUnpair = async () => {
    try {
      await family.unpair();
      toast(t('family.unpairDone'));
    } catch {
      Alert.alert(t('family.unpairFailedTitle'), t('family.unpairFailed'));
    }
  };

  const startParent = async () => {
    try {
      await family.becomeParent(defaultDeviceLabel());
    } catch {
      // `useFamily`'s `run` already stamped `family.error`, rendered below.
    }
  };

  const joinFromText = async (raw: string) => {
    const pairing = parsePairLink(raw.trim());
    if (!pairing) {
      toast(t('family.pasteLinkInvalid'));
      return;
    }
    try {
      await family.joinAsChild(pairing.token, pairing.label);
      toast(t('family.joinedToast', { label: pairing.label }));
      setPasteText('');
    } catch {
      // `useFamily`'s `run` already stamped `family.error`, rendered below —
      // in particular this is how "already paired with a different family"
      // (`joinAsChild`'s guard) reaches the user.
    }
  };

  const sendLink = async () => {
    if (!family.token || !family.deviceLabel) return;
    try {
      await Share.share({ message: pairLink(family.token, family.deviceLabel) });
    } catch {
      toast(t('family.shareFailed'));
    }
  };

  const saveLabel = async () => {
    const label = labelDraft.trim();
    if (!label) return;
    try {
      await family.setDeviceLabel(label);
      toast(t('family.labelSaved'));
    } catch {
      // `useFamily`'s `run` already stamped `family.error`, rendered below.
    }
  };

  return (
    <Card style={styles.card}>
      <SectionHeader icon={<Users size={16} color={theme.accent} />} title={t('family.title')} />

      {family.error ? (
        <ThemedText type="small" themeColor="destructive" accessibilityRole="alert">
          {family.error}
        </ThemedText>
      ) : null}

      {family.role === null && (
        <View style={styles.gap}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('family.intro')}
          </ThemedText>
          <Button
            variant="default"
            icon={<UserPlus size={16} color={theme.primaryForeground} />}
            title={t('family.parentButton')}
            onPress={startParent}
            disabled={family.busy}
            accessibilityLabel={t('family.parentButton')}
          />
          <Button
            variant="secondary"
            icon={<Smartphone size={16} color={theme.text} />}
            title={t('family.childButton')}
            onPress={() => setShowPaste((v) => !v)}
            accessibilityLabel={t('family.childButton')}
          />
          {showPaste && (
            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('family.pasteLinkLabel')}
              </ThemedText>
              <Input
                value={pasteText}
                onChangeText={setPasteText}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('family.pasteLinkPlaceholder')}
                accessibilityLabel={t('family.pasteLinkLabel')}
              />
              <Button
                variant="outline"
                title={t('family.pasteLinkButton')}
                onPress={() => joinFromText(pasteText)}
                disabled={family.busy}
                accessibilityLabel={t('family.pasteLinkButton')}
              />
            </View>
          )}
        </View>
      )}

      {family.role === 'parent' && (
        <View style={styles.gap}>
          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('family.deviceLabelLabel')}
            </ThemedText>
            <Input
              value={labelDraft}
              onChangeText={setLabelDraft}
              placeholder={t('family.deviceLabelPlaceholder')}
              accessibilityLabel={t('family.deviceLabelLabel')}
            />
            <Button
              size="sm"
              variant="outline"
              title={t('family.saveLabel')}
              onPress={saveLabel}
              disabled={family.busy}
              accessibilityLabel={t('family.saveLabel')}
            />
          </View>

          <Button
            variant="default"
            title={t('family.sendLink')}
            onPress={sendLink}
            accessibilityLabel={t('family.sendLink')}
            accessibilityHint={t('family.sendLinkHint')}
          />

          <View style={styles.fieldGroup}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('family.childrenHeading')}
            </ThemedText>
            {children.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                {t('family.noChildren')}
              </ThemedText>
            ) : (
              children.map((child) => (
                <View
                  key={child.deviceId}
                  style={[styles.childRow, { borderColor: theme.border }]}>
                  <ThemedText type="small">{child.label}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('family.lastSeen', { when: formatDateTime(child.lastSeen) })}
                  </ThemedText>
                </View>
              ))
            )}
          </View>

          <Button
            variant="destructive"
            icon={<UserMinus size={16} color={theme.destructiveForeground} />}
            title={t('family.unpairAll')}
            onPress={async () => {
              if (
                await confirmUnpair(
                  'family.unpairAllConfirmTitle',
                  'family.unpairAllConfirmBody',
                  'family.unpairAll'
                )
              ) {
                await doUnpair();
              }
            }}
            disabled={family.busy}
            accessibilityLabel={t('family.unpairAll')}
          />
        </View>
      )}

      {family.role === 'child' && (
        <View style={styles.gap}>
          <ThemedText type="default">
            {t('family.sharingWith', { label: family.pairedLabel ?? '' })}
          </ThemedText>
          <View style={[styles.privacyBox, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
            <ThemedText type="small" themeColor="textSecondary">
              {t('family.whatIsShared')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('family.whatNeverLeaves')}
            </ThemedText>
          </View>
          <Button
            variant="destructive"
            icon={<UserMinus size={16} color={theme.destructiveForeground} />}
            title={t('family.unpairMeButton')}
            onPress={async () => {
              if (
                await confirmUnpair(
                  'family.unpairMeConfirmTitle',
                  'family.unpairMeConfirmBody',
                  'family.unpairMeButton'
                )
              ) {
                await doUnpair();
              }
            }}
            disabled={family.busy}
            accessibilityLabel={t('family.unpairMeButton')}
          />
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sectionIconBox: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gap: {
    gap: Spacing.three,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
    borderTopWidth: 1,
  },
  privacyBox: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
});
