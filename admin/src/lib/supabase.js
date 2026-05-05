import { createClient } from '@supabase/supabase-js';

// Browser client — auth and Storage uploads only. Never used for service-key operations.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
