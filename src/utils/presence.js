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

export async function anyAdminOnline(supabase) {
  const { data } = await supabase.from('admin_profiles').select('status, updated_at');
  return (data || []).some(p => computeAgentStatus(p) === 'online');
}
