import { runUsageCheck } from "@/features/limits/backgroundCheck";
import { ensureNotificationSetup, notify } from "@/features/limits/notify";
import { loadSettings, saveSettings } from "@/features/usage/settings";
import NetworkUsage, {
	AppUsageRow,
	NetworkFilter,
	SeriesResult,
} from "@modules/network-usage";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Button, ScrollView, Text, View } from "react-native";

type DeviceSample = {
	time: string;
	mbpsMobileRx: number;
	mbpsMobileTx: number;
	mbpsTotalRx: number;
	mbpsTotalTx: number;
	unsupported: boolean;
};

type AppProbeSample = {
	time: string;
	rowCount: number;
	changed: string[]; // uid/label of rows whose byte total moved since the previous sample
};

export default function Probe() {
	const [granted, setGranted] = useState(false);
	const [rows, setRows] = useState<AppUsageRow[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [series, setSeries] = useState<SeriesResult | null>(null);
	const [seriesError, setSeriesError] = useState<string | null>(null);
	const [notificationStatus, setNotificationStatus] = useState<string | null>(null);

	const [deviceSamples, setDeviceSamples] = useState<DeviceSample[]>([]);
	const [deviceProbeRunning, setDeviceProbeRunning] = useState(false);
	const deviceProbeTimers = useRef<{
		interval?: ReturnType<typeof setInterval>;
		timeout?: ReturnType<typeof setTimeout>;
	}>({});
	const prevDeviceCounters = useRef<{
		mobileRx: number;
		mobileTx: number;
		totalRx: number;
		totalTx: number;
	} | null>(null);

	const [appProbeSamples, setAppProbeSamples] = useState<AppProbeSample[]>([]);
	const [appProbeRunning, setAppProbeRunning] = useState(false);
	const appProbeTimers = useRef<{
		interval?: ReturnType<typeof setInterval>;
		timeout?: ReturnType<typeof setTimeout>;
	}>({});
	const prevAppTotals = useRef<Map<number, number>>(new Map());

	// Stop both interval-driven probes on unmount so they don't setState after
	// the screen is gone.
	useEffect(() => {
		return () => {
			clearInterval(deviceProbeTimers.current.interval);
			clearTimeout(deviceProbeTimers.current.timeout);
			clearInterval(appProbeTimers.current.interval);
			clearTimeout(appProbeTimers.current.timeout);
		};
	}, []);

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
		}, [refresh]),
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

	// Granularity probe: deliberately unaligned window (14:37-16:12) at a
	// 15-min bucket, to see whether the OS honours sub-hour ranges or snaps
	// them out to hour boundaries.
	const runSeriesProbe = async () => {
		setSeriesError(null);
		const today = new Date();
		today.setHours(14, 37, 0, 0);
		const start = today.getTime();
		const end = start + (16 * 60 + 12 - (14 * 60 + 37)) * 60_000; // 16:12:00 same day
		try {
			const result = await NetworkUsage.getSeries({
				start,
				end,
				network: "MOBILE",
				bucketMs: 900_000,
			});
			setSeries(result);
		} catch (e) {
			setSeriesError(String(e));
		}
	};

	// Device-level live speed probe: sample getDeviceCounters() every 1s for
	// 30s and render the per-second delta as MB/s. TrafficStats returns -1
	// (UNSUPPORTED) if the counter is unavailable — any negative value on
	// either sample is recorded as unsupported rather than turned into a
	// (nonsense) negative rate.
	const runDeviceProbe = () => {
		clearInterval(deviceProbeTimers.current.interval);
		clearTimeout(deviceProbeTimers.current.timeout);
		setDeviceSamples([]);
		prevDeviceCounters.current = null;
		setDeviceProbeRunning(true);

		deviceProbeTimers.current.interval = setInterval(() => {
			const c = NetworkUsage.getDeviceCounters();
			const prev = prevDeviceCounters.current;
			prevDeviceCounters.current = c;
			if (!prev) return; // need two samples to compute a delta

			const anyNegative = [
				c.mobileRx,
				c.mobileTx,
				c.totalRx,
				c.totalTx,
				prev.mobileRx,
				prev.mobileTx,
				prev.totalRx,
				prev.totalTx,
			].some((v) => v < 0);
			const toMbps = (now: number, before: number) =>
				(now - before) / 1_000_000; // 1s interval
			setDeviceSamples((s) => [
				...s,
				{
					time: new Date().toISOString(),
					mbpsMobileRx: toMbps(c.mobileRx, prev.mobileRx),
					mbpsMobileTx: toMbps(c.mobileTx, prev.mobileTx),
					mbpsTotalRx: toMbps(c.totalRx, prev.totalRx),
					mbpsTotalTx: toMbps(c.totalTx, prev.totalTx),
					unsupported: anyNegative,
				},
			]);
		}, 1000);

		deviceProbeTimers.current.timeout = setTimeout(() => {
			clearInterval(deviceProbeTimers.current.interval);
			setDeviceProbeRunning(false);
		}, 30_000);
	};

	// Per-app live feasibility probe: every 2s for 60s, ask for the last 10s
	// of MOBILE usage per app and note which apps' byte totals moved since the
	// previous sample. Answers: does a 10s-wide query return anything, and
	// does it update within seconds?
	const runAppLiveProbe = () => {
		clearInterval(appProbeTimers.current.interval);
		clearTimeout(appProbeTimers.current.timeout);
		setAppProbeSamples([]);
		prevAppTotals.current = new Map();
		setAppProbeRunning(true);

		appProbeTimers.current.interval = setInterval(async () => {
			const end = Date.now();
			const start = end - 10_000;
			try {
				const result = await NetworkUsage.getAppUsage({
					start,
					end,
					network: "MOBILE",
				});
				const changed: string[] = [];
				const nextTotals = new Map<number, number>();
				for (const r of result) {
					const total = r.rxBytes + r.txBytes;
					nextTotals.set(r.uid, total);
					if (prevAppTotals.current.get(r.uid) !== total) {
						changed.push(`${r.uid} ${r.label ?? "(unknown)"}`);
					}
				}
				prevAppTotals.current = nextTotals;
				setAppProbeSamples((s) => [
					...s,
					{ time: new Date().toISOString(), rowCount: result.length, changed },
				]);
			} catch (e) {
				setAppProbeSamples((s) => [
					...s,
					{
						time: new Date().toISOString(),
						rowCount: -1,
						changed: [String(e)],
					},
				]);
			}
		}, 2000);

		appProbeTimers.current.timeout = setTimeout(() => {
			clearInterval(appProbeTimers.current.interval);
			setAppProbeRunning(false);
		}, 60_000);
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

			<Text style={{ fontSize: 20, fontWeight: "600" }}>Granularity probe</Text>
			<Text>Requested: 14:37:00 - 16:12:00, MOBILE, 15-min bins</Text>
			<Button title="Run granularity probe" onPress={runSeriesProbe} />
			{seriesError && <Text style={{ color: "red" }}>{seriesError}</Text>}
			{series && (
				<View>
					<Text>
						Covered: {new Date(series.coveredStart).toISOString()} -{" "}
						{new Date(series.coveredEnd).toISOString()}
					</Text>
					{series.bins
						.filter((b) => b.rxBytes > 0 || b.txBytes > 0)
						.map((b) => (
							<Text key={b.start}>
								{new Date(b.start).toISOString()} -{" "}
								{new Date(b.end).toISOString()} · rx {b.rxBytes} · tx{" "}
								{b.txBytes}
							</Text>
						))}
				</View>
			)}

			<Text style={{ fontSize: 20, fontWeight: "600" }}>
				Device live speed probe
			</Text>
			<Text>
				Samples getDeviceCounters() every 1s for 30s; renders per-second delta
				as MB/s.
			</Text>
			<Button
				title={
					deviceProbeRunning
						? "Running (30s)..."
						: "Run device live speed probe"
				}
				onPress={runDeviceProbe}
				disabled={deviceProbeRunning}
			/>
			{deviceSamples.map((s, i) => (
				<Text key={i}>
					{s.time} ·{" "}
					{s.unsupported
						? "UNSUPPORTED (negative counter)"
						: `mobile rx ${s.mbpsMobileRx.toFixed(2)} MB/s · tx ${s.mbpsMobileTx.toFixed(2)} MB/s · total rx ${s.mbpsTotalRx.toFixed(2)} MB/s · tx ${s.mbpsTotalTx.toFixed(2)} MB/s`}
				</Text>
			))}

			<Text style={{ fontSize: 20, fontWeight: "600" }}>
				Per-app live feasibility probe
			</Text>
			<Text>
				Every 2s for 60s, queries getAppUsage for the trailing 10s window
				(MOBILE) and logs which apps' byte totals changed since the previous
				sample.
			</Text>
			<Button
				title={
					appProbeRunning
						? "Running (60s)..."
						: "Run per-app live feasibility probe"
				}
				onPress={runAppLiveProbe}
				disabled={appProbeRunning}
			/>
			{appProbeSamples.map((s, i) => (
				<Text key={i}>
					{s.time} · rows {s.rowCount} · changed:{" "}
					{s.changed.length > 0 ? s.changed.join(", ") : "(none)"}
				</Text>
			))}

			<Text style={{ fontSize: 20, fontWeight: "600" }}>
				Notification & Alert Tests
			</Text>
			<Text>
				Directly test notifications, run threshold checks, or reset cycle alert state.
			</Text>
			<View style={{ gap: 8 }}>
				<Button
					title="Send Direct Test Notification"
					onPress={async () => {
						setNotificationStatus("Requesting permissions and sending test notification...");
						const ok = await ensureNotificationSetup();
						if (!ok) {
							setNotificationStatus("Permission DENIED by user.");
							return;
						}
						await notify(
							"Test Alert Title",
							"This is a direct test notification from Network Tracker."
						);
						setNotificationStatus("Direct notification scheduled/delivered!");
					}}
				/>
				<Button
					title="Run Usage Check (runUsageCheck)"
					onPress={async () => {
						setNotificationStatus("Running runUsageCheck(Date.now())...");
						try {
							const result = await runUsageCheck(Date.now());
							const settings = await loadSettings();
							setNotificationStatus(
								`Result: "${result}" (alerted keys: ${settings.alertedKeys.join(", ") || "none"})`
							);
						} catch (e) {
							setNotificationStatus(`Error: ${String(e)}`);
						}
					}}
				/>
				<Button
					title="Reset alerted keys in Settings"
					onPress={async () => {
						await saveSettings({ alertedKeys: [] });
						setNotificationStatus("Alerted keys cleared! You can now re-trigger cycle alerts.");
					}}
				/>
			</View>
			{notificationStatus && (
				<Text style={{ color: "#0066cc", marginVertical: 4, fontWeight: "500" }}>
					{notificationStatus}
				</Text>
			)}
		</ScrollView>
	);
}
