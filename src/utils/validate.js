import supabase from '../db/supabase.js';

export async function getSchool(schoolId, res) {
  if (!schoolId) {
    if (res) res.status(400).json({ error: 'Invalid schoolId' });
    return null;
  }

  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schoolId);
  let query = supabase.from('schools').select('*');

  if (isUUID) {
    query = query.eq('id', schoolId);
  } else if (schoolId === 'backock' || schoolId === 'babcock') {
    query = query.or('slug.eq.babcock,slug.eq.backock');
  } else {
    query = query.eq('slug', schoolId);
  }

  const { data: school, error } = await query.limit(1).maybeSingle();

  if (error || !school) {
    if (res) res.status(400).json({ error: 'Invalid schoolId' });
    return null;
  }

  return school;
}

export async function resolveSchoolId(schoolId) {
  if (!schoolId || schoolId === 'all') return null;
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(schoolId);
  if (isUUID) return schoolId;

  let query = supabase.from('schools').select('id');
  if (schoolId === 'backock' || schoolId === 'babcock') {
    query = query.or('slug.eq.babcock,slug.eq.backock');
  } else {
    query = query.eq('slug', schoolId);
  }
  const { data } = await query.limit(1).maybeSingle();
  return data?.id || null;
}

/**
 * Checks if current time is within official admissions office hours:
 * Monday through Friday, 8:00 AM – 6:00 PM West Africa Time (WAT / UTC+1).
 */
export function isWithinBusinessHours() {
  const watNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  const day = watNow.getDay(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = watNow.getHours(); // 0 - 23
  return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
}

