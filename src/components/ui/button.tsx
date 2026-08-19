import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

export interface ButtonProps extends Omit<PressableProps, 'style'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  title?: string;
  icon?: React.ReactNode;
  iconEnd?: React.ReactNode;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function Button({
  variant = 'default',
  size = 'default',
  title,
  icon,
  iconEnd,
  loading = false,
  disabled,
  style,
  children,
  ...props
}: ButtonProps) {
  const theme = useTheme();

  const getBackgroundColor = (pressed: boolean) => {
    if (disabled) return variant === 'outline' || variant === 'ghost' ? 'transparent' : theme.backgroundSelected;
    switch (variant) {
      case 'default':
        return pressed ? theme.primary + 'D0' : theme.primary;
      case 'secondary':
        return pressed ? theme.backgroundSelected : theme.secondary;
      case 'destructive':
        return pressed ? theme.destructive + 'D0' : theme.destructive;
      case 'outline':
        return pressed ? theme.backgroundSelected : 'transparent';
      case 'ghost':
        return pressed ? theme.backgroundSelected : 'transparent';
      case 'link':
        return 'transparent';
      default:
        return theme.primary;
    }
  };

  const getBorderColor = () => {
    if (disabled) return theme.border;
    if (variant === 'outline') return theme.border;
    return 'transparent';
  };

  const getTextColor = () => {
    if (disabled) return 'textSecondary';
    switch (variant) {
      case 'default':
        return 'primaryForeground';
      case 'destructive':
        return 'destructiveForeground';
      case 'secondary':
        return 'text';
      case 'outline':
      case 'ghost':
        return 'text';
      case 'link':
        return 'primary';
      default:
        return 'primaryForeground';
    }
  };

  const sizeStyle = styles[size] || styles.default;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        sizeStyle,
        {
          backgroundColor: getBackgroundColor(pressed),
          borderColor: getBorderColor(),
          borderWidth: variant === 'outline' ? 1 : 0,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'default' || variant === 'destructive' ? '#FFF' : theme.primary}
        />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          {title ? (
            <ThemedText
              type={size === 'sm' ? 'smallBold' : 'default'}
              themeColor={getTextColor()}
              style={[
                styles.text,
                size === 'sm' && styles.textSm,
                size === 'lg' && styles.textLg,
              ]}>
              {title}
            </ThemedText>
          ) : null}
          {children}
          {iconEnd ? <View style={styles.iconEnd}>{iconEnd}</View> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  default: {
    minHeight: 44,
    paddingHorizontal: Spacing.four,
  },
  sm: {
    minHeight: 34,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  lg: {
    minHeight: 52,
    paddingHorizontal: Spacing.five,
    borderRadius: Radius.xl,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEnd: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  textSm: {
    fontSize: 13,
    lineHeight: 18,
  },
  textLg: {
    fontSize: 17,
    lineHeight: 24,
  },
});
