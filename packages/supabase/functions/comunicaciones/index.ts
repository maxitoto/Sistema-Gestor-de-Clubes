import {
  createEdgeClient,
  createMailAdmin,
  requiredEnv,
  requireRol,
  sendEmail,
  validarConfiguracionCorreo,
} from "@core/index.ts";
import {
  DocumentoNotificacionSupabase,
  PrepararNotificacionesUseCase,
  RepositorioNotificacionesSupabase,
} from "@modules/comunicaciones/index.ts";
import { crearManejadorComunicaciones } from "./app.ts";
export const handleRequest = crearManejadorComunicaciones({
  autorizar: (req) =>
    requireRol({ req: { raw: req } }, ["admin", "responsable"]),
  humano: createEdgeClient,
  tecnico: createMailAdmin,
  env: requiredEnv,
  proveedor: validarConfiguracionCorreo,
  enviar: sendEmail,
  preparar: (db, limite) =>
    new PrepararNotificacionesUseCase(
      new RepositorioNotificacionesSupabase(db),
      new DocumentoNotificacionSupabase(db),
    ).ejecutar(limite),
  adjunto: (db, id, reserva) =>
    new DocumentoNotificacionSupabase(db).adjunto(id, reserva),
  ahora: () => Date.now(),
  esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});
Deno.serve(handleRequest);
