import supabase from '../db/supabase.js';

export async function getSchool(schoolId, res) {
  const { data: school, error } = await supabase
    .from('schools')
    .select('*')
    .eq('slug', schoolId)
    .single();

  if (error || !school) {
    res.status(400).json({ error: 'Invalid schoolId' });
    return null;
  }

  return school;
}
