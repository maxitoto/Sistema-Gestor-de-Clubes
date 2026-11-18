import type { ConfiguracionArca } from "../configuracion-arca.ts";
export type RedArca = typeof fetch;
/** La llamada y la lectura completa comparten timeout; no redirects ni TLS inseguro. */
export async function enviarSoap(
  config: ConfiguracionArca,
  url: string,
  action: string,
  body: string,
  red: RedArca,
): Promise<{ status: number; xml: string }> {
  if (url !== config.wsaaUrl && url !== config.wsfeUrl) {
    throw new Error("Endpoint fiscal fuera de homologación.");
  }
  const signal = AbortSignal.timeout(config.timeoutMs);
  const response = await red(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      "SOAPAction": `"${action}"`,
    },
    body,
    redirect: "error",
    signal,
  });
  const length = response.headers.get("Content-Length");
  if (length && Number(length) > config.maxResponseBytes) {
    await response.body?.cancel();
    throw new Error("Respuesta fiscal demasiado grande.");
  }
  if (!response.body) throw new Error("Respuesta fiscal vacía.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > config.maxResponseBytes) {
        throw new Error("Respuesta fiscal demasiado grande.");
      }
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return {
    status: response.status,
    xml: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  };
}
