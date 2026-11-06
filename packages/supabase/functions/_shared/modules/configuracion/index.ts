export {
  ConfiguracionService,
  leerCredencialesTecnicas,
} from "./application/ConfiguracionService.ts";
export type { RepositorioConfiguracion } from "./application/ConfiguracionService.ts";
export { ConfiguracionError } from "./domain/credenciales.ts";
export { RepositorioConfiguracionSupabase } from "./infrastructure/RepositorioConfiguracionSupabase.ts";
export { leerCamposFormularioFiscal } from "./domain/formulario-fiscal.ts";
