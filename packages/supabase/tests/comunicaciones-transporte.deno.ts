import {
  adjuntosResend,
  EnvioFallido,
  falloPrevioMailpit,
  validarAdjuntosPdf,
} from "../functions/_shared/core/mailer.ts";
function assert(v: unknown) {
  if (!v) throw new Error("Falló un contrato de adjunto");
}
function pdf() {
  const bytes = new Uint8Array(150);
  bytes.set(new TextEncoder().encode("%PDF-"));
  return {
    bytes,
    nombre: "comprobante-privado.pdf",
    tipo: "application/pdf" as const,
  };
}
Deno.test("adjunto conserva bytes y serializa Base64 para Resend", () => {
  const value = pdf();
  assert(validarAdjuntosPdf([value])[0] === value);
  const result = adjuntosResend([value]);
  assert(
    result[0].filename === value.nombre &&
      atob(result[0].content).length === 150,
  );
  assert(!("path" in result[0]));
});
for (
  const [name, value] of Object.entries({
    multiple: [pdf(), pdf()],
    url: [{ ...pdf(), href: "https://externo.invalid/file.pdf" }],
    ruta: [{ ...pdf(), nombre: "../clave.pdf" }],
    tipo: [{ ...pdf(), tipo: "text/html" }],
    formato: [{ ...pdf(), bytes: new Uint8Array(150) }],
    grande: [{ ...pdf(), bytes: new Uint8Array(10485761) }],
  })
) {
  Deno.test(`adjunto rechaza ${name}`, () => {
    let rejected = false;
    try {
      validarAdjuntosPdf(value as Parameters<typeof validarAdjuntosPdf>[0]);
    } catch (error) {
      rejected = error instanceof EnvioFallido && !error.incierto;
    }
    assert(rejected);
  });
}
Deno.test("mensaje sin adjunto conserva compatibilidad", () =>
  assert(validarAdjuntosPdf(undefined).length === 0));

Deno.test("EDNS es previo al SMTP, timeout DATA mantiene incertidumbre", () => {
  assert(falloPrevioMailpit({ code: "EDNS", syscall: "getaddrinfo" }));
  assert(!falloPrevioMailpit({ code: "ETIMEDOUT", command: "DATA" }));
  assert(!falloPrevioMailpit({ code: "ESOCKET", command: "DATA" }));
  assert(!falloPrevioMailpit(new Error("Fallo sin fase conocida")));
});
