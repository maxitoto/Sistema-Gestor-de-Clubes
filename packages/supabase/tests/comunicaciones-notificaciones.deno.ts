import { PrepararNotificacionesUseCase } from "../functions/_shared/modules/comunicaciones/application/PrepararNotificacionesUseCase.ts";
import type {
  IntencionCorreo,
  RepositorioNotificaciones,
} from "../functions/_shared/modules/comunicaciones/application/PuertoNotificaciones.ts";
import { DocumentoNotificacionSupabase } from "../functions/_shared/modules/comunicaciones/infrastructure/DocumentoNotificacionSupabase.ts";
import type { FuenteDocumento } from "../functions/_shared/modules/fiscal/index.ts";
import type { SupabaseClient } from "@supabase/supabase-js";
function assert(v: unknown, m = "Falló una garantía de notificación") {
  if (!v) throw new Error(m);
}
const id = "10000000-0000-0000-0000-000000000001",
  reserva = "20000000-0000-0000-0000-000000000002";
const fuente: FuenteDocumento = {
  comprobanteId: id,
  pagoId: reserva,
  tipo: "factura",
  estadoFiscal: "pendiente_cae",
  puntoVenta: 1,
  numero: null,
  cae: null,
  vencimiento: null,
  solicitud: null,
  actualizadoEn: "2026-10-26T10:00:00Z",
  pago: {
    estado: "completado",
    importe: "1000.00",
    fecha: "2026-10-26T10:00:00Z",
    medio: "efectivo",
  },
  club: {
    nombre: "Club sintético",
    cuit: "30000000007",
    domicilio: "Calle de prueba 1",
  },
  socio: { nombre: "Persona sintética", documento: "00000000" },
  concepto: "Actividad de prueba",
  periodo: "10/2026",
};
function intencion(): IntencionCorreo {
  return {
    id,
    reserva,
    evento: "cobro_confirmado",
    operacion_id: id,
    version_documento: "provisional",
    destinatario_snapshot: "persona@example.test",
    fuente_documento: structuredClone(fuente),
    documento_path: null,
  };
}
function repo(items: IntencionCorreo[]) {
  const calls: string[] = [];
  const value: RepositorioNotificaciones = {
    reclamar: async (limit) => {
      assert(limit === 10);
      return items;
    },
    confirmarDocumento: async (i, rv, path) => {
      assert(i === id && rv === reserva && path.endsWith(".pdf"));
      calls.push("pdf");
    },
    encolar: async (i, rv) => {
      assert(i === id && rv === reserva);
      calls.push("encolar");
    },
    registrarFallo: async (_i, _rv, c) => {
      calls.push(c);
    },
  };
  return { value, calls };
}
Deno.test("documento se confirma antes de encolar y usa destino/versión congelados", async () => {
  const i = intencion(), x = repo([i]);
  const result = await new PrepararNotificacionesUseCase(x.value, {
    generar: async (actual) => {
      assert(
        actual.destinatario_snapshot === "persona@example.test" &&
          actual.version_documento === "provisional",
      );
      return "documento.pdf";
    },
  }).ejecutar();
  assert(result.preparadas === 1 && x.calls.join(",") === "pdf,encolar");
});
Deno.test("fallo documental conserva intención recuperable y continúa otro resultado", async () => {
  const x = repo([intencion(), {
    ...intencion(),
    evento: "reporte_mensual",
    fuente_documento: null,
    version_documento: null,
  }]);
  const result = await new PrepararNotificacionesUseCase(x.value, {
    generar: async () => {
      throw new Error("SECRETOS_NO_REFLEJAR");
    },
  }).ejecutar();
  assert(
    result.pendientes === 1 && result.preparadas === 1 &&
      x.calls.join(",") === "PDF_NO_DISPONIBLE,encolar",
  );
});
Deno.test("reporte y alerta no generan PDF ni repiten el job", async () => {
  const x = repo(
    ["reporte_mensual", "alerta_fiscal"].map((evento) => ({
      ...intencion(),
      evento,
      fuente_documento: null,
      version_documento: null,
    })),
  );
  await new PrepararNotificacionesUseCase(x.value, {
    generar: () => {
      throw new Error("No corresponde");
    },
  }).ejecutar();
  assert(x.calls.join(",") === "encolar,encolar");
});
Deno.test("fuente ausente en comprobante no inventa documento", async () => {
  const x = repo([{ ...intencion(), fuente_documento: null }]);
  await new PrepararNotificacionesUseCase(x.value, {
    generar: () => {
      throw new Error("No se llama");
    },
  }).ejecutar();
  assert(x.calls.join(",") === "NOTIFICACION_NO_CONFIRMADA");
});
Deno.test("presupuesto temporal deja claims para recuperación sin ejecutar fuera de plazo", async () => {
  const x = repo([intencion()]);
  const result = await new PrepararNotificacionesUseCase(x.value, {
    generar: () => {
      throw new Error("No se llama");
    },
  }).ejecutar(100, () => 100);
  assert(!result.preparadas && !x.calls.length);
});
function storage() {
  const objects = new Map<string, Uint8Array>();
  const calls: string[] = [];
  let reference: unknown = null;
  const db = {
    from: () => {
      throw new Error("No se lee estado financiero actual");
    },
    rpc: async () => ({ data: reference, error: null }),
    storage: {
      from: (bucket: string) => {
        assert(bucket === "club-archivos");
        return {
          upload: async (
            path: string,
            bytes: Uint8Array,
            options: { upsert: boolean },
          ) => {
            assert(options.upsert === false);
            calls.push("guardar");
            if (objects.has(path)) return { error: { message: "Existe" } };
            objects.set(path, bytes.slice());
            return { error: null };
          },
          download: async (path: string) => ({
            error: objects.has(path) ? null : { message: "Ausente" },
            data: objects.has(path) ? new Blob([objects.get(path)!]) : null,
          }),
        };
      },
    },
  };
  return {
    objects,
    calls,
    db: db as unknown as SupabaseClient,
    setReference: (v: unknown) => reference = v,
  };
}
Deno.test("PDF real se recupera igual desde la fuente histórica sin consultar cb actual", async () => {
  const x = storage(),
    doc = new DocumentoNotificacionSupabase(x.db),
    i = intencion();
  const path = await doc.generar(i);
  const before = x.objects.get(path)!.slice();
  assert(new TextDecoder().decode(before.subarray(0, 5)) === "%PDF-");
  i.documento_path = path;
  await doc.generar(i);
  assert(x.objects.size === 1);
  x.setReference({
    storagePath: path,
    nombreArchivo: "comprobante-provisional.pdf",
    fuenteDocumento: i.fuente_documento,
    versionDocumento: "provisional",
  });
  x.objects.clear();
  const attachment = await doc.adjunto(id, reserva);
  assert(
    attachment?.tipo === "application/pdf" &&
      attachment.bytes.every((v, n) => v === before[n]) &&
      attachment.bytes.length === before.length,
  );
});
Deno.test("una versión autorizada no se fabrica desde un snapshot provisional", async () => {
  const x = storage();
  let rejected = false;
  try {
    await new DocumentoNotificacionSupabase(x.db).generar({
      ...intencion(),
      version_documento: "autorizado",
    });
  } catch {
    rejected = true;
  }
  assert(rejected && !x.calls.length);
});
Deno.test("una ruta diferente no sustituye el documento original", async () => {
  const x = storage();
  let rejected = false;
  try {
    await new DocumentoNotificacionSupabase(x.db).generar({
      ...intencion(),
      documento_path: `comprobantes/${id}/provisional/${"a".repeat(64)}.pdf`,
    });
  } catch {
    rejected = true;
  }
  assert(rejected && !x.calls.length);
});
Deno.test("objeto existente incompatible no se sobreescribe", async () => {
  const x = storage(),
    doc = new DocumentoNotificacionSupabase(x.db),
    i = intencion();
  const path = await doc.generar(i);
  x.objects.set(path, new TextEncoder().encode("%PDF-incompatible"));
  let rejected = false;
  try {
    await doc.generar({ ...i, documento_path: path });
  } catch {
    rejected = true;
  }
  assert(rejected && x.objects.get(path)!.length === 17);
});
