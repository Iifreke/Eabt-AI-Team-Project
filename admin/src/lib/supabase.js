import { createClient } from '@supabase/supabase-js';

// Browser client — auth and Storage uploads only. Never used for service-key operations.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || 'https://elcugbusrvbrpbhwsrev.supabase.co',
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsY3VnYnVzcnZicnBiaHdzcmV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyOTY2NTAsImV4cCI6MjA5Mjg3MjY1MH0.Biy-na8wbeVhSl-wSMkAKwcujTZ2mX_PyusPGInGZ7o'
);
