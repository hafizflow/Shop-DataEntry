import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabase = createClient(env.supabaseUrl || 'http://localhost', env.supabaseKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true },
});
