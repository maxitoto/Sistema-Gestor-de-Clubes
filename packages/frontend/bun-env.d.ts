// bun-env.d.ts
declare module 'bun' {
	interface Env {
		readonly PUBLIC_SUPABASE_URL: string;
		readonly PUBLIC_SUPABASE_ANON_KEY: string;
	}
}
