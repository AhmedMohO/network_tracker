import { Stack, useRouter } from 'expo-router';
import { Camera, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { parsePairLink } from '@/features/family/pair';
import { useFamily } from '@/features/family/useFamily';
import { useTheme } from '@/hooks/use-theme';
import { CameraView, useCameraPermissions } from 'expo-camera';

/**
 * Full-screen QR scanner for the child-pairing flow.
 *
 * Pushed from the PairingCard when an unpaired device taps "Scan QR code".
 * On a successful scan it parses the `nettrack://pair` deep link, joins as a
 * child, and navigates back.
 */
export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();
  const family = useFamily();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  // Prevent double-processing — `onBarcodeScanned` fires on every frame that
  // contains a valid code, not just the first one.
  const processingRef = useRef(false);

  // Auto-request on mount so the user doesn't have to tap twice.
  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  const resume = () => {
    processingRef.current = false;
    setScanned(false);
  };

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (processingRef.current) return;
    processingRef.current = true;
    setScanned(true);

    const pairing = parsePairLink(data);
    if (!pairing) {
      // Resumed from the button, not on the next line: any QR code in frame
      // that is not a pair link would otherwise re-fire this alert on every
      // camera frame and stack a dialog per frame.
      Alert.alert(t('family.pasteLinkInvalid'), undefined, [
        { text: t('common.close'), onPress: resume },
      ]);
      return;
    }

    family
      .joinAsChild(pairing.token, pairing.label)
      .then(() => {
        router.back();
      })
      .catch((e) => {
        Alert.alert(
          t('family.joinFailedTitle'),
          e instanceof Error ? e.message : t('family.joinFailedBody'),
          [{ text: t('common.close'), onPress: resume }]
        );
      });
  };

  // Permission not yet granted — show a prompt.
  if (!permission?.granted) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Stack.Screen options={{ title: t('family.scanQrTitle') }} />
        <Camera size={48} color={theme.textSecondary} />
        <ThemedText type="default" style={styles.permText}>
          {t('family.cameraPermissionNeeded')}
        </ThemedText>
        <Button
          variant="default"
          title={t('family.cameraPermissionButton')}
          onPress={requestPermission}
        />
        <Button
          variant="outline"
          title={t('common.cancel')}
          onPress={() => router.back()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t('family.scanQrTitle') }} />
      <CameraView
        style={StyleSheet.absoluteFill}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      />

      {/* Dark overlay with transparent viewfinder cutout */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={styles.overlaySide} />
          <View style={[styles.viewfinder, { borderColor: theme.accent }]} />
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <ThemedText
            type="default"
            style={[styles.hint, { color: '#fff' }]}
          >
            {t('family.scanQrHint')}
          </ThemedText>

          <Button
            variant="outline"
            icon={<X size={16} color="#fff" />}
            title={t('common.cancel')}
            onPress={() => router.back()}
            style={styles.cancelBtn}
          />
        </View>
      </View>
    </View>
  );
}

const VIEWFINDER_SIZE = 260;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  permText: { textAlign: 'center', maxWidth: 280 },
  overlay: { ...StyleSheet.absoluteFill },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  overlayMiddle: { flexDirection: 'row' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  viewfinder: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    borderWidth: 2,
    borderRadius: 16,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
  },
  hint: { textAlign: 'center', maxWidth: 280 },
  cancelBtn: { borderColor: 'rgba(255,255,255,0.3)' },
});
