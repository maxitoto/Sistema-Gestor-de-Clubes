import type {
  PuertoDocumentoNotificacion,
  RepositorioNotificaciones,
} from "./PuertoNotificaciones.ts";
/** Recupera intenciones ya confirmadas: no cobra, no emite ni vuelve a generar cuotas. */
export class PrepararNotificacionesUseCase {
  constructor(
    private repo: RepositorioNotificaciones,
    private documentos: PuertoDocumentoNotificacion,
  ) {}
  async ejecutar(
    limiteTemporal = Number.POSITIVE_INFINITY,
    ahora = () => Date.now(),
  ) {
    const intenciones = await this.repo.reclamar(10);
    let preparadas = 0, pendientes = 0;
    for (const i of intenciones) {
      if (ahora() >= limiteTemporal) break;
      try {
        if (i.fuente_documento !== null) {
          if (!i.version_documento) {
            throw new Error("VERSION_DOCUMENTAL_INVALIDA");
          }
          const path = await this.documentos.generar(i);
          await this.repo.confirmarDocumento(i.id, i.reserva, path);
        } else if (
          !["reporte_mensual", "alerta_fiscal"].includes(i.evento) ||
          i.version_documento !== null
        ) {
          throw new Error("FUENTE_DOCUMENTAL_NO_DISPONIBLE");
        }
        await this.repo.encolar(i.id, i.reserva);
        preparadas++;
      } catch {
        // Códigos controlados: nunca se guarda el error del renderer, su fuente o secretos.
        await this.repo.registrarFallo(
          i.id,
          i.reserva,
          i.fuente_documento
            ? "PDF_NO_DISPONIBLE"
            : "NOTIFICACION_NO_CONFIRMADA",
        );
        pendientes++;
      }
    }
    return { preparadas, pendientes };
  }
}
