import { createClient } from '@supabase/supabase-js';

// Server-side admin client — never expose SERVICE_KEY to browser
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default supabase;
