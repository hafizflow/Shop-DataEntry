const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
/** VITE_LOCAL_ONLY=true: no login and no Supabase; products live only in this device's IndexedDB. */
const localOnly = import.meta.env.VITE_LOCAL_ONLY === 'true';
export const env = { supabaseUrl: url ?? '', supabaseKey: key ?? '', localOnly, configured: localOnly || Boolean(url && key) };
