import React, { useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface InputProps extends TextInputProps {
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
  containerStyle?: ViewStyle;
}

export function Input({
  icon,
  iconEnd,
  containerStyle,
  style,
  onFocus,
  onBlur,
  ...props
}: InputProps) {
  const theme = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: isFocused ? theme.ring : theme.input,
        },
        containerStyle,
      ]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            color: theme.text,
          },
          style,
        ]}
        onFocus={(e) => {
          setIsFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setIsFocused(false);
          onBlur?.(e);
        }}
        {...props}
      />
      {iconEnd ? <View style={styles.iconEnd}>{iconEnd}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: 15,
    paddingVertical: Spacing.two,
  },
  icon: {
    marginRight: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEnd: {
    marginLeft: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
