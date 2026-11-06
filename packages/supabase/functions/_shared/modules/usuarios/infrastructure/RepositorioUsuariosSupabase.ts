import { authLocal } from "./authLocal.ts";
import type { createEdgeClient, createServiceClient } from "@core/index.ts";
import type { RepositorioUsuarios } from "../application/UsuariosService.ts";
import {
  type DatosUsuario,
  type EstadoOperacion,
  type OperacionUsuario,
  type SolicitudUsuario,
  type Usuario,
  UsuarioError,
} from "../domain/usuario.ts";
type Client = ReturnType<typeof createServiceClient>;
const COLUMNAS = "id,email,nombre,apellido,rol,estado";
function fallo(error: { code?: string; status?: number }): never {
  if (
    error.code === "23505" ||
    ["email_exists", "user_already_exists"].includes(error.code ?? "")
  ) {
    throw new UsuarioError(
      "El correo o la identidad de operación ya están registrados.",
      409,
    );
  }
  if (error.code === "54000") {
    throw new UsuarioError(
      "Alcanzaste el límite de tres reenvíos por hora para esta cuenta.",
      429,
    );
  }
  if (error.code === "42501") throw new UsuarioError("Acceso denegado.", 403);
  throw new UsuarioError(
    "No se pudo confirmar la operación. Consultá su estado antes de reintentar.",
    503,
  );
}
export class RepositorioUsuariosSupabase implements RepositorioUsuarios {
  constructor(
    private human: ReturnType<typeof createEdgeClient>,
    private tecnico: Client,
    public actorId: string,
  ) {}
  private async exigirActor() {
    const { data, error } = await this.human.from("usuarios").select(
      "id,rol,estado",
    ).eq("id", this.actorId).maybeSingle();
    if (error) fallo(error);
    if (!data || data.rol !== "admin" || data.estado !== "activo") {
      throw new UsuarioError("Acceso denegado.", 403);
    }
  }
  private async rpc(nombre: string, params: Record<string, unknown>) {
    const { data, error } = await this.tecnico.rpc(nombre, {
      p_actor: this.actorId,
      ...params,
    });
    if (error) fallo(error);
    return data;
  }
  async reservar(s: SolicitudUsuario) {
    return await this.rpc("usuarios_operacion_reservar", {
      p_operacion_id: s.operacionId,
      p_tipo: s.operacion,
      p_usuario_id: s.usuarioId,
      p_datos: s.datos,
    }) as OperacionUsuario;
  }
  async operacion(id: string) {
    return await this.rpc("usuarios_operacion_leer", {
      p_operacion_id: id,
      p_usuario_id: null,
    }) as OperacionUsuario | null;
  }
  async ultima(id: string) {
    return await this.rpc("usuarios_operacion_leer", {
      p_operacion_id: null,
      p_usuario_id: id,
    }) as OperacionUsuario | null;
  }
  async usuario(id: string) {
    await this.exigirActor();
    const { data, error } = await this.human.from("usuarios").select(COLUMNAS)
      .eq("id", id).maybeSingle();
    if (error) fallo(error);
    return data as Usuario | null;
  }
  async guardar(
    op: OperacionUsuario,
    estado: EstadoOperacion,
    revocacion = false,
    enviado = false,
  ) {
    await this.rpc("usuarios_operacion_guardar", {
      p_operacion_id: op.id,
      p_lease: op.lease,
      p_estado: estado,
      p_revocacion_pendiente: revocacion,
      p_enlace_enviado: enviado,
    });
  }
  async crearIdentidad(id: string, datos: DatosUsuario, operacionId: string) {
    await this.exigirActor();
    const previous = await this.tecnico.auth.admin.getUserById(id);
    if (previous.data?.user) {
      if (
        previous.data.user.app_metadata?.gestion_operacion_id !== operacionId
      ) {
        throw new UsuarioError(
          "La identidad reservada pertenece a otra operación.",
          409,
        );
      }
      return;
    }
    if (previous.error && previous.error.status !== 404) fallo(previous.error);
    const { error } = await this.tecnico.auth.admin.createUser({
      id,
      email: datos.email,
      email_confirm: true,
      user_metadata: { nombre: datos.nombre, apellido: datos.apellido },
      app_metadata: { gestion_operacion_id: operacionId },
    });
    if (error) {
      // Una respuesta perdida no crea otra identidad: consultar el UUID reservado.
      const actual = await this.tecnico.auth.admin.getUserById(id);
      if (
        actual.data?.user?.app_metadata?.gestion_operacion_id === operacionId
      ) return;
      fallo(error);
    }
  }
  async editar(id: string, datos: DatosUsuario) {
    await this.exigirActor();
    if (id === this.actorId) {
      throw new UsuarioError("No se modifica la cuenta propia.", 403);
    }
    const { data: auth, error: readError } = await this.tecnico.auth.admin
      .getUserById(id);
    if (readError || !auth.user) fallo(readError ?? {});
    if (auth.user.email !== datos.email) {
      // El trigger Auth→perfil hace la sincronización dentro de la misma transacción.
      const { error } = await this.tecnico.auth.admin.updateUserById(id, {
        email: datos.email,
      });
      if (error) fallo(error);
    }
    const { data, error } = await this.human.from("usuarios").update({
      nombre: datos.nombre,
      apellido: datos.apellido,
      rol: datos.rol,
    }).eq("id", id).select(COLUMNAS).maybeSingle();
    if (error) fallo(error);
    if (!data) throw new UsuarioError("La cuenta no está disponible.", 409);
  }
  async estado(id: string, estado: "activo" | "inactivo") {
    await this.exigirActor();
    const { data, error } = await this.human.from("usuarios").update({ estado })
      .eq("id", id).select("id").maybeSingle();
    if (error) fallo(error);
    if (!data) throw new UsuarioError("La cuenta no está disponible.", 409);
  }
  async revocar(id: string) {
    await this.rpc("usuarios_revocar_sesiones", { p_usuario_id: id });
  }
  async enlacePendiente(id: string) {
    return await this.rpc("usuarios_enlace_pendiente", {
      p_usuario_id: id,
    }) as boolean;
  }
  async enlace(id: string) {
    await this.exigirActor();
    const usuario = await this.usuario(id);
    if (!usuario || usuario.estado !== "activo") {
      throw new UsuarioError(
        "Cuenta no disponible para recibir un enlace.",
        409,
      );
    }
    const rawCallback = Deno.env.get("AUTH_REDIRECT_URL")?.trim() ||
      "http://localhost:3000/establecer-contrasena";
    let callback: URL;
    try {
      callback = new URL(rawCallback);
    } catch {
      throw new UsuarioError(
        "El callback de autenticación no está configurado.",
        503,
      );
    }
    if (
      !["http:", "https:"].includes(callback.protocol) ||
      callback.pathname !== "/establecer-contrasena"
    ) {
      throw new UsuarioError(
        "El callback de autenticación no está configurado.",
        503,
      );
    }
    const { error } = await authLocal().resetPasswordForEmail(
      usuario.email,
      { redirectTo: callback.href },
    );
    if (error) fallo(error);
  }
}
