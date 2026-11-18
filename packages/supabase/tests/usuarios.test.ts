import { describe, expect, test } from 'bun:test';
import {
	type RepositorioUsuarios,
	UsuariosService,
} from '../functions/_shared/modules/usuarios/application/UsuariosService.ts';
import {
	type DatosUsuario,
	type EstadoOperacion,
	type OperacionUsuario,
	presentarOperacion,
	type SolicitudUsuario,
	type Usuario,
	UsuarioError,
	validarSolicitud,
} from '../functions/_shared/modules/usuarios/domain/usuario.ts';

const ACTOR = '11111111-1111-4111-8111-111111111111',
	DESTINO = '22222222-2222-4222-8222-222222222222',
	OP = '33333333-3333-4333-8333-333333333333';
const datos: DatosUsuario = {
	nombre: 'Persona',
	apellido: 'Sintética',
	email: 'sintetica@v2.example.test',
	rol: 'responsable',
};

class Repo implements RepositorioUsuarios {
	actorId = ACTOR;
	registro: Usuario | null = null;
	op: OperacionUsuario | null = null;
	mail = 0;
	created = 0;
	revoked = 0;
	failMail = false;
	failRevoke = false;
	pending = false;
	failProfile = false;

	async reservar(s: SolicitudUsuario) {
		if (this.op) return { ...this.op, ejecutar: false };
		this.op = {
			id: s.operacionId,
			usuario_id: s.usuarioId ?? DESTINO,
			tipo: s.operacion,
			estado: 'ejecutando',
			lease: crypto.randomUUID(),
			lease_hasta: new Date(Date.now() + 120000).toISOString(),
			enlace_enviado_en: null,
			revocacion_pendiente: false,
			actualizado_en: new Date().toISOString(),
		};
		return { ...this.op, ejecutar: true };
	}
	async operacion() {
		return this.op;
	}
	async ultima() {
		return this.op;
	}
	async usuario() {
		return this.registro;
	}
	async guardar(_: OperacionUsuario, estado: EstadoOperacion, revocacion = false, enviado = false) {
		if (!this.op) throw new Error();
		this.op.estado = estado;
		this.op.revocacion_pendiente = revocacion;
		if (enviado) this.op.enlace_enviado_en = new Date().toISOString();
	}
	async crearIdentidad(id: string, d: DatosUsuario) {
		this.created++;
		this.registro = { id, ...d, estado: 'activo' };
	}
	async editar(id: string, d: DatosUsuario) {
		if (this.failProfile) throw new UsuarioError('Fallo de perfil', 503);
		this.registro = { id, ...d, estado: this.registro?.estado ?? 'activo' };
	}
	async estado(_: string, estado: 'activo' | 'inactivo') {
		if (this.registro) this.registro.estado = estado;
	}
	async revocar() {
		this.revoked++;
		if (this.failRevoke) throw new UsuarioError('Fallo de revocación', 503);
	}
	async enlace() {
		this.mail++;
		if (this.failMail) throw new UsuarioError('Correo incierto', 503);
	}
	async enlacePendiente() {
		return this.pending;
	}
}

function request(operacion: SolicitudUsuario['operacion'] = 'crear'): SolicitudUsuario {
	return {
		operacion,
		operacionId: OP,
		usuarioId: operacion === 'crear' ? null : DESTINO,
		datos: operacion === 'crear' || operacion === 'editar' ? datos : {},
	};
}

