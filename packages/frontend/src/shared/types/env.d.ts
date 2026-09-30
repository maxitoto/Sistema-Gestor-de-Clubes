declare global {
	namespace NodeJS {
		interface ProcessEnv {
			NODE_ENV?: string;
			PUBLIC_SUPABASE_URL?: string;
			PUBLIC_SUPABASE_ANON_KEY?: string;
		}
	}
}

export {};
