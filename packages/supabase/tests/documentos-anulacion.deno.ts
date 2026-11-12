import { PDFDocument } from "pdf-lib";
import {
  GenerarPdfComprobanteUseCase,
  modeloDocumento,
  rutaDocumento,
} from "../functions/_shared/modules/fiscal/application/GenerarPdfComprobanteUseCase.ts";
import {
  DocumentoError,
  type FuenteDocumento,
  type RepositorioDocumentos,
} from "../functions/_shared/modules/fiscal/application/PuertoDocumentos.ts";
import {
  datosQr,
  GeneradorPdf,
} from "../functions/_shared/modules/fiscal/infrastructure/documentos/GeneradorPdf.ts";
import {
  fuenteConstanciaAnulacion,
  fuenteNotaCredito,
} from "./fixtures/documento-anulacion-sintetico.ts";
import type { SolicitudFiscal } from "../functions/_shared/modules/fiscal/domain/solicitud-fiscal.ts";
function assert(
  value: unknown,
  message = "Aserción PDF de anulación fallida",
): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(fn: () => unknown) {
  let failed = false;
  try {
    await fn();
  } catch (error) {
    failed = error instanceof DocumentoError;
  }
  assert(failed, "Debe rechazar el documento incoherente.");
}
const renderer = new GeneradorPdf();
Deno.test("NC provisional conserva vínculo original y no fabrica CAE o QR", async () => {
  const m = modeloDocumento(fuenteNotaCredito());
  assert(
    m.tipoDocumento === "nota_credito" && m.version === "provisional" &&
      m.original?.numero === "42" && m.fiscal === null,
  );
  await rejects(() => datosQr(m));
});
Deno.test("NC autorizada usa su propia identidad número CAE y relación exacta", () => {
  const m = modeloDocumento(fuenteNotaCredito(true));
  assert(
    m.tipoDocumento === "nota_credito" && m.estadoDocumento === "anulado" &&
      m.version === "autorizado" && m.fiscal?.numero === "5" &&
      m.fiscal.cae === "90000000000002" && m.original?.numero === "42" &&
      m.original.tipoFiscal === 11,
  );
  const data = JSON.parse(atob(new URL(datosQr(m)).searchParams.get("p")!));
  assert(
    data.tipoCmp === 13 && data.nroCmp === 5 &&
      data.codAut === 90000000000002 && data.importe === 1000 &&
      !("token" in data) && !("sign" in data),
  );
});
Deno.test("NC autorizada exige pago anulado y metadata financiera verificable", async () => {
  for (const mode of ["pago", "motivo", "fecha"] as const) {
    const s = fuenteNotaCredito(true);
    if (mode === "pago") s.pago.estado = "completado";
    if (mode === "motivo") s.anulacion!.motivo = "  ";
    if (mode === "fecha") s.anulacion!.fecha = "sinfecha";
    await rejects(() => modeloDocumento(s));
  }
});
Deno.test("NC rechaza original inexistente circular o de otro pago", async () => {
  for (const mode of ["inexistente", "circular", "pago"] as const) {
    const s = fuenteNotaCredito(true);
    if (mode === "inexistente") delete s.original;
    if (mode === "circular") s.original!.id = s.comprobanteId;
    if (mode === "pago") {
      s.original!.pagoId = "44444444-4444-4444-4444-444444444444";
    }
    await rejects(() => modeloDocumento(s));
  }
});
Deno.test("NC no acepta CAE cero en propio documento ni original", async () => {
  for (const mode of ["propio", "original"] as const) {
    const s = fuenteNotaCredito(true);
    if (mode === "propio") s.cae = "00000000000000";
    else s.original!.cae = "00000000000000";
    await rejects(() => modeloDocumento(s));
  }
});
Deno.test("NC valida folio emisor PV tipo e importe de la factura original", async () => {
  for (const mode of ["numero", "pv", "tipo", "cuit", "importe"] as const) {
    const s = fuenteNotaCredito(true);
    if (mode === "numero") s.original!.numero = "43";
    if (mode === "pv") s.original!.puntoVenta = 8;
    if (mode === "tipo") s.original!.tipoFiscal = 1;
    if (mode === "cuit") s.original!.cuit = "20000000001";
    if (mode === "importe") s.pago.importe = "999.00";
    await rejects(() => modeloDocumento(s));
  }
});
Deno.test("NC no adopta asociación ajena ni múltiple ni omitida", async () => {
  for (
    const mode of [
      "omitida",
      "multiple",
      "tipo",
      "pv",
      "numero",
      "cuit",
    ] as const
  ) {
    const s = fuenteNotaCredito(true),
      d = (s.solicitud as SolicitudFiscal).detalle;
    if (mode === "omitida") delete d.CbtesAsoc;
    else if (mode === "multiple") d.CbtesAsoc!.push({ ...d.CbtesAsoc![0]! });
    else if (mode === "tipo") d.CbtesAsoc![0]!.Tipo = 1;
    else if (mode === "pv") d.CbtesAsoc![0]!.PtoVta = 8;
    else if (mode === "numero") d.CbtesAsoc![0]!.Nro = "43";
    else d.CbtesAsoc![0]!.Cuit = "20000000001";
    await rejects(() => modeloDocumento(s));
  }
});
Deno.test("NC rechaza receptor o moneda distintos del original", async () => {
  for (
    const mode of ["documento", "tipoDoc", "moneda", "cotizacion"] as const
  ) {
    const s = fuenteNotaCredito(true),
      d = (s.solicitud as SolicitudFiscal).detalle;
    if (mode === "documento") d.DocNro = "40000001";
    if (mode === "tipoDoc") d.DocTipo = 99;
    if (mode === "moneda") d.MonId = "DOL";
    if (mode === "cotizacion") d.MonCotiz = "2.000000";
    await rejects(() => modeloDocumento(s));
  }
});
Deno.test("autorizado mantiene emisor receptor y período congelados ante renombres", async () => {
  const a = fuenteNotaCredito(true), b = fuenteNotaCredito(true);
  b.club.nombre = "Nombre posterior";
  b.socio.nombre = "Persona renombrada";
  b.concepto = "Actividad posterior";
  b.periodo = "11/2026";
  assert(
    await rutaDocumento(modeloDocumento(a)) ===
      await rutaDocumento(modeloDocumento(b)),
  );
  assert(
    modeloDocumento(b).emisor.nombre === "Club Sintético de Homologación" &&
      modeloDocumento(b).receptor.documento === "40000000",
  );
});
Deno.test("provisional NC identifica emisor y receptor de la factura congelada", () => {
  const s = fuenteNotaCredito();
  s.club.nombre = "Nombre posterior";
  s.socio.nombre = "Persona posterior";
  const m = modeloDocumento(s);
  assert(
    m.emisor.nombre === "Club Sintético de Homologación" &&
      m.receptor.nombre === "Persona Sintética de Prueba",
  );
});
Deno.test("original anulado sin CAE es constancia de anulación no fiscal", async () => {
  const s = fuenteConstanciaAnulacion(), m = modeloDocumento(s);
  assert(
    m.tipoDocumento === "factura" && m.version === "provisional" &&
      m.estadoDocumento === "anulado" &&
      m.anulacion?.motivo === s.anulacion?.motivo && m.fiscal === null,
  );
  await rejects(() => datosQr(m));
});
Deno.test("original autorizado mantiene histórico y resolución pendiente de NC", () => {
  const m = modeloDocumento(fuenteConstanciaAnulacion(true));
  assert(
    m.version === "autorizado" && m.estadoDocumento === "anulacion_pendiente" &&
      m.fiscal?.numero === "42" && m.fiscal.cae === "70417054367476",
  );
});
Deno.test("original ya anulado con CAE conserva el autorizado histórico", () => {
  const s = fuenteConstanciaAnulacion(true);
  s.estadoFiscal = "anulado";
  assert(modeloDocumento(s).fiscal?.numero === "42");
});
Deno.test("PDF real de NC y constancia se abre y bytes son deterministas", async () => {
  for (
    const s of [
      fuenteNotaCredito(),
      fuenteNotaCredito(true),
      fuenteConstanciaAnulacion(),
    ]
  ) {
    const m = modeloDocumento(s),
      a = await renderer.generar(m),
      b = await renderer.generar(m),
      pdf = await PDFDocument.load(a, { updateMetadata: false });
    assert(
      pdf.getPageCount() >= 1 && pdf.getPageCount() <= 2 && a.length > 2000 &&
        a.length === b.length && a.every((v, i) => v === b[i]),
    );
    assert(pdf.getCreationDate()?.getTime() === Date.parse(s.pago.fecha));
  }
});
Deno.test("motivo forma parte de la versión documental y no altera fuente financiera", async () => {
  const a = fuenteConstanciaAnulacion(),
    before = JSON.stringify(a),
    b = structuredClone(a);
  b.anulacion!.motivo = "Otra corrección documentada";
  assert(
    await rutaDocumento(modeloDocumento(a)) !==
      await rutaDocumento(modeloDocumento(b)),
  );
  await renderer.generar(modeloDocumento(a));
  assert(JSON.stringify(a) === before);
});
class Repo implements RepositorioDocumentos {
  signs = 0;
  objects = new Map<string, Uint8Array>();
  published: string | null = null;
  stale = false;
  storageFailure = false;
  constructor(public source: FuenteDocumento) {}
  leerFuente() {
    return Promise.resolve(structuredClone(this.source));
  }
  guardar(path: string, bytes: Uint8Array) {
    if (this.storageFailure) {
      return Promise.reject(new DocumentoError("Storage sin respuesta", 503));
    }
    this.objects.set(path, bytes.slice());
    return Promise.resolve();
  }
  confirmarReferencia(
    _fuente: FuenteDocumento,
    _version: "provisional" | "autorizado",
    path: string,
  ) {
    if (this.stale) {
      return Promise.reject(new DocumentoError("Fuente cambió", 409));
    }
    this.published = path;
    return Promise.resolve();
  }
  firmar(path: string) {
    this.signs++;
    return Promise.resolve(
      "http://127.0.0.1:54321/storage/v1/object/sign/club-archivos/" + path,
    );
  }
}
Deno.test("recuperación documental reutiliza identidad sin mutar pago o caja", async () => {
  const s = fuenteNotaCredito(true),
    before = JSON.stringify(s),
    repo = new Repo(s),
    uc = new GenerarPdfComprobanteUseCase(repo, renderer),
    a = await uc.ejecutar(s.comprobanteId),
    b = await uc.ejecutar(s.comprobanteId);
  assert(
    a.storagePath === b.storagePath && a.expiresIn === 600 &&
      repo.objects.size === 1 && repo.signs === 2 &&
      JSON.stringify(s) === before,
  );
});
Deno.test("CAS rechaza referencia atrasada y nunca firma un PDF incierto", async () => {
  const s = fuenteNotaCredito(), repo = new Repo(s);
  repo.stale = true;
  await rejects(() =>
    new GenerarPdfComprobanteUseCase(repo, renderer).ejecutar(s.comprobanteId)
  );
  assert(
    repo.objects.size === 1 && repo.signs === 0 && repo.published === null,
  );
});
Deno.test("falla Storage sin anunciar PDF ni modificar fuente financiera", async () => {
  const s = fuenteConstanciaAnulacion(),
    before = JSON.stringify(s),
    repo = new Repo(s);
  repo.storageFailure = true;
  await rejects(() =>
    new GenerarPdfComprobanteUseCase(repo, renderer).ejecutar(s.comprobanteId)
  );
  assert(
    repo.signs === 0 && repo.published === null && JSON.stringify(s) === before,
  );
});
