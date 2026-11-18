import { ConfiguracionError } from "./credenciales.ts";

export interface FormularioFiscal {
  certificado: File;
  clave: File;
  entorno: string;
  vencimiento: string | undefined;
}

/** El formulario nuevo deriva la fecha del CRT; clientes previos pueden enviarla para contraste. */
export function leerCamposFormularioFiscal(form: FormData): FormularioFiscal {
  const campos = [...form.keys()].sort().join(",");
  if (
    campos !== "certificado,clave,entorno" &&
    campos !== "certificado,clave,entorno,vencimiento"
  ) throw new ConfiguracionError("Campos de configuración no permitidos.");
  const certificado = form.get("certificado"),
    clave = form.get("clave"),
    vencimiento = form.get("vencimiento"),
    entorno = form.get("entorno");
  if (
    !(certificado instanceof File) || !(clave instanceof File) ||
    (vencimiento !== null && typeof vencimiento !== "string") ||
    typeof entorno !== "string"
  ) {
    throw new ConfiguracionError(
      "Complete el certificado, su clave y el entorno.",
    );
  }
  if (!/\.crt$/i.test(certificado.name) || !/\.key$/i.test(clave.name)) {
    throw new ConfiguracionError(
      "Los archivos del certificado deben ser .crt y .key",
    );
  }
  if (certificado.size > 65_536 || clave.size > 32_768) {
    throw new ConfiguracionError(
      "Certificado: hasta 64 KB; clave: hasta 32 KB.",
      413,
    );
  }
  return { certificado, clave, entorno, vencimiento: vencimiento ?? undefined };
}
