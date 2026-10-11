/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_LOCAL_ONLY?: string;
}
declare module '*.wasm?url' {
  const url: string;
  export default url;
}
