const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const env = { supabaseUrl: url ?? '', supabaseKey: key ?? '', configured: Boolean(url && key) };
