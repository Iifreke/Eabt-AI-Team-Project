// An agent is "present" if their heartbeat is recent. Heartbeats fire every
// 20s (see admin/src/components/Sidebar.jsx), so 45s tolerates one missed beat.
export const PRESENCE_THRESHOLD_MS = 45 * 1000;

// 'invisible' is the only manual override — everything else (online/away) is
// derived from heartbeat recency so it can never get stuck stale.
export function computeAgentStatus(profile, thresholdMs = PRESENCE_THRESHOLD_MS) {
  if (profile.status === 'invisible') return 'invisible';
  const lastSeenMs = profile.updated_at ? new Date(profile.updated_at).getTime() : 0;
  return (Date.now() - lastSeenMs) < thresholdMs ? 'online' : 'away';
}

let _presenceCache = null;
let _presenceCacheAt = 0;
const PRESENCE_CACHE_TTL = 30_000;

export async function anyAdminOnline(supabase) {
  const now = Date.now();
  if (_presenceCache !== null && (now - _presenceCacheAt) < PRESENCE_CACHE_TTL) {
    return _presenceCache;
  }
  const { data } = await supabase.from('admin_profiles').select('status, updated_at');
  _presenceCache = (data || []).some(p => computeAgentStatus(p) === 'online');
  _presenceCacheAt = now;
  return _presenceCache;
}
