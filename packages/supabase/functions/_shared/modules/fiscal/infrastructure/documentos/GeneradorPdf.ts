import {
  PDFDocument,
  type PDFFont,
  type PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import qrcode from "qrcode-generator";
import {
  DocumentoError,
  type ModeloDocumento,
  type PuertoGeneradorPdf,
} from "../../application/PuertoDocumentos.ts";
const blue = rgb(0.12, 0.29, 0.7),
  ink = rgb(0.12, 0.17, 0.25),
  muted = rgb(0.36, 0.41, 0.49),
  border = rgb(0.85, 0.88, 0.92);
const moneda = (value: string) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
function texto(value: string, font: PDFFont): string {
  if (
    value.length > 5000 || [...value].some((char) => {
      const code = char.codePointAt(0)!;
      return code < 9 || (code > 10 && code < 32) || code === 127;
    })
  ) {
    throw new DocumentoError(
      "El texto del comprobante no se puede representar en el PDF.",
    );
  }
  const clean = value.replace(/[\t\u00a0\u202f]/g, " ");
  try {
    font.encodeText(clean.replace(/\n/g, " "));
  } catch {
    throw new DocumentoError(
      "El comprobante contiene caracteres que esta plantilla PDF no puede representar. El cobro no se modifica.",
    );
  }
  return clean;
}
export function datosQr(modelo: ModeloDocumento): string {
  const fiscal = modelo.fiscal;
  if (modelo.version !== "autorizado" || !fiscal) {
    throw new DocumentoError("El documento provisional no tiene QR fiscal.");
  }
  const { identidad, detalle } = fiscal.solicitud;
  // Emit numeric JSON lexemes from canonical decimal/digit strings, preserving 20-digit recipient IDs.
  const fecha = `${detalle.CbteFch.slice(0, 4)}-${
    detalle.CbteFch.slice(4, 6)
  }-${detalle.CbteFch.slice(6, 8)}`;
  const json = `{"ver":1,"fecha":${
    JSON.stringify(fecha)
  },"cuit":${identidad.cuit},"ptoVta":${identidad.puntoVenta},"tipoCmp":${identidad.tipoComprobante},"nroCmp":${fiscal.numero},"importe":${detalle.ImpTotal},"moneda":${
    JSON.stringify(detalle.MonId)
  },"ctz":${detalle.MonCotiz},"tipoDocRec":${detalle.DocTipo},"nroDocRec":${detalle.DocNro},"tipoCodAut":"E","codAut":${fiscal.cae}}`;
  return `https://www.arca.gob.ar/fe/qr/?p=${btoa(json)}`;
}
export class GeneradorPdf implements PuertoGeneradorPdf {
  async generar(modelo: ModeloDocumento): Promise<Uint8Array> {
    const pdf = await PDFDocument.create(),
      regular = await pdf.embedFont(StandardFonts.Helvetica),
      bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const created = new Date(modelo.fechaCobro);
    pdf.setCreationDate(created);
    pdf.setModificationDate(created);
    pdf.setTitle(
      modelo.version === "provisional"
        ? "Comprobante provisional"
        : "Comprobante de homologación autorizado",
    );
    pdf.setAuthor(modelo.emisor.nombre);
    pdf.setCreator("Sistema de Gestión de Clubes");
    pdf.setProducer("Sistema de Gestión de Clubes");
    let page!: PDFPage, y = 0;
    const pages: PDFPage[] = [];
    function nuevaPagina() {
      if (pages.length >= 8) {
        throw new DocumentoError(
          "El contenido del comprobante supera el tamaño de esta plantilla.",
        );
      }
      page = pdf.addPage([595.28, 841.89]);
      pages.push(page);
      y = 790;
    }
    const line = (
      value: string,
      size = 10,
      strong = false,
      color = ink,
      x = 44,
    ) => {
      const font = strong ? bold : regular;
      if (y < 76) nuevaPagina();
      page.drawText(texto(value, font), { x, y, size, font, color });
      y -= size + 6;
    };
    function parrafo(value: string, size = 10, strong = false, width = 507) {
      const font = strong ? bold : regular;
      for (const paragraph of texto(value, font).split("\n")) {
        let pending = "";
        for (const word of paragraph.split(/\s+/)) {
          const candidate = pending ? `${pending} ${word}` : word;
          if (font.widthOfTextAtSize(candidate, size) <= width) {
            pending = candidate;
            continue;
          }
          if (pending) {
            line(pending, size, strong);
            pending = "";
          }
          let fragment = "";
          for (const char of word) {
            if (font.widthOfTextAtSize(fragment + char, size) > width) {
              line(fragment, size, strong);
              fragment = "";
            }
            fragment += char;
          }
          pending = fragment;
        }
        if (pending) line(pending, size, strong);
      }
    }
    const separator = () => {
      y -= 5;
      page.drawLine({
        start: { x: 44, y },
        end: { x: 551, y },
        thickness: 0.8,
        color: border,
      });
      y -= 24;
    };
    nuevaPagina();
    parrafo(modelo.emisor.nombre, 22, true);
    parrafo(modelo.emisor.domicilio, 10);
    line(`CUIT del club: ${modelo.emisor.cuit}`, 10, false, muted);
    separator();
    if (modelo.version === "provisional") {
      page.drawRectangle({
        x: 44,
        y: y - 56,
        width: 507,
        height: 78,
        color: rgb(1, 0.96, 0.84),
        borderColor: rgb(0.86, 0.66, 0.2),
        borderWidth: 0.8,
      });
      y += 2;
      line(
        modelo.tipoDocumento === "nota_credito"
          ? "Nota de Crédito - Trámite de CAE"
          : modelo.anulacion
          ? "Constancia de anulación local"
          : "Comprobante Provisional - Trámite de CAE",
        modelo.tipoDocumento === "nota_credito" || modelo.anulacion ? 16 : 17,
        true,
        ink,
        57,
      );
      line(
        "No acredita autorización fiscal ni contiene un CAE.",
        10,
        false,
        ink,
        57,
      );
      y -= 30;
      line(
        modelo.anulacion
          ? "ANULACIÓN FINANCIERA CONFIRMADA"
          : "COBRO LOCAL CONFIRMADO",
        12,
        true,
        blue,
      );
    } else {
      const fiscal = modelo.fiscal!;
      line(
        `${
          modelo.tipoDocumento === "nota_credito"
            ? "NOTA DE CRÉDITO"
            : "FACTURA"
        } - TIPO FISCAL ${fiscal.solicitud.identidad.tipoComprobante}`,
        18,
        true,
        blue,
      );
      line(
        `Punto de venta ${
          String(fiscal.solicitud.identidad.puntoVenta).padStart(5, "0")
        } - Número ${fiscal.numero.padStart(8, "0")}`,
        13,
        true,
      );
      line("HOMOLOGACION - SIN VALIDEZ FISCAL", 10, true, muted);
      const f = fiscal.solicitud.detalle.CbteFch;
      line(
        `Fecha de emisión: ${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`,
      );
    }
    if (modelo.original) {
      const o = modelo.original;
      parrafo(
        `Factura original: tipo ${o.tipoFiscal}, punto de venta ${
          String(o.puntoVenta).padStart(5, "0")
        }, número ${o.numero.padStart(8, "0")}`,
        10,
        true,
      );
      line(`CUIT del emisor original: ${o.cuit}`, 9, false, muted);
    }
    if (modelo.anulacion) {
      line(
        modelo.estadoDocumento === "anulacion_pendiente"
          ? "Anulación fiscal pendiente de resolución"
          : modelo.tipoDocumento === "nota_credito" &&
              modelo.version === "provisional"
          ? "Nota de Crédito pendiente de autorización"
          : "Anulación del cobro registrada",
        11,
        true,
        muted,
      );
      parrafo(`Motivo: ${modelo.anulacion.motivo}`, 10);
      line(
        `Anulado: ${
          new Intl.DateTimeFormat("es-AR", {
            dateStyle: "short",
            timeStyle: "short",
            timeZone: "America/Argentina/Buenos_Aires",
          }).format(new Date(modelo.anulacion.fecha))
        }`,
        9,
      );
      parrafo(
        "La resolución fiscal no modifica nuevamente caja ni una cuota que haya sido recobrada.",
        9,
      );
    }
    line(`Identificación interna: ${modelo.comprobanteId}`, 9, false, muted);
    separator();
    line("RECEPTOR", 10, true, blue);
    parrafo(modelo.receptor.nombre, 14, true);
    parrafo(`Documento: ${modelo.receptor.documento}`, 10);
    if (modelo.receptor.domicilio) parrafo(modelo.receptor.domicilio, 10);
    separator();
    line(
      modelo.tipoDocumento === "nota_credito"
        ? "DETALLE DE LA NOTA DE CRÉDITO"
        : "DETALLE DEL COBRO",
      10,
      true,
      blue,
    );
    parrafo(modelo.concepto, 12, true);
    line(`Período: ${modelo.periodo}`);
    const date = new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(created);
    line(`Cobrado: ${date}`);
    line(`Medio de pago: ${modelo.medioPago}`);
    separator();
    if (modelo.fiscal) {
      const detail = modelo.fiscal.solicitud.detalle;
      const tipoFiscal = modelo.fiscal.solicitud.identidad.tipoComprobante;
      const etiquetaNeto = tipoFiscal === 11 || tipoFiscal === 13
        ? "Subtotal"
        : "Neto gravado";
      for (
        const [label, value] of [
          [etiquetaNeto, detail.ImpNeto],
          ["No gravado", detail.ImpTotConc],
          ["Exento", detail.ImpOpEx],
          ["Tributos", detail.ImpTrib],
          ["IVA", detail.ImpIVA],
        ]
      ) {
        if (Number(value) > 0) line(`${label}: ${moneda(value)}`);
      }
    }
    y -= 12;
    line(`TOTAL: ${moneda(modelo.importe)} ${modelo.moneda}`, 20, true, blue);
    y -= 14;
    if (modelo.fiscal) {
      if (y < 205) nuevaPagina();
      const qr = qrcode(0, "M");
      qr.addData(datosQr(modelo), "Byte");
      qr.make();
      const count = qr.getModuleCount(),
        moduleSize = 112 / (count + 8),
        left = 44,
        bottom = y - 122;
      page.drawRectangle({
        x: left,
        y: bottom,
        width: 112,
        height: 112,
        color: rgb(1, 1, 1),
      });
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (qr.isDark(row, col)) {
            page.drawRectangle({
              x: left + (col + 4) * moduleSize,
              y: bottom + (count - row + 3) * moduleSize,
              width: moduleSize + 0.02,
              height: moduleSize + 0.02,
              color: rgb(0, 0, 0),
            });
          }
        }
      }
      page.drawText(`CAE: ${modelo.fiscal.cae}`, {
        x: 174,
        y: y - 22,
        size: 12,
        font: bold,
        color: ink,
      });
      page.drawText(
        `Vencimiento del CAE: ${
          modelo.fiscal.vencimiento.split("-").reverse().join("/")
        }`,
        { x: 174, y: y - 43, size: 10, font: regular, color: ink },
      );
      page.drawText("QR de los datos autorizados de homologación.", {
        x: 174,
        y: y - 65,
        size: 9,
        font: regular,
        color: muted,
      });
      y = bottom - 24;
    } else {parrafo(
        modelo.anulacion
          ? "Esta constancia documenta la anulación financiera. No acredita por sí sola autorización fiscal ni modifica nuevamente dinero o deuda."
          : "Este comprobante conserva la constancia del dinero recibido. La documentación fiscal se consulta por separado; un fallo de su generación no vuelve a cobrar la cuota.",
        10,
      );}
    pages.forEach((item, index) => {
      item.drawLine({
        start: { x: 44, y: 55 },
        end: { x: 551, y: 55 },
        thickness: 0.7,
        color: border,
      });
      item.drawText("Sistema de Gestión de Clubes", {
        x: 44,
        y: 39,
        size: 8,
        font: regular,
        color: muted,
      });
      item.drawText(`${index + 1} / ${pages.length}`, {
        x: 515,
        y: 39,
        size: 8,
        font: regular,
        color: muted,
      });
    });
    return await pdf.save({ useObjectStreams: false });
  }
}
