import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import {
  ConfiguracionService,
  leerCredencialesTecnicas,
  type RepositorioConfiguracion,
} from "../functions/_shared/modules/configuracion/application/ConfiguracionService.ts";
import {
  cifrarCampo,
  CLUB_ID,
  descifrarCampo,
  estadoFiscal,
  importarClaveMaestra,
  type ParejaCifrada,
  validarPareja,
} from "../functions/_shared/modules/configuracion/domain/credenciales.ts";

import { leerCamposFormularioFiscal } from "../functions/_shared/modules/configuracion/domain/formulario-fiscal.ts";

let directory = "",
  certificado = "",
  clave = "",
  otraClave = "",
  vencimiento = "",
  desde = new Date(),
  hasta = new Date();
const master = Buffer.alloc(32, 93).toString("base64");
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "club-v2-fiscal-test-"));
  for (const name of ["correcto", "otro"]) {
    const result = Bun.spawnSync([
      "openssl",
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-days",
      "60",
      "-keyout",
      join(directory, name + ".key"),
      "-out",
      join(directory, name + ".crt"),
      "-subj",
      "/CN=Ejercicio v2 sintetico sin autorizacion ARCA",
    ], { stdout: "ignore", stderr: "ignore" });
    if (result.exitCode !== 0) {
      throw new Error(
        "No se pudo generar el material sintético de prueba con OpenSSL.",
      );
    }
  }
  certificado = await readFile(join(directory, "correcto.crt"), "utf8");
  clave = await readFile(join(directory, "correcto.key"), "utf8");
  otraClave = await readFile(join(directory, "otro.key"), "utf8");
  const cert = new X509Certificate(certificado);
  desde = new Date(cert.validFrom);
  hasta = new Date(cert.validTo);
  vencimiento = hasta.toISOString().slice(0, 10);
});
afterAll(async () => {
  if (directory.startsWith(join(tmpdir(), "club-v2-fiscal-test-"))) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("custodia fiscal local", () => {
  test("parsea y verifica una pareja RSA real", () => {
    expect(validarPareja(certificado, clave, vencimiento).vencimiento).toBe(
      vencimiento,
    );
  });
  test("rechaza clave de otra pareja", () => {
    expect(() => validarPareja(certificado, otraClave, vencimiento)).toThrow(
      "no corresponden",
    );
  });
  test("rechaza certificado falso y material concatenado", () => {
    expect(() => validarPareja("no es certificado", clave, vencimiento))
      .toThrow();
    expect(() => validarPareja(certificado + certificado, clave, vencimiento))
      .toThrow();
  });
  test("rechaza fecha incongruente, certificado vencido y aún no válido", () => {
    expect(() => validarPareja(certificado, clave, "2030-01-01")).toThrow(
      "no coincide",
    );
    expect(() =>
      validarPareja(
        certificado,
        clave,
        vencimiento,
        new Date(hasta.getTime() + 1),
      )
    ).toThrow("venció");
    expect(() =>
      validarPareja(
        certificado,
        clave,
        vencimiento,
        new Date(desde.getTime() - 1),
      )
    ).toThrow("todavía");
  });
  test("clave maestra exige Base64 canónico de 32 bytes", async () => {
    await expect(importarClaveMaestra("incorrecta")).rejects.toThrow();
    await expect(importarClaveMaestra(Buffer.alloc(31).toString("base64")))
      .rejects.toThrow();
  });
  test("usa IV distintos y recupera el texto únicamente con la clave y el contexto", async () => {
    const key = await importarClaveMaestra(master);
    const first = await cifrarCampo(clave, key, CLUB_ID, "certificado_key");
    const second = await cifrarCampo(clave, key, CLUB_ID, "certificado_key");
    expect(first.split(".")[0]).toBe("v1");
    expect(first.split(".")[1]).not.toBe(second.split(".")[1]);
    expect(await descifrarCampo(first, key, CLUB_ID, "certificado_key")).toBe(
      clave,
    );
  });
  test("impide intercambiar campo, club, clave maestra o alterar el ciphertext", async () => {
    const key = await importarClaveMaestra(master),
      other = await importarClaveMaestra(
        Buffer.alloc(32, 61).toString("base64"),
      );
    const encrypted = await cifrarCampo(clave, key, CLUB_ID, "certificado_key");
    await expect(descifrarCampo(encrypted, key, CLUB_ID, "certificado_arca"))
      .rejects.toThrow();
    await expect(descifrarCampo(encrypted, key, "otro-club", "certificado_key"))
      .rejects.toThrow();
    await expect(descifrarCampo(encrypted, other, CLUB_ID, "certificado_key"))
      .rejects.toThrow();
    const parts = encrypted.split(".");
    const bytes = Buffer.from(parts[2], "base64");
    bytes[0] ^= 1;
    parts[2] = bytes.toString("base64");
    await expect(
      descifrarCampo(parts.join("."), key, CLUB_ID, "certificado_key"),
    ).rejects.toThrow();
    await expect(
      descifrarCampo(
        encrypted.replace("v1.", "v2."),
        key,
        CLUB_ID,
        "certificado_key",
      ),
    ).rejects.toThrow();
  });
  test("guarda ambos sobres juntos y el lector interno verifica otra vez la pareja", async () => {
    let saved: ParejaCifrada | null = null;
    const repo: RepositorioConfiguracion = {
      leer: () => Promise.resolve(saved),
      reemplazar: (value) => {
        saved = value;
        return Promise.resolve();
      },
    };
    const service = new ConfiguracionService(repo, () => master);
    expect((await service.estado()).configurado).toBe(false);
    const result = await service.guardar(
      certificado,
      clave,
      vencimiento,
      "homologacion",
    );
    expect(Object.keys(result).sort()).toEqual([
      "alerta",
      "configurado",
      "diasRestantes",
      "entorno",
      "vencimiento",
    ]);
    expect(JSON.stringify(saved)).not.toContain("BEGIN");
    expect((await leerCredencialesTecnicas(repo, master)).vencimiento).toBe(
      vencimiento,
    );
    await expect(
      service.guardar(certificado, otraClave, vencimiento, "homologacion"),
    ).rejects.toThrow();
    expect((await leerCredencialesTecnicas(repo, master)).vencimiento).toBe(
      vencimiento,
    );
    await expect(service.guardar(certificado, clave, vencimiento, "produccion"))
      .rejects.toThrow();
  });
  test("fallo del repositorio no anuncia el reemplazo como exitoso", async () => {
    const repo: RepositorioConfiguracion = {
      leer: () => Promise.resolve(null),
      reemplazar: () =>
        Promise.reject(new Error("fallo persistencia sintético")),
    };
    await expect(
      new ConfiguracionService(repo, () => master).guardar(
        certificado,
        clave,
        vencimiento,
        "homologacion",
      ),
    ).rejects.toThrow("persistencia");
  });
  test("alerta al quedar 30 días y conserva vigente el día del vencimiento", () => {
    const pair = {
      certificado_arca: "sobre",
      certificado_key: "sobre",
      certificado_vencimiento: "2026-11-23",
    };
    expect(estadoFiscal(pair, new Date("2026-10-24T12:00:00Z")).alerta).toBe(
      "por_vencer",
    );
    expect(estadoFiscal(pair, new Date("2026-10-23T12:00:00Z")).alerta).toBe(
      "vigente",
    );
    expect(estadoFiscal(pair, new Date("2026-11-23T12:00:00Z")).alerta).toBe(
      "por_vencer",
    );
    expect(estadoFiscal(pair, new Date("2026-11-24T00:00:00Z")).alerta).toBe(
      "vencido",
    );
  });
});

describe("vencimiento derivado del certificado", () => {
  test("sin fecha de formulario conserva notAfter UTC de la pareja", () => {
    expect(validarPareja(certificado, clave).vencimiento).toBe(
      hasta.toISOString().slice(0, 10),
    );
  });
  test("la fecha derivada es UTC aunque otra zona tenga distinto día calendario", () => {
    const timeZone = hasta.getUTCHours() < 12
      ? "Etc/GMT+12"
      : "Pacific/Kiritimati";
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(hasta);
    expect(localDate).not.toBe(vencimiento);
    expect(validarPareja(certificado, clave).vencimiento).toBe(vencimiento);
  });
  test("la fecha legada sigue siendo opcional pero no admite tipo o formato inválidos", () => {
    for (const value of [null, false, 0, {}, "", "02/08/2028", "2028-8-2"]) {
      expect(() => validarPareja(certificado, clave, value as string))
        .toThrow();
    }
    expect(validarPareja(certificado, clave, vencimiento).vencimiento).toBe(
      vencimiento,
    );
  });
  test("derivar la fecha no elude correspondencia ni vigencia", () => {
    expect(() => validarPareja(certificado, otraClave)).toThrow(
      "no corresponden",
    );
    expect(() =>
      validarPareja(
        certificado,
        clave,
        undefined,
        new Date(hasta.getTime() + 1),
      )
    ).toThrow("venció");
    expect(() =>
      validarPareja(
        certificado,
        clave,
        undefined,
        new Date(desde.getTime() - 1),
      )
    ).toThrow("todavía");
  });
  test("guardar sin fecha cifra la pareja y persiste únicamente la fecha oficial", async () => {
    let saved: ParejaCifrada | null = null, writes = 0;
    const repo: RepositorioConfiguracion = {
      leer: () => Promise.resolve(saved),
      reemplazar: (value) => {
        saved = value;
        writes += 1;
        return Promise.resolve();
      },
    };
    const service = new ConfiguracionService(repo, () => master);
    const result = await service.guardar(
      certificado,
      clave,
      undefined,
      "homologacion",
    );
    expect(result.vencimiento).toBe(vencimiento);
    expect(writes).toBe(1);
    expect(saved).toHaveProperty("certificado_vencimiento", vencimiento);
    expect(JSON.stringify(saved)).not.toContain("BEGIN");
    expect((await leerCredencialesTecnicas(repo, master)).vencimiento).toBe(
      vencimiento,
    );
    const before = JSON.stringify(saved);
    await expect(
      service.guardar(certificado, clave, "2030-01-01", "homologacion"),
    ).rejects.toThrow("no coincide");
    await expect(
      service.guardar(certificado, otraClave, undefined, "homologacion"),
    ).rejects.toThrow("no corresponden");
    expect(writes).toBe(1);
    expect(JSON.stringify(saved)).toBe(before);
    if (!saved) throw new Error("No se guardó la pareja sintética");
    saved = {
      ...(saved as ParejaCifrada),
      certificado_vencimiento: "2030-01-01",
    };
    await expect(leerCredencialesTecnicas(repo, master)).rejects.toThrow(
      "no coincide",
    );
  });
});

describe("multipart fiscal sin fecha manual", () => {
  function form() {
    const value = new FormData();
    value.set("certificado", new File([certificado], "certificado.crt"));
    value.set("clave", new File([clave], "privada.key"));
    value.set("entorno", "homologacion");
    return value;
  }
  test("acepta exactamente certificado/clave/entorno y mantiene compatibilidad legada", () => {
    const value = form();
    expect(leerCamposFormularioFiscal(value).vencimiento).toBeUndefined();
    value.set("vencimiento", vencimiento);
    expect(leerCamposFormularioFiscal(value).vencimiento).toBe(vencimiento);
  });
  test("rechaza campos extra, ausentes o duplicados incluso en el campo opcional", () => {
    for (
      const key of [
        "certificado",
        "clave",
        "entorno",
        "vencimiento",
        "adicional",
      ]
    ) {
      const value = form();
      value.append(key, "duplicado");
      if (key === "vencimiento") value.append(key, "otra fecha");
      expect(() => leerCamposFormularioFiscal(value)).toThrow("no permitidos");
    }
    for (const key of ["certificado", "clave", "entorno"]) {
      const value = form();
      value.delete(key);
      expect(() => leerCamposFormularioFiscal(value)).toThrow("no permitidos");
    }
  });
  test("no admite el vencimiento como archivo ni reemplazar archivos por texto", () => {
    for (const key of ["certificado", "clave"]) {
      const value = form();
      value.set(key, "texto sin archivo");
      expect(() => leerCamposFormularioFiscal(value)).toThrow();
    }
    for (const key of ["entorno", "vencimiento"]) {
      const value = form();
      value.set(key, new File(["dato"], "valor.txt"));
      expect(() => leerCamposFormularioFiscal(value)).toThrow();
    }
  });
  test("extensión y límites de bytes conservan las restricciones originales", () => {
    for (
      const [field, filename, bytes] of [
        ["certificado", "certificado.csr", 10],
        ["clave", "clave.txt", 10],
        ["certificado", "grande.crt", 65_537],
        ["clave", "grande.key", 32_769],
      ] as const
    ) {
      const value = form();
      value.set(field, new File([new Uint8Array(bytes)], filename));
      expect(() => leerCamposFormularioFiscal(value)).toThrow();
    }
  });
});
