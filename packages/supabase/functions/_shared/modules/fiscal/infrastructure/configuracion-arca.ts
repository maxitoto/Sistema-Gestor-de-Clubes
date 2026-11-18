export class ArcaConfiguracionError extends Error {
  constructor(
    message: string,
    public readonly codigo = "ARCA_CONFIGURACION_PENDIENTE",
  ) {
    super(message);
    this.name = "ArcaConfiguracionError";
  }
}
export interface ConfiguracionArca {
  ambiente: "homologacion";
  habilitado: boolean;
  wsaaUrl: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms";
  wsfeUrl: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx";
  servicio: "wsfe";
  timeoutMs: number;
  maxResponseBytes: number;
}
export function leerConfiguracionArca(
  env: { get(name: string): string | undefined },
): ConfiguracionArca {
  if (env.get("ARCA_ENVIRONMENT") !== "homologacion") {
    throw new ArcaConfiguracionError(
      "Configurar ARCA_ENVIRONMENT=homologacion sólo en backend. Producción no está habilitada.",
    );
  }
  const flag = env.get("ARCA_EXTERNAL_ENABLED");
  if (flag !== undefined && flag !== "false" && flag !== "true") {
    throw new ArcaConfiguracionError(
      "ARCA_EXTERNAL_ENABLED debe ser true o false explícito.",
    );
  }
  return {
    ambiente: "homologacion",
    habilitado: flag === "true",
    wsaaUrl: "https://wsaahomo.afip.gov.ar/ws/services/LoginCms",
    wsfeUrl: "https://wswhomo.afip.gov.ar/wsfev1/service.asmx",
    servicio: "wsfe",
    timeoutMs: 20000,
    maxResponseBytes: 2000000,
  };
}
export function exigirArcaExterno(config: ConfiguracionArca): void {
  if (
    config.ambiente !== "homologacion" || config.servicio !== "wsfe" ||
    config.wsaaUrl !== "https://wsaahomo.afip.gov.ar/ws/services/LoginCms" ||
    config.wsfeUrl !== "https://wswhomo.afip.gov.ar/wsfev1/service.asmx" ||
    !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1 ||
    config.timeoutMs > 20000 ||
    !Number.isInteger(config.maxResponseBytes) || config.maxResponseBytes < 1 ||
    config.maxResponseBytes > 2000000
  ) {
    throw new ArcaConfiguracionError(
      "Sólo se admiten endpoints y límites cerrados de homologación.",
    );
  }
  if (!config.habilitado) {
    throw new ArcaConfiguracionError(
      "La conexión externa está deshabilitada. Completar el guion de homologación antes de habilitarla.",
      "ARCA_EXTERNO_DESHABILITADO",
    );
  }
}
