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
  fuenteDocumento,
  solicitudDocumento,
} from "./fixtures/documento-sintetico.ts";
function assert(
  value: unknown,
  message = "Aserción documental fallida",
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
  assert(failed);
}
class Repo implements RepositorioDocumentos {
  writes = 0;
  publications = 0;
  signs = 0;
  rejectStorage = false;
  changed = false;
  fuente: FuenteDocumento | null = fuenteDocumento();
  leerFuente() {
    return Promise.resolve(this.fuente);
  }
  guardar() {
    this.writes++;
    return this.rejectStorage
      ? Promise.reject(new DocumentoError("Storage sin respuesta", 503))
      : Promise.resolve();
  }
  confirmarReferencia() {
    this.publications++;
    return this.changed
      ? Promise.reject(new DocumentoError("Versión cambió", 409))
      : Promise.resolve();
  }
  firmar(path: string) {
    this.signs++;
    return Promise.resolve(
      "http://127.0.0.1:54321/storage/v1/object/sign/club-archivos/" + path,
    );
  }
}
const renderer = new GeneradorPdf();
Deno.test("provisional con número reservado no muestra autorización ni QR", () => {
  const source = fuenteDocumento();
  source.solicitud = solicitudDocumento();
  const model = modeloDocumento(source);
  assert(model.version === "provisional" && model.fiscal === null);
});
Deno.test("autorizado representa emisor/receptor congelados y monto exacto", () => {
  const model = modeloDocumento(fuenteDocumento(true));
  assert(
    model.emisor.nombre === "Club Sintético de Homologación" &&
      model.receptor.documento === "40000000" && model.importe === "1000.00" &&
      model.fiscal?.numero === "42",
  );
});
Deno.test("cambios actuales de nombres y categoría no reescriben el autorizado", async () => {
  const a = fuenteDocumento(true), b = fuenteDocumento(true);
  b.club.nombre = "Nombre posterior";
  b.socio.nombre = "Socio posterior";
  b.concepto = "Actividad renombrada";
  b.periodo = "Otro período";
  assert(
    await rutaDocumento(modeloDocumento(a)) ===
      await rutaDocumento(modeloDocumento(b)),
  );
});
Deno.test("autorización sin snapshot se rechaza", async () => {
  const source = fuenteDocumento(true);
  source.solicitud = null;
  await rejects(() => modeloDocumento(source));
});
Deno.test("autorización con identidad o importe distintos se rechaza", async () => {
  for (const field of ["numero", "puntoVenta", "monto"] as const) {
    const source = fuenteDocumento(true);
    if (field === "numero") source.numero = "43";
    if (field === "puntoVenta") source.puntoVenta = 9;
    if (field === "monto") source.pago.importe = "999.00";
    await rejects(() => modeloDocumento(source));
  }
});
Deno.test("CAE o fecha incompletos no se presentan como documento autorizado", async () => {
  const source = fuenteDocumento(true);
  source.cae = "123";
  await rejects(() => modeloDocumento(source));
  source.cae = "70417054367476";
  source.vencimiento = "2026-02-31";
  await rejects(() => modeloDocumento(source));
});
Deno.test("anulación financiera no genera un nuevo PDF por este recorrido de emisión", async () => {
  const source = fuenteDocumento();
  source.pago.estado = "anulado";
  await rejects(() => modeloDocumento(source));
});
Deno.test("QR oficial codifica únicamente datos autorizados sin Auth", () => {
  const url = datosQr(modeloDocumento(fuenteDocumento(true)));
  const parsed = new URL(url),
    data = JSON.parse(atob(parsed.searchParams.get("p")!));
  assert(
    parsed.origin === "https://www.arca.gob.ar" &&
      parsed.pathname === "/fe/qr/" && data.ver === 1 && data.nroCmp === 42 &&
      data.importe === 1000 && data.tipoCodAut === "E" &&
      data.codAut === 70417054367476,
  );
  assert(!("token" in data) && !("sign" in data));
});
Deno.test("provisional no puede construir QR fiscal", async () => {
  await rejects(() => datosQr(modeloDocumento(fuenteDocumento())));
});
Deno.test("identidad de documento versionada es estable e incluye versión fiscal", async () => {
  const a = await rutaDocumento(modeloDocumento(fuenteDocumento())),
    b = await rutaDocumento(modeloDocumento(fuenteDocumento())),
    c = await rutaDocumento(modeloDocumento(fuenteDocumento(true)));
  assert(
    a === b && a !== c && a.includes("/provisional/") &&
      c.includes("/autorizado/"),
  );
});
Deno.test("PDF real es legible por un lector y determinista al recuperar la misma versión", async () => {
  for (const authorized of [false, true]) {
    const model = modeloDocumento(fuenteDocumento(authorized)),
      a = await renderer.generar(model),
      b = await renderer.generar(model),
      pdf = await PDFDocument.load(a);
    assert(
      pdf.getPageCount() === 1 && a.length > 2000 && a.length === b.length &&
        a.every((byte, index) => byte === b[index]),
    );
  }
});
Deno.test("PDF de campos largos se pagina sin truncar la fuente", async () => {
  const source = fuenteDocumento();
  source.club.domicilio = "Domicilio extenso de prueba. ".repeat(80);
  const bytes = await renderer.generar(modeloDocumento(source));
  assert((await PDFDocument.load(bytes)).getPageCount() >= 2);
});
Deno.test("caracteres no representables fallan como error documental sin cambiar negocio", async () => {
  const source = fuenteDocumento();
  source.socio.nombre = "Persona 😀";
  await rejects(() => renderer.generar(modeloDocumento(source)));
});
Deno.test("UUID inválido o no autorizado no guarda ni firma documentos", async () => {
  const repo = new Repo(),
    useCase = new GenerarPdfComprobanteUseCase(repo, renderer);
  await rejects(() => useCase.ejecutar("id inválido"));
  repo.fuente = null;
  await rejects(() => useCase.ejecutar(fuenteDocumento().comprobanteId));
  assert(repo.writes === 0 && repo.publications === 0 && repo.signs === 0);
});
Deno.test("fallo de Storage no publica referencia ni anuncia descarga", async () => {
  const repo = new Repo();
  repo.rejectStorage = true;
  await rejects(() =>
    new GenerarPdfComprobanteUseCase(repo, renderer).ejecutar(
      fuenteDocumento().comprobanteId,
    )
  );
  assert(repo.publications === 0 && repo.signs === 0);
});
Deno.test("versión cambió durante generación: no firma provisional atrasado", async () => {
  const repo = new Repo();
  repo.changed = true;
  await rejects(() =>
    new GenerarPdfComprobanteUseCase(repo, renderer).ejecutar(
      fuenteDocumento().comprobanteId,
    )
  );
  assert(repo.writes === 1 && repo.publications === 1 && repo.signs === 0);
});
Deno.test("generación recuperable retorna referencia estable y URL temporal de diez minutos", async () => {
  const repo = new Repo(),
    useCase = new GenerarPdfComprobanteUseCase(repo, renderer),
    a = await useCase.ejecutar(fuenteDocumento().comprobanteId),
    b = await useCase.ejecutar(fuenteDocumento().comprobanteId);
  assert(
    a.version === "provisional" && a.storagePath === b.storagePath &&
      a.expiresIn === 600 && repo.publications === 2 && repo.signs === 2,
  );
});