describe('Gestión administrativa recuperable', () => {
	test('valida columnas cerradas, rol, identidad y correo normalizado', () => {
		const parsed = validarSolicitud({
			operacion: 'crear',
			operacionId: OP,
			...datos,
			email: '  Persona@v2.example.test ',
		});
		expect(parsed.datos.email).toBe('persona@v2.example.test');
		expect(() =>
			validarSolicitud({
				operacion: 'crear',
				operacionId: OP,
				...datos,
				password: 'No permitida',
			}),
		).toThrow();
		expect(() =>
			validarSolicitud({
				operacion: 'editar',
				operacionId: OP,
				usuarioId: DESTINO,
				...datos,
				rol: 'operador',
			}),
		).toThrow();
		expect(() =>
			validarSolicitud({ operacion: 'desactivar', operacionId: OP, usuarioId: 'inválido' }),
		).toThrow();
	});
	test('alta sin doble identidad ni reenvío al repetir operación confirmada', async () => {
		const repo = new Repo(),
			service = new UsuariosService(repo);
		const first = await service.ejecutar(request()),
			retry = await service.ejecutar(request());
		expect(first.resultado).toBe('completo');
		expect(retry.usuario?.id).toBe(DESTINO);
		expect(repo.created).toBe(1);
		expect(repo.mail).toBe(1);
		expect(first.enlaceEnviadoEn).not.toBeNull();
	});
	test('fallo de correo preserva cuenta y sólo consulta en reintento de alta', async () => {
		const repo = new Repo();
		repo.failMail = true;
		const service = new UsuariosService(repo);
		const first = await service.ejecutar(request());
		await service.ejecutar(request());
		expect(first.resultado).toBe('enlace_pendiente');
		expect(first.usuario?.id).toBe(DESTINO);
		expect(repo.created).toBe(1);
		expect(repo.mail).toBe(1);
	});
	test('fallo de perfil después de crear identidad conserva resultado parcial', async () => {
		const repo = new Repo();
		repo.failProfile = true;
		const result = await new UsuariosService(repo).ejecutar(request());
		expect(result.resultado).toBe('datos_pendientes');
		expect(result.usuario?.id).toBe(DESTINO);
		expect(repo.mail).toBe(0);
	});
	test('propia cuenta bloqueada antes de reservar o ejecutar', async () => {
		const repo = new Repo();
		await expect(
			new UsuariosService(repo).ejecutar({ ...request('desactivar'), usuarioId: ACTOR }),
		).rejects.toThrow();
		expect(repo.op).toBeNull();
	});
	test('reset limita destino a Responsable activo', async () => {
		for (const user of [
			{ ...datos, rol: 'admin' as const, estado: 'activo' as const },
			{ ...datos, estado: 'inactivo' as const },
		]) {
			const repo = new Repo();
			repo.registro = { id: DESTINO, ...user };
			await expect(new UsuariosService(repo).ejecutar(request('restablecer'))).rejects.toThrow();
			expect(repo.mail).toBe(0);
			expect(repo.revoked).toBe(0);
		}
	});
	test('desactivación permanece aunque revocación falle', async () => {
		const repo = new Repo();
		repo.registro = { id: DESTINO, ...datos, estado: 'activo' };
		repo.failRevoke = true;
		const result = await new UsuariosService(repo).ejecutar(request('desactivar'));
		expect(result.usuario?.estado).toBe('inactivo');
		expect(result.resultado).toBe('sesiones_pendientes');
		expect(result.revocacionPendiente).toBe(true);
		expect(repo.mail).toBe(0);
	});
	test('reactivación no cambia contraseña ni envía mensajes', async () => {
		const repo = new Repo();
		repo.registro = { id: DESTINO, ...datos, estado: 'inactivo' };
		const result = await new UsuariosService(repo).ejecutar(request('reactivar'));
		expect(result.usuario?.estado).toBe('activo');
		expect(result.resultado).toBe('completo');
		expect(repo.revoked).toBe(0);
		expect(repo.mail).toBe(0);
	});
	test('reenvío no es un reset alternativo para cualquier Administrador', async () => {
		const repo = new Repo();
		repo.registro = { id: DESTINO, ...datos, rol: 'admin', estado: 'activo' };
		await expect(new UsuariosService(repo).ejecutar(request('reenviar'))).rejects.toThrow();
		expect(repo.mail).toBe(0);
	});
	test('GET después de respuesta perdida no ejecuta efectos', async () => {
		const repo = new Repo(),
			service = new UsuariosService(repo);
		await service.ejecutar(request());
		const result = await service.leer(OP);
		expect(result.resultado).toBe('completo');
		expect(repo.mail).toBe(1);
		expect(repo.created).toBe(1);
	});
	test('envío interrumpido diferencia lease vigente de resultado incierto', () => {
		const op: OperacionUsuario = {
			id: OP,
			usuario_id: DESTINO,
			tipo: 'crear',
			estado: 'enviando',
			lease_hasta: '2026-10-24T12:00:00Z',
			enlace_enviado_en: null,
			revocacion_pendiente: false,
			actualizado_en: '2026-10-24T11:59:00Z',
		};
		expect(presentarOperacion(op, null, Date.parse('2026-10-24T11:59:30Z')).resultado).toBe(
			'en_proceso',
		);
		expect(presentarOperacion(op, null, Date.parse('2026-10-24T12:01:00Z')).resultado).toBe(
			'enlace_pendiente',
		);
	});
});
