import { useCallback, useState } from "react";
import { AppState, Button, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import NetworkUsage from "@modules/network-usage";

export default function Probe() {
  const [granted, setGranted] = useState(false);

  const refresh = useCallback(() => {
    setGranted(NetworkUsage.hasUsageAccess());
  }, []);

  // Re-check on focus and on returning from the Settings app.
  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener("change", (s) => {
        if (s === "active") refresh();
      });
      return () => sub.remove();
    }, [refresh])
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "600" }}>Probe</Text>
      <View>
        <Text>Usage access: {granted ? "GRANTED" : "DENIED"}</Text>
      </View>
      {!granted && (
        <Button
          title="Open usage access settings"
          onPress={() => NetworkUsage.openUsageAccessSettings()}
        />
      )}
    </ScrollView>
  );
}