Deno.test("Storage confirma y pierde respuesta: recuperación compara bytes sin sobrescribir", async () => {
  const { RepositorioDocumentosSupabase } = await import(
    "../functions/_shared/modules/fiscal/infrastructure/documentos/RepositorioDocumentosSupabase.ts"
  );
  type Human = ConstructorParameters<typeof RepositorioDocumentosSupabase>[0];
  type Technical = ConstructorParameters<
    typeof RepositorioDocumentosSupabase
  >[1];
  const objects = new Map<string, Uint8Array>();
  let uploads = 0, downloads = 0;
  const technical = {
    storage: {
      from: () => ({
        upload: (
          path: string,
          bytes: Uint8Array,
          options: { upsert: boolean },
        ) => {
          assert(options.upsert === false);
          uploads++;
          const existed = objects.has(path);
          if (!existed) objects.set(path, bytes.slice());
          return Promise.resolve({
            error: { statusCode: existed ? "409" : "503" },
          });
        },
        download: (path: string) => {
          downloads++;
          const bytes = objects.get(path);
          return Promise.resolve(
            bytes
              ? { data: new Blob([bytes]), error: null }
              : { data: null, error: { statusCode: "404" } },
          );
        },
      }),
    },
  } as unknown as Technical;
  const repo = new RepositorioDocumentosSupabase(
    {} as Human,
    technical,
    () => Promise.resolve("unused"),
  );
  const model = modeloDocumento(fuenteDocumento()),
    a = await renderer.generar(model),
    b = await renderer.generar(model),
    path = await rutaDocumento(model);
  const pdf = await PDFDocument.load(a, { updateMetadata: false });
  assert(
    pdf.getCreationDate()?.getTime() ===
        Date.parse(fuenteDocumento().pago.fecha) &&
      pdf.getModificationDate()?.getTime() ===
        Date.parse(fuenteDocumento().pago.fecha),
  );
  await repo.guardar(path, a);
  await repo.guardar(path, b);
  assert(
    uploads === 2 && downloads === 2 && objects.size === 1 &&
      a.every((byte, index) => byte === objects.get(path)![index]),
  );
});
