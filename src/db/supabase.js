import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  'https://elcugbusrvbrpbhwsrev.supabase.co';

const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3VnYnVzcnZicnBiaHdzcmV2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzI5NjY1MCwiZXhwIjoyMDkyODcyNjUwfQ.m_Vl-sS0iZTNdfC8A7B6lh5_8cT_7FyKnTXmuntC8sc';

// Server-side admin client — bypasses RLS via service role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export default supabase;
