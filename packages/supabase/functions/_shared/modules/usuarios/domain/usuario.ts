export class UsuarioError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}
export type Usuario = {
  id: string;
  email: string;
  nombre: string;
  apellido: string;
  rol: "admin" | "responsable";
  estado: "activo" | "inactivo";
};
export type TipoOperacion =
  | "crear"
  | "editar"
  | "desactivar"
  | "reactivar"
  | "restablecer"
  | "reenviar";
export type DatosUsuario = {
  nombre: string;
  apellido: string;
  email: string;
  rol: "admin" | "responsable";
};
export type SolicitudUsuario = {
  operacion: TipoOperacion;
  operacionId: string;
  usuarioId: string | null;
  datos: Partial<DatosUsuario>;
};
export type EstadoOperacion =
  | "ejecutando"
  | "enviando"
  | "completo"
  | "enlace_pendiente"
  | "sesiones_pendientes"
  | "datos_pendientes"
  | "rechazado";
export type OperacionUsuario = {
  id: string;
  usuario_id: string;
  tipo: TipoOperacion;
  estado: EstadoOperacion;
  lease?: string;
  lease_hasta: string;
  ejecutar?: boolean;
  enlace_enviado_en: string | null;
  revocacion_pendiente: boolean;
  actualizado_en: string;
};
export type ResultadoUsuario = {
  operacionId: string;
  usuarioId: string;
  usuario: Usuario | null;
  resultado:
    | "completo"
    | "enlace_pendiente"
    | "sesiones_pendientes"
    | "datos_pendientes"
    | "en_proceso"
    | "rechazado";
  mensaje: string;
  revocacionPendiente: boolean;
  enlaceEnviadoEn: string | null;
  actualizadoEn: string;
};
export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
  ) throw new UsuarioError("Identificador inválido.");
  return value.toLowerCase();
}
export function emailNormalizado(value: unknown): string {
  if (
    typeof value !== "string" || value.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  ) throw new UsuarioError("Ingresá un correo válido.");
  return value.trim().toLowerCase();
}
function nombre(value: unknown, label: string) {
  if (
    typeof value !== "string" || !value.trim() || value.trim().length > 100 ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  ) throw new UsuarioError(`Ingresá ${label} válido (hasta 100 caracteres).`);
  return value.trim();
}
export function validarSolicitud(value: unknown): SolicitudUsuario {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new UsuarioError("Solicitud inválida.");
  }
  const body = value as Record<string, unknown>;
  const operacion = body.operacion;
  if (
    !["crear", "editar", "desactivar", "reactivar", "restablecer", "reenviar"]
      .includes(String(operacion))
  ) throw new UsuarioError("Operación no permitida.");
  const form = operacion === "crear" || operacion === "editar";
  const allowed = [
    "operacion",
    "operacionId",
    ...(operacion === "crear" ? [] : ["usuarioId"]),
    ...(form ? ["nombre", "apellido", "email", "rol"] : []),
  ];
  if (
    Object.keys(body).length !== allowed.length ||
    Object.keys(body).some((key) => !allowed.includes(key))
  ) throw new UsuarioError("Campos de usuario no permitidos.");
  const datos: Partial<DatosUsuario> = {};
  if (form) {
    datos.nombre = nombre(body.nombre, "un nombre");
    datos.apellido = nombre(body.apellido, "un apellido");
    datos.email = emailNormalizado(body.email);
    if (body.rol !== "admin" && body.rol !== "responsable") {
      throw new UsuarioError("Rol no permitido.");
    }
    datos.rol = body.rol;
  }
  return {
    operacion: operacion as TipoOperacion,
    operacionId: uuid(body.operacionId),
    usuarioId: operacion === "crear" ? null : uuid(body.usuarioId),
    datos,
  };
}
export function presentarOperacion(
  op: OperacionUsuario,
  usuario: Usuario | null,
  now = Date.now(),
): ResultadoUsuario {
  let resultado: ResultadoUsuario["resultado"];
  if (op.estado === "ejecutando" || op.estado === "enviando") {
    resultado = new Date(op.lease_hasta).getTime() > now
      ? "en_proceso"
      : op.estado === "enviando"
      ? "enlace_pendiente"
      : "datos_pendientes";
  } else resultado = op.estado;
  const mensajes = {
    completo: "Operación confirmada por el servidor.",
    enlace_pendiente:
      "La cuenta está registrada; no se confirmó el envío del enlace. Consultá el correo antes de reenviar: un nuevo enlace reemplaza al anterior.",
    sesiones_pendientes:
      "El cambio de estado está guardado; falta confirmar la revocación de sesiones. Volvé a consultar antes de reintentar.",
    datos_pendientes:
      "No se confirmó la operación completa. Conservá este intento y consultá antes de reintentar.",
    en_proceso:
      "La operación sigue en proceso. Consultá su estado; no crees otro intento.",
    rechazado:
      "La operación fue rechazada. Revisá los datos y las reglas de la cuenta.",
  };
  return {
    operacionId: op.id,
    usuarioId: op.usuario_id,
    usuario,
    resultado,
    mensaje: mensajes[resultado],
    revocacionPendiente: op.revocacion_pendiente,
    enlaceEnviadoEn: op.enlace_enviado_en,
    actualizadoEn: op.actualizado_en,
  };
}
