import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const MARKER_WIDTH = 2;

export interface ProgressProps extends ViewProps {
  value: number; // 0 to 100
  secondaryValue?: number; // 0 to 100 for elapsed cycle or baseline
  indicatorColor?: string;
  secondaryColor?: string;
  height?: number;
}

export function Progress({
  value,
  secondaryValue,
  indicatorColor,
  secondaryColor,
  height = 8,
  style,
  ...props
}: ProgressProps) {
  const theme = useTheme();
  const clampedValue = Math.min(100, Math.max(0, value));
  const clampedSecondary = secondaryValue !== undefined ? Math.min(100, Math.max(0, secondaryValue)) : undefined;

  return (
    <View
      style={[
        styles.track,
        {
          height,
          backgroundColor: theme.backgroundSelected,
        },
        style,
      ]}
      {...props}>
      <View
        style={[
          styles.fill,
          {
            width: `${clampedValue}%`,
            backgroundColor: indicatorColor || theme.accent,
            height,
          },
        ]}
      />
      {clampedSecondary !== undefined ? (
        <View
          style={[
            styles.secondaryMarker,
            {
              left: `${clampedSecondary}%`,
              // The track clips overflow, so pull the marker back into it in
              // proportion to how far right it sits: at 100% it would vanish.
              transform: [{ translateX: -(clampedSecondary / 100) * MARKER_WIDTH }],
              backgroundColor: secondaryColor || theme.textSecondary,
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    borderRadius: Radius.full,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  fill: {
    borderRadius: Radius.full,
  },
  secondaryMarker: {
    position: 'absolute',
    width: MARKER_WIDTH,
    height: '100%',
    zIndex: 1,
  },
});
