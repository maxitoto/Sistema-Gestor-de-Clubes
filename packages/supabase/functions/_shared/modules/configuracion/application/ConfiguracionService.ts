import {
  cifrarCampo,
  CLUB_ID,
  ConfiguracionError,
  descifrarCampo,
  estadoFiscal,
  importarClaveMaestra,
  type ParejaCifrada,
  validarPareja,
} from "../domain/credenciales.ts";

export interface RepositorioConfiguracion {
  leer(): Promise<ParejaCifrada | null>;
  reemplazar(pareja: ParejaCifrada): Promise<void>;
}
export class ConfiguracionService {
  constructor(
    private repo: RepositorioConfiguracion,
    private masterKey: () => string,
  ) {}
  async estado() {
    return estadoFiscal(await this.repo.leer());
  }
  async guardar(
    certificado: string,
    clave: string,
    vencimiento: string | undefined,
    entorno: string,
  ) {
    if (entorno !== "homologacion") {
      throw new ConfiguracionError(
        "Sólo se admite material para homologación.",
      );
    }
    const pareja = validarPareja(certificado, clave, vencimiento);
    const master = await importarClaveMaestra(this.masterKey());
    const [certificado_arca, certificado_key] = await Promise.all([
      cifrarCampo(pareja.certificado, master, CLUB_ID, "certificado_arca"),
      cifrarCampo(pareja.clave, master, CLUB_ID, "certificado_key"),
    ]);
    const encrypted = {
      certificado_arca,
      certificado_key,
      certificado_vencimiento: pareja.vencimiento,
    };
    await this.repo.reemplazar(encrypted);
    return estadoFiscal(encrypted);
  }
}
/** API técnica interna para el futuro adaptador fiscal. Nunca exponer su resultado por HTTP. */
export async function leerCredencialesTecnicas(
  repo: RepositorioConfiguracion,
  masterKey: string,
) {
  const pareja = await repo.leer();
  if (!pareja) {
    throw new ConfiguracionError(
      "No hay credenciales fiscales configuradas.",
      409,
    );
  }
  const master = await importarClaveMaestra(masterKey);
  const [certificado, clave] = await Promise.all([
    descifrarCampo(
      pareja.certificado_arca,
      master,
      CLUB_ID,
      "certificado_arca",
    ),
    descifrarCampo(pareja.certificado_key, master, CLUB_ID, "certificado_key"),
  ]);
  return validarPareja(certificado, clave, pareja.certificado_vencimiento);
}
