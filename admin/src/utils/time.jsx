import React from 'react';

// ── Human-Readable Time & Duration Utilities for Admin Dashboard ──

/**
 * Format an elapsed duration between two timestamps (or duration in ms)
 * into easily understandable human-friendly units (seconds, minutes, hours, days).
 *
 * Examples:
 *   - 35 seconds       => '35 secs' (or '35s' if short)
 *   - 2 min 14 sec     => '2 mins 14 secs' (or '2m 14s' if short)
 *   - 45 minutes       => '45 mins' (or '45m' if short)
 *   - 3 hours 20 mins  => '3 hrs 20 mins' (or '3h 20m' if short)
 *   - 11,351 minutes   => '7 days 21 hrs' (or '7d 21h' if short)
 */
export function formatElapsedTime(fromTs, toTs = Date.now(), options = {}) {
  if (!fromTs) return '';
  const start = typeof fromTs === 'string' ? new Date(fromTs).getTime() : Number(fromTs);
  const end = typeof toTs === 'string' ? new Date(toTs).getTime() : Number(toTs);
  if (isNaN(start) || start <= 0) return '';

  const diffMs = Math.max(0, end - start);
  return formatDurationMs(diffMs, options);
}

/**
 * Format a duration in milliseconds into human-readable string.
 */
export function formatDurationMs(diffMs, { short = false, includeSeconds = true } = {}) {
  const totalSec = Math.max(0, Math.floor(diffMs / 1000));

  // Under 60 seconds
  if (totalSec < 60) {
    if (short) return `${totalSec}s`;
    return `${totalSec} sec${totalSec === 1 ? '' : 's'}`;
  }

  const totalMin = Math.floor(totalSec / 60);
  const remSec = totalSec % 60;

  // Under 60 minutes
  if (totalMin < 60) {
    // If under 5 minutes and includeSeconds is enabled, show seconds for precision
    if (includeSeconds && totalMin < 5 && remSec > 0) {
      if (short) return `${totalMin}m ${remSec}s`;
      return `${totalMin} min${totalMin === 1 ? '' : 's'} ${remSec} sec${remSec === 1 ? '' : 's'}`;
    }
    if (short) return `${totalMin}m`;
    return `${totalMin} min${totalMin === 1 ? '' : 's'}`;
  }

  const totalHours = Math.floor(totalMin / 60);
  const remMin = totalMin % 60;

  // Under 24 hours
  if (totalHours < 24) {
    if (short) {
      return remMin > 0 ? `${totalHours}h ${remMin}m` : `${totalHours}h`;
    }
    const hrPart = `${totalHours} hr${totalHours === 1 ? '' : 's'}`;
    const minPart = remMin > 0 ? ` ${remMin} min${remMin === 1 ? '' : 's'}` : '';
    return `${hrPart}${minPart}`;
  }

  // 1 day or more (days + remaining hours)
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;

  if (short) {
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  const dayPart = `${days} day${days === 1 ? '' : 's'}`;
  const hrPart = remHours > 0 ? ` ${remHours} hr${remHours === 1 ? '' : 's'}` : '';
  return `${dayPart}${hrPart}`;
}

/**
 * Format a relative time ("... ago") for feeds, cards, and message previews.
 */
export function formatRelativeTime(ts) {
  if (!ts) return '';
  const time = typeof ts === 'string' ? new Date(ts).getTime() : Number(ts);
  if (isNaN(time) || time <= 0) return '';

  const diffSec = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (diffSec < 45) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  const remMin = diffMin % 60;
  if (diffHours < 24) {
    return remMin > 0 && diffHours < 3 ? `${diffHours}h ${remMin}m ago` : `${diffHours}h ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  const remHours = diffHours % 24;
  if (diffDays < 7) {
    return remHours > 0 ? `${diffDays}d ${remHours}h ago` : `${diffDays}d ago`;
  }
  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks}w ago`;
  }
  const months = Math.floor(diffDays / 30);
  return `${months}mo ago`;
}

/**
 * Clean activity timestamp (time if today, date if older).
 */
export function formatChatActivityTime(ts) {
  if (!ts) return '—';
  const date = new Date(ts);
  if (isNaN(date.getTime())) return '—';
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: 'numeric' });
}

/**
 * Standard SLA Badge component/renderer used in tables and headers.
 */
export function renderSlaBadge(createdAt, status, options = {}) {
  if (status === 'resolved' || status === 'closed' || !createdAt) return null;
  const start = typeof createdAt === 'string' ? new Date(createdAt).getTime() : Number(createdAt);
  if (isNaN(start) || start <= 0) return null;

  const elapsedMs = Math.max(0, Date.now() - start);
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const formattedTime = formatDurationMs(elapsedMs, { short: true });

  if (elapsedMinutes < 3) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
        ⏱️ {formattedTime}
      </span>
    );
  }
  if (elapsedMinutes < 10) {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
        ⏱️ {formattedTime}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200 animate-pulse">
      🚨 {formattedTime} SLA
    </span>
  );
}
