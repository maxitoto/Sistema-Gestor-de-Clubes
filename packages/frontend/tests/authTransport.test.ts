import { expect, test } from 'bun:test';
import { requestLogin } from '../src/shared/api/access.api';

test('el transporte de login aborta una respuesta HTTP real demorada', async () => {
	let entered: (() => void) | undefined;
	let release: (() => void) | undefined;
	const received = new Promise<void>((resolve) => {
		entered = resolve;
	});
	const gate = new Promise<void>((resolve) => {
		release = resolve;
	});
	const before = process.env.PUBLIC_SUPABASE_URL;
	const server = Bun.serve({
		hostname: '127.0.0.1',
		port: 0,
		async fetch(request) {
			expect(new URL(request.url).pathname).toBe('/functions/v1/acceso');
			entered?.();
			await gate;
			return Response.json({ session: { access_token: 'fixture', refresh_token: 'fixture' } });
		},
	});
	try {
		process.env.PUBLIC_SUPABASE_URL = server.url.origin;
		const controller = new AbortController();
		const request = requestLogin('fixture@v2.example.test', 'ABC12345', controller.signal);
		await received;
		controller.abort();
		await expect(request).rejects.toBeDefined();
	} finally {
		release?.();
		server.stop(true);
		if (before === undefined) {
			delete process.env.PUBLIC_SUPABASE_URL;
		} else {
			process.env.PUBLIC_SUPABASE_URL = before;
		}
	}
});
