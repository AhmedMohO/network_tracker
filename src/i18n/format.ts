import i18n from './index';

/** Locale-aware wrappers so dates follow the chosen language, not the device. */
export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDay(ts: number): string {
  return new Date(ts).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
}

const HOUR = 3_600_000;

/** "2 hours" / "1 day" — a span in the largest unit that stays a whole number. */
export function formatSpan(ms: number): string {
  if (ms < HOUR) {
    return i18n.t('duration.minutes', { count: Math.max(1, Math.round(ms / 60_000)) });
  }
  const hours = Math.round(ms / HOUR);
  if (hours < 24) return i18n.t('duration.hours', { count: hours });
  return i18n.t('duration.days', { count: Math.round(hours / 24) });
}
