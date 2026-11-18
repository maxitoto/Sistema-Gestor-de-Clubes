import {
  ContratoFiscalError,
  type IdentidadFiscal,
  objetoCerrado,
  validarIdentidadFiscal,
} from "./identidad-fiscal.ts";
export interface AlicuotaFiscal {
  Id: number;
  BaseImp: string;
  Importe: string;
}
export interface TributoFiscal {
  Id: number;
  Desc: string;
  BaseImp: string;
  Alic: string;
  Importe: string;
}
export interface ComprobanteAsociadoFiscal {
  Tipo: number;
  PtoVta: number;
  Nro: string;
  Cuit?: string;
  CbteFch?: string;
}
export interface DetalleFiscal {
  Concepto: 1 | 2 | 3;
  DocTipo: number;
  DocNro: string;
  CondicionIVAReceptorId: number;
  CbteDesde: string;
  CbteHasta: string;
  CbteFch: string;
  ImpTotal: string;
  ImpTotConc: string;
  ImpNeto: string;
  ImpOpEx: string;
  ImpTrib: string;
  ImpIVA: string;
  MonId: string;
  MonCotiz: string;
  FchServDesde?: string;
  FchServHasta?: string;
  FchVtoPago?: string;
  Iva?: AlicuotaFiscal[];
  Tributos?: TributoFiscal[];
  CbtesAsoc?: ComprobanteAsociadoFiscal[];
}
export interface SolicitudFiscal {
  version: 1;
  identidad: IdentidadFiscal;
  emisor: { nombre: string; domicilio: string };
  receptor: { nombre: string; domicilio?: string };
  detalle: DetalleFiscal;
}
function texto(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max &&
    value.trim() === value &&
    !Array.from(value).some((char) =>
      char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127
    );
}
function entero(value: unknown, min = 1, max = 999): value is number {
  return Number.isSafeInteger(value) && Number(value) >= min &&
    Number(value) <= max;
}
export function centavosFiscales(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,12})\.\d{2}$/.test(value)) {
    throw new ContratoFiscalError(
      "El importe debe ser decimal canónico de dos lugares.",
    );
  }
  return BigInt(value.replace(".", ""));
}
export function fechaFiscalValida(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return false;
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === iso;
}
export function validarSolicitudFiscal(value: unknown): SolicitudFiscal {
  const row = objetoCerrado(value, [
    "version",
    "identidad",
    "emisor",
    "receptor",
    "detalle",
  ]);
  if (row.version !== 1) {
    throw new ContratoFiscalError(
      "La versión del snapshot fiscal no está soportada.",
    );
  }
  validarIdentidadFiscal(row.identidad);
  const emisor = objetoCerrado(row.emisor, ["nombre", "domicilio"]),
    receptor = objetoCerrado(row.receptor, ["nombre"], ["domicilio"]);
  if (
    !texto(emisor.nombre, 255) || !texto(emisor.domicilio, 500) ||
    !texto(receptor.nombre, 255) ||
    (receptor.domicilio !== undefined && !texto(receptor.domicilio, 500))
  ) {
    throw new ContratoFiscalError(
      "Faltan los datos documentales confirmados del emisor o receptor.",
    );
  }
  const d = objetoCerrado(row.detalle, [
    "Concepto",
    "DocTipo",
    "DocNro",
    "CondicionIVAReceptorId",
    "CbteDesde",
    "CbteHasta",
    "CbteFch",
    "ImpTotal",
    "ImpTotConc",
    "ImpNeto",
    "ImpOpEx",
    "ImpTrib",
    "ImpIVA",
    "MonId",
    "MonCotiz",
  ], [
    "FchServDesde",
    "FchServHasta",
    "FchVtoPago",
    "Iva",
    "Tributos",
    "CbtesAsoc",
  ]);
  if (
    !entero(d.Concepto, 1, 3) || !entero(d.DocTipo, 1, 999) ||
    typeof d.DocNro !== "string" || !/^(0|[1-9]\d{0,19})$/.test(d.DocNro) ||
    !entero(d.CondicionIVAReceptorId, 1, 99)
  ) {
    throw new ContratoFiscalError(
      "El concepto y los datos tributarios del receptor requieren un mapeo explícito.",
    );
  }
  if (
    (d.DocTipo === 80 || d.DocTipo === 86 || d.DocTipo === 87) &&
    !/^\d{11}$/.test(String(d.DocNro))
  ) {
    throw new ContratoFiscalError(
      "El documento tributario debe tener once dígitos.",
    );
  }
  if (d.DocTipo === 96 && String(d.DocNro).length > 8) {
    throw new ContratoFiscalError(
      "El DNI fiscal no puede exceder ocho dígitos.",
    );
  }
  if (
    typeof d.CbteDesde !== "string" || !/^[1-9]\d{0,11}$/.test(d.CbteDesde) ||
    d.CbteDesde !== d.CbteHasta || !fechaFiscalValida(d.CbteFch)
  ) {
    throw new ContratoFiscalError(
      "La solicitud debe identificar un único número y fecha fiscal válidos.",
    );
  }
  const total = centavosFiscales(d.ImpTotal),
    parts = ["ImpTotConc", "ImpNeto", "ImpOpEx", "ImpTrib", "ImpIVA"].map(
      (key) => centavosFiscales(d[key]),
    );
  if (total <= 0n || parts.reduce((a, b) => a + b, 0n) !== total) {
    throw new ContratoFiscalError(
      "Los componentes del importe no concilian con el total.",
    );
  }
  if (
    typeof d.MonId !== "string" || !/^[A-Z0-9]{3}$/.test(d.MonId) ||
    typeof d.MonCotiz !== "string" ||
    !/^(0|[1-9]\d{0,7})\.\d{6}$/.test(d.MonCotiz) ||
    BigInt(d.MonCotiz.replace(".", "")) <= 0n
  ) {
    throw new ContratoFiscalError(
      "La moneda y cotización deben estar confirmadas y ser canónicas.",
    );
  }
  const fechas = [d.FchServDesde, d.FchServHasta, d.FchVtoPago];
  if (
    (d.Concepto === 2 || d.Concepto === 3 ||
      fechas.some((x) => x !== undefined)) &&
    (!fechas.every(fechaFiscalValida) ||
      String(d.FchServDesde) > String(d.FchServHasta) ||
      String(d.FchVtoPago) < String(d.CbteFch))
  ) {
    throw new ContratoFiscalError(
      "Faltan fechas coherentes de servicio y vencimiento.",
    );
  }
  let iva = 0n, baseIva = 0n;
  if (d.Iva !== undefined) {
    if (!Array.isArray(d.Iva) || d.Iva.length > 20 || !d.Iva.length) {
      throw new ContratoFiscalError("El detalle IVA no es válido.");
    }
    const seen = new Set<number>();
    for (const value of d.Iva) {
      const item = objetoCerrado(value, ["Id", "BaseImp", "Importe"]);
      if (!entero(item.Id) || seen.has(Number(item.Id))) {
        throw new ContratoFiscalError("Alícuotas IVA inválidas o repetidas.");
      }
      seen.add(Number(item.Id));
      baseIva += centavosFiscales(item.BaseImp);
      iva += centavosFiscales(item.Importe);
    }
  }
  if (d.Iva !== undefined && baseIva !== centavosFiscales(d.ImpNeto)) {
    throw new ContratoFiscalError("Las bases IVA no concilian con el neto.");
  }
  if (iva !== centavosFiscales(d.ImpIVA)) {
    throw new ContratoFiscalError("El detalle IVA no concilia.");
  }
  let tributos = 0n;
  if (d.Tributos !== undefined) {
    if (
      !Array.isArray(d.Tributos) || d.Tributos.length > 20 || !d.Tributos.length
    ) throw new ContratoFiscalError("El detalle de tributos no es válido.");
    for (const value of d.Tributos) {
      const item = objetoCerrado(value, [
        "Id",
        "Desc",
        "BaseImp",
        "Alic",
        "Importe",
      ]);
      if (
        !entero(item.Id) || !texto(item.Desc, 255) ||
        typeof item.Alic !== "string" || !/^\d{1,3}\.\d{2}$/.test(item.Alic)
      ) throw new ContratoFiscalError("Tributo inválido.");
      centavosFiscales(item.BaseImp);
      tributos += centavosFiscales(item.Importe);
    }
  }
  if (tributos !== centavosFiscales(d.ImpTrib)) {
    throw new ContratoFiscalError("El detalle de tributos no concilia.");
  }
  if (d.CbtesAsoc !== undefined) {
    if (
      !Array.isArray(d.CbtesAsoc) || !d.CbtesAsoc.length ||
      d.CbtesAsoc.length > 10
    ) throw new ContratoFiscalError("Asociación fiscal inválida.");
    for (const value of d.CbtesAsoc) {
      const item = objetoCerrado(value, ["Tipo", "PtoVta", "Nro"], [
        "Cuit",
        "CbteFch",
      ]);
      if (
        !entero(item.Tipo) || !entero(item.PtoVta, 1, 99999) ||
        typeof item.Nro !== "string" || !/^[1-9]\d{0,11}$/.test(item.Nro) ||
        (item.Cuit !== undefined &&
          (typeof item.Cuit !== "string" || !/^\d{11}$/.test(item.Cuit))) ||
        (item.CbteFch !== undefined && !fechaFiscalValida(item.CbteFch))
      ) throw new ContratoFiscalError("Identidad asociada inválida.");
    }
  }
  return structuredClone(row) as unknown as SolicitudFiscal;
}
export const deserializarSolicitudFiscal = validarSolicitudFiscal;
export function serializarSolicitudFiscal(value: SolicitudFiscal): string {
  const checked = validarSolicitudFiscal(value);
  const sort = (input: unknown): unknown =>
    Array.isArray(input)
      ? input.map(sort)
      : input && typeof input === "object"
      ? Object.fromEntries(
        Object.entries(input).sort(([a], [b]) => a.localeCompare(b)).map((
          [k, v],
        ) => [k, sort(v)]),
      )
      : input;
  return JSON.stringify(sort(checked));
}
