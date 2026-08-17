import { useCallback, useState } from "react";
import { AppState, Button, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import NetworkUsage, { AppUsageRow, NetworkFilter } from "@modules/network-usage";

export default function Probe() {
  const [granted, setGranted] = useState(false);
  const [rows, setRows] = useState<AppUsageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  const runQuery = async (network: NetworkFilter) => {
    setError(null);
    // Last 7 days, aligned to midnight local time, so it can be compared
    // against Settings' own 7-day view.
    const end = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const start = startOfToday.getTime() - 6 * 86_400_000;
    try {
      const result = await NetworkUsage.getAppUsage({ start, end, network });
      result.sort((a, b) => b.rxBytes + b.txBytes - (a.rxBytes + a.txBytes));
      setRows(result);
    } catch (e) {
      setError(String(e));
    }
  };

  const totalRx = rows.reduce((sum, r) => sum + r.rxBytes, 0);
  const totalTx = rows.reduce((sum, r) => sum + r.txBytes, 0);

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
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button title="Query MOBILE" onPress={() => runQuery("MOBILE")} />
        <Button title="Query WIFI" onPress={() => runQuery("WIFI")} />
        <Button title="Query ALL" onPress={() => runQuery("ALL")} />
      </View>
      {error && <Text style={{ color: "red" }}>{error}</Text>}
      {rows.length > 0 && (
        <View>
          <Text>
            Total rx: {totalRx} · tx: {totalTx}
          </Text>
          <Text>
            Covered: {new Date(rows[0].coveredStart).toISOString()} -{" "}
            {new Date(rows[0].coveredEnd).toISOString()}
          </Text>
        </View>
      )}
      {rows.map((r) => (
        <View key={r.uid}>
          <Text>
            {r.uid} · {r.label ?? "(unknown)"} · rx {r.rxBytes} · tx {r.txBytes}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
