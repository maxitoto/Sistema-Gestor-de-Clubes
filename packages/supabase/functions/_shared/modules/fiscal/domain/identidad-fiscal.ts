export class ContratoFiscalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContratoFiscalError";
  }
}
export interface IdentidadFiscal {
  cuit: string;
  ambiente: "homologacion";
  puntoVenta: number;
  tipoComprobante: number;
}
export function objetoCerrado(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContratoFiscalError("Se esperaba un objeto fiscal.");
  }
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).some((key) =>
      !required.includes(key) && !optional.includes(key)
    ) || required.some((key) => !Object.hasOwn(row, key))
  ) {
    throw new ContratoFiscalError(
      "Los campos fiscales no corresponden al contrato.",
    );
  }
  return row;
}
export function validarIdentidadFiscal(value: unknown): IdentidadFiscal {
  const row = objetoCerrado(value, [
    "cuit",
    "ambiente",
    "puntoVenta",
    "tipoComprobante",
  ]);
  if (
    typeof row.cuit !== "string" || !/^\d{11}$/.test(row.cuit) ||
    row.ambiente !== "homologacion" || !Number.isSafeInteger(row.puntoVenta) ||
    Number(row.puntoVenta) < 1 || Number(row.puntoVenta) > 99999 ||
    !Number.isSafeInteger(row.tipoComprobante) ||
    Number(row.tipoComprobante) < 1 || Number(row.tipoComprobante) > 999
  ) {
    throw new ContratoFiscalError(
      "Falta una identidad fiscal explícita de homologación.",
    );
  }
  return row as unknown as IdentidadFiscal;
}
export function claveSerieFiscal(value: IdentidadFiscal): string {
  const id = validarIdentidadFiscal(value);
  return [id.cuit, id.ambiente, id.puntoVenta, id.tipoComprobante].join(":");
}
