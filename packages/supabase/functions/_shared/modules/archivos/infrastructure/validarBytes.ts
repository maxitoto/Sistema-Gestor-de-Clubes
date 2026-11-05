import { Buffer } from "node:buffer";
import { decode as decodeJpeg } from "jpeg-js";
import { PNG } from "pngjs";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  PDFStream,
} from "pdf-lib";
import {
  ArchivoError,
  type ArchivoValidado,
  LIMITE_EVIDENCIA,
  LIMITE_IMAGEN,
  type TipoArchivo,
} from "../domain/archivo.ts";

const invalid = () =>
  new ArchivoError("El archivo está dañado o su formato no es válido.", 415);
const maxPixels = 16_777_216;
function dimensions(width: number, height: number) {
  if (!width || !height || width * height > maxPixels) {
    throw new ArchivoError(
      "La imagen supera el máximo de 16 megapíxeles o no tiene dimensiones válidas.",
      415,
    );
  }
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) {
    crc ^= value;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
async function png(bytes: Uint8Array) {
  if (
    bytes.length < 45 ||
    ![137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => bytes[i] === value)
  ) throw invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let position = 8,
    width = 0,
    height = 0,
    depth = 0,
    color = -1,
    interlace = 0,
    ended = false,
    idatClosed = false,
    palette = false;
  const parts: Uint8Array[] = [];
  while (position < bytes.length) {
    if (position + 12 > bytes.length) throw invalid();
    const size = view.getUint32(position),
      typeStart = position + 4,
      dataStart = position + 8;
    if (size > bytes.length - dataStart - 4) throw invalid();
    const end = dataStart + size,
      type = String.fromCharCode(...bytes.subarray(typeStart, dataStart));
    if (
      !/^[A-Za-z]{4}$/.test(type) ||
      crc32(bytes.subarray(typeStart, end)) !== view.getUint32(end)
    ) throw invalid();
    if (position === 8 && type !== "IHDR") throw invalid();
    if (type === "IHDR") {
      if (position !== 8 || size !== 13) throw invalid();
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      depth = bytes[dataStart + 8];
      color = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
      dimensions(width, height);
      const depths: Record<number, number[]> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (
        !depths[color]?.includes(depth) || bytes[dataStart + 10] !== 0 ||
        bytes[dataStart + 11] !== 0 || interlace > 1
      ) throw invalid();
    } else if (type === "IDAT") {
      if (idatClosed) throw invalid();
      parts.push(bytes.subarray(dataStart, end));
    } else {
      if (parts.length) idatClosed = true;
      if (type === "IEND") {
        if (size !== 0 || !parts.length || end + 4 !== bytes.length) {
          throw invalid();
        }
        ended = true;
      } else if (
        ["IHDR", "IDAT"].includes(type) ||
        (!/[a-z]/.test(type[0]) && !["PLTE"].includes(type))
      ) throw invalid();
      if (type === "PLTE") {
        if (
          palette || parts.length || size === 0 || size % 3 !== 0 || size > 768
        ) throw invalid();
        palette = true;
      }
    }
    position = end + 4;
  }
  if (!ended || (color === 3 && !palette)) throw invalid();
  const channels: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const passes = interlace
    ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [
      1,
      0,
      2,
      2,
    ], [0, 1, 1, 2]]
    : [[0, 0, 1, 1]];
  const layout = passes.map(([x, y, dx, dy]) => ({
    rows: height <= y ? 0 : Math.ceil((height - y) / dy),
    width: width <= x ? 0 : Math.ceil((width - x) / dx),
  }))
    .filter((pass) => pass.rows && pass.width).map((pass) => ({
      rows: pass.rows,
      length: 1 + Math.ceil(pass.width * channels[color] * depth / 8),
    }));
  const expected = layout.reduce(
    (total, pass) => total + pass.rows * pass.length,
    0,
  );
  if (expected > 70 * 1024 * 1024) throw invalid();
  const stream = new Blob(parts).stream().pipeThrough(
    new DecompressionStream("deflate"),
  );
  const reader = stream.getReader();
  let total = 0, pass = 0, row = 0, column = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > expected) {
        await reader.cancel();
        throw invalid();
      }
      for (const byte of value) {
        if (!layout[pass] || (column === 0 && byte > 4)) throw invalid();
        if (++column === layout[pass].length) {
          column = 0;
          if (++row === layout[pass].rows) {
            row = 0;
            pass++;
          }
        }
      }
    }
  } catch {
    throw invalid();
  } finally {
    reader.releaseLock();
  }
  if (total !== expected || pass !== layout.length) throw invalid();
  try {
    // Preflight above has already verified CRC, dimensions and the complete bounded inflate output.
    const decoded = PNG.sync.read(Buffer.from(bytes), { checkCRC: true });
    if (
      decoded.width !== width || decoded.height !== height ||
      decoded.data.length !== width * height * 4
    ) throw invalid();
  } catch {
    throw invalid();
  }
}
function jpeg(bytes: Uint8Array) {
  if (bytes.length < 20 || bytes[0] !== 255 || bytes[1] !== 216) {
    throw invalid();
  }
  let pos = 2, frame = false, scan = false, tables = false;
  while (pos < bytes.length) {
    if (bytes[pos++] !== 255) throw invalid();
    while (bytes[pos] === 255) pos++;
    const marker = bytes[pos++];
    if (marker === 217) {
      if (!frame || !scan || !tables || pos !== bytes.length) throw invalid();
      try {
        const decoded = decodeJpeg(bytes, {
          useTArray: true,
          tolerantDecoding: false,
          maxResolutionInMP: 16.777216,
          maxMemoryUsageInMB: 192,
        });
        dimensions(decoded.width, decoded.height);
        if (decoded.data.length !== decoded.width * decoded.height * 4) {
          throw invalid();
        }
      } catch {
        throw invalid();
      }
      return;
    }
    if (
      [0, 216, 1].includes(marker) || marker >= 208 && marker <= 215 ||
      pos + 2 > bytes.length
    ) throw invalid();
    const size = (bytes[pos] << 8) | bytes[pos + 1],
      start = pos + 2,
      end = pos + size;
    if (size < 2 || end > bytes.length) throw invalid();
    if ([192, 193, 194].includes(marker)) {
      if (
        size < 11 || frame || bytes[start] !== 8 ||
        ![1, 3, 4].includes(bytes[start + 5]) ||
        size !== 8 + 3 * bytes[start + 5]
      ) throw invalid();
      dimensions(
        (bytes[start + 3] << 8) | bytes[start + 4],
        (bytes[start + 1] << 8) | bytes[start + 2],
      );
      frame = true;
    } else if (marker === 219) {
      if (size < 67) throw invalid();
      tables = true;
    } else if (marker === 218) {
      if (!frame || size < 8 || size !== 6 + 2 * bytes[start]) throw invalid();
      scan = true;
      pos = end;
      const scanStart = pos;
      while (pos < bytes.length) {
        if (bytes[pos] !== 255) {
          pos++;
          continue;
        }
        if (
          bytes[pos + 1] === 0 || bytes[pos + 1] >= 208 && bytes[pos + 1] <= 215
        ) {
          pos += 2;
          continue;
        }
        break;
      }
      if (pos <= scanStart) throw invalid();
      continue;
    } else if (
      marker < 192 || marker > 254 ||
      [195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)
    ) throw invalid();
    pos = end;
  }
  throw invalid();
}
async function pdf(bytes: Uint8Array) {
  const head = new TextDecoder().decode(bytes.subarray(0, 8));
  const tail = new TextDecoder().decode(
    bytes.subarray(Math.max(0, bytes.length - 1024)),
  ).trimEnd();
  if (!/^%PDF-(1\.[0-7]|2\.0)/.test(head) || !tail.endsWith("%%EOF")) {
    throw invalid();
  }
  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    if (document.isEncrypted || document.getPageCount() < 1) throw invalid();
    // Validation is not sanitization; refuse interactive/embedded content instead of rewriting uploaded evidence.
    const forbidden = new Set([
      "JavaScript",
      "JS",
      "Launch",
      "EmbeddedFiles",
      "EmbeddedFile",
      "OpenAction",
      "AA",
      "RichMedia",
      "XFA",
    ]);
    const seen = new Set<PDFObject>();
    const inspect = (object: PDFObject): void => {
      if (seen.has(object)) return;
      seen.add(object);
      if (object instanceof PDFName && forbidden.has(object.decodeText())) {
        throw new ArchivoError(
          "El PDF contiene acciones o archivos incrustados no admitidos.",
          415,
        );
      }
      if (object instanceof PDFStream) inspect(object.dict);
      if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) {
          inspect(key);
          inspect(value);
        }
      }
      if (object instanceof PDFArray) {
        for (let index = 0; index < object.size(); index++) {
          inspect(object.get(index));
        }
      }
    };
    for (const [, object] of document.context.enumerateIndirectObjects()) {
      inspect(object);
    }
    document.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      if (
        !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 ||
        height <= 0
      ) throw invalid();
    });
  } catch (error) {
    if (error instanceof ArchivoError) throw error;
    throw invalid();
  }
}
export async function validarBytes(
  tipo: TipoArchivo,
  bytes: Uint8Array,
  declaredMime = "",
): Promise<ArchivoValidado> {
  const max = tipo === "gasto-evidencia" ? LIMITE_EVIDENCIA : LIMITE_IMAGEN;
  if (!bytes.length || bytes.length > max) {
    throw new ArchivoError(
      `El archivo debe ocupar entre 1 byte y ${max / 1024 / 1024} MB.`,
      413,
    );
  }
  let tipoMime: string, extension: string;
  if (bytes[0] === 137) {
    await png(bytes);
    tipoMime = "image/png";
    extension = "png";
  } else if (bytes[0] === 255 && bytes[1] === 216) {
    jpeg(bytes);
    tipoMime = "image/jpeg";
    extension = "jpg";
  } else if (tipo === "gasto-evidencia" && bytes[0] === 37) {
    await pdf(bytes);
    tipoMime = "application/pdf";
    extension = "pdf";
  } else {throw new ArchivoError(
      tipo === "gasto-evidencia"
        ? "Usá un archivo JPG, PNG o PDF válido."
        : "Usá una imagen JPG o PNG válida.",
      415,
    );}
  if (
    declaredMime && declaredMime !== tipoMime &&
    declaredMime !== "application/octet-stream"
  ) {
    throw new ArchivoError(
      "El tipo declarado no coincide con el contenido del archivo.",
      415,
    );
  }
  return { tipoMime, extension, tamano: bytes.length };
}
