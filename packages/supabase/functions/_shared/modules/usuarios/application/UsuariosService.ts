import {
  type DatosUsuario,
  type EstadoOperacion,
  type OperacionUsuario,
  presentarOperacion,
  type SolicitudUsuario,
  type Usuario,
  UsuarioError,
} from "../domain/usuario.ts";
export interface RepositorioUsuarios {
  actorId: string;
  reservar(solicitud: SolicitudUsuario): Promise<OperacionUsuario>;
  operacion(id: string): Promise<OperacionUsuario | null>;
  ultima(usuarioId: string): Promise<OperacionUsuario | null>;
  usuario(id: string): Promise<Usuario | null>;
  guardar(
    op: OperacionUsuario,
    estado: EstadoOperacion,
    revocacion?: boolean,
    enviado?: boolean,
  ): Promise<void>;
  crearIdentidad(
    id: string,
    datos: DatosUsuario,
    operacionId: string,
  ): Promise<void>;
  editar(id: string, datos: DatosUsuario): Promise<void>;
  estado(id: string, estado: "activo" | "inactivo"): Promise<void>;
  revocar(id: string): Promise<void>;
  enlace(id: string): Promise<void>;
  enlacePendiente(id: string): Promise<boolean>;
}
export class UsuariosService {
  constructor(private repo: RepositorioUsuarios) {}
  async leer(id: string) {
    const op = await this.repo.operacion(id);
    if (!op) throw new UsuarioError("No se encontró el intento.", 404);
    return {
      ...presentarOperacion(op, await this.repo.usuario(op.usuario_id)),
      puedeReenviar: await this.repo.enlacePendiente(op.usuario_id),
    };
  }
  async estado(usuarioId: string) {
    const op = await this.repo.ultima(usuarioId);
    if (!op) {
      throw new UsuarioError(
        "La cuenta no tiene operaciones registradas.",
        404,
      );
    }
    return {
      ...presentarOperacion(op, await this.repo.usuario(usuarioId)),
      puedeReenviar: await this.repo.enlacePendiente(usuarioId),
    };
  }
  async ejecutar(solicitud: SolicitudUsuario) {
    if (solicitud.usuarioId === this.repo.actorId) {
      throw new UsuarioError("Esta gestión no modifica tu propia cuenta.", 403);
    }
    const op = await this.repo.reservar(solicitud);
    if (!op.ejecutar) return this.leer(op.id);
    let etapa: EstadoOperacion = "datos_pendientes";
    let identidadCreada = false;
    try {
      let usuario = await this.repo.usuario(op.usuario_id);
      if (solicitud.operacion === "crear") {
        await this.repo.crearIdentidad(
          op.usuario_id,
          solicitud.datos as DatosUsuario,
          op.id,
        );
        identidadCreada = true;
        await this.repo.editar(op.usuario_id, solicitud.datos as DatosUsuario);
      } else {
        if (!usuario) throw new UsuarioError("Usuario no disponible.", 404);
        if (
          solicitud.operacion === "restablecer" &&
          (usuario.rol !== "responsable" || usuario.estado !== "activo")
        ) {
          throw new UsuarioError(
            "Sólo se restablece la contraseña de un Responsable activo.",
            409,
          );
        }
        if (
          solicitud.operacion === "reenviar" &&
          (usuario.estado !== "activo" ||
            !await this.repo.enlacePendiente(usuario.id))
        ) {
          throw new UsuarioError(
            "No hay un enlace pendiente para una cuenta activa.",
            409,
          );
        }
        if (solicitud.operacion === "editar") {
          await this.repo.editar(usuario.id, solicitud.datos as DatosUsuario);
        }
        if (solicitud.operacion === "desactivar") {
          await this.repo.estado(usuario.id, "inactivo");
        }
        if (solicitud.operacion === "reactivar") {
          await this.repo.estado(usuario.id, "activo");
        }
      }
      if (["desactivar", "restablecer"].includes(solicitud.operacion)) {
        etapa = "sesiones_pendientes";
        await this.repo.guardar(op, "sesiones_pendientes", true);
        await this.repo.revocar(op.usuario_id);
      }
      if (["crear", "restablecer", "reenviar"].includes(solicitud.operacion)) {
        usuario = await this.repo.usuario(op.usuario_id);
        if (!usuario || usuario.estado !== "activo") {
          throw new UsuarioError("La cuenta dejó de estar activa.", 409);
        }
        etapa = "enlace_pendiente";
        // Marca durable ANTES de pedir correo: un proceso perdido no reenvía al repetir alta.
        await this.repo.guardar(op, "enviando");
        await this.repo.enlace(op.usuario_id);
        await this.repo.guardar(op, "completo", false, true);
      } else await this.repo.guardar(op, "completo");
    } catch (error) {
      const rechazado = !identidadCreada && error instanceof UsuarioError &&
        [400, 403, 404, 409].includes(error.statusCode) &&
        etapa === "datos_pendientes";
      await this.repo.guardar(
        op,
        rechazado ? "rechazado" : etapa,
        etapa === "sesiones_pendientes",
      ).catch(() => undefined);
      if (rechazado) throw error;
    }
    return this.leer(op.id);
  }
}
