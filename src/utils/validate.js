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

