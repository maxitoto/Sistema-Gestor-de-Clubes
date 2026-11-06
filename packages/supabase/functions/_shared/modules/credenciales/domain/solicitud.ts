export type SolicitudCredencial =
  | { tipo: "cambiar"; password: string; currentPassword: string }
  | {
    tipo: "establecer";
    password: string;
    token_hash: string;
    type: "invite" | "recovery";
  };
export class CredencialError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
  }
}
export function validarCredencial(
  tipo: string,
  input: unknown,
): SolicitudCredencial {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new CredencialError("Solicitud inválida.");
  }
  const body = input as Record<string, unknown>;
  const keys = tipo === "cambiar"
    ? ["password", "currentPassword"]
    : tipo === "establecer"
    ? ["password", "token_hash", "type"]
    : [];
  if (
    !keys.length || Object.keys(body).length !== keys.length ||
    Object.keys(body).some((key) => !keys.includes(key))
  ) throw new CredencialError("Campos no permitidos.");
  if (
    typeof body.password !== "string" || body.password.length < 8 ||
    body.password.length > 1024 || !/[A-Z]/.test(body.password) ||
    !/[0-9]/.test(body.password)
  ) {
    throw new CredencialError(
      "Usá al menos 8 caracteres, una mayúscula y un número.",
      422,
    );
  }
  if (tipo === "cambiar") {
    if (
      typeof body.currentPassword !== "string" || !body.currentPassword ||
      body.currentPassword.length > 1024
    ) throw new CredencialError("Ingresá la contraseña actual.", 422);
    return {
      tipo,
      password: body.password,
      currentPassword: body.currentPassword,
    };
  }
  if (
    typeof body.token_hash !== "string" ||
    !/^[a-f0-9]{56}$/i.test(body.token_hash) ||
    (body.type !== "invite" && body.type !== "recovery")
  ) throw new CredencialError("El enlace no es válido. Solicitá uno nuevo.");
  return {
    tipo: "establecer",
    password: body.password,
    token_hash: body.token_hash,
    type: body.type,
  };
}
