import { Tabs } from 'expo-router';
import {
  Activity,
  ArrowLeftRight,
  LayoutDashboard,
  Settings,
  Terminal,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarIcon: ({ color, size }) => (
            <LayoutDashboard size={size ?? 22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="compare"
        options={{
          title: t('tabs.compare'),
          tabBarIcon: ({ color, size }) => (
            <ArrowLeftRight size={size ?? 22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="live"
        options={{
          title: t('tabs.live'),
          tabBarIcon: ({ color, size }) => (
            <Activity size={size ?? 22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings'),
          tabBarIcon: ({ color, size }) => (
            <Settings size={size ?? 22} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="probe"
        options={{
          href: __DEV__ ? undefined : null,
          title: t('tabs.probe'),
          tabBarIcon: ({ color, size }) => (
            <Terminal size={size ?? 22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

