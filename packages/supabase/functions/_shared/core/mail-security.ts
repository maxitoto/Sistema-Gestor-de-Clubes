const encoder = new TextEncoder();
const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

function key(secret: Uint8Array) {
  return crypto.subtle.importKey(
    "raw",
    secret,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function firmarBaja(id: string, secret: string): Promise<string> {
  if (secret.length < 32) {
    throw new Error(
      "MAIL_UNSUBSCRIBE_SECRET debe tener al menos 32 caracteres aleatorios.",
    );
  }
  return toBase64(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        await key(encoder.encode(secret)),
        encoder.encode(`unsubscribe:v1:${id}`),
      ),
    ),
  )
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verificarBaja(
  id: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  if (secret.length < 32 || !/^[A-Za-z0-9_-]{43}$/.test(signature)) {
    return false;
  }
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await key(encoder.encode(secret)),
      fromBase64(signature.replace(/-/g, "+").replace(/_/g, "/") + "="),
      encoder.encode(`unsubscribe:v1:${id}`),
    );
  } catch {
    return false;
  }
}

export async function verificarSvix(
  body: string,
  headers: Headers,
  secret: string,
  nowMs = Date.now(),
): Promise<boolean> {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (
    !id || !timestamp || !signatures || !/^\d+$/.test(timestamp) ||
    Math.abs(nowMs / 1000 - Number(timestamp)) > 300
  ) return false;
  try {
    const signingKey = await key(fromBase64(secret.replace(/^whsec_/, "")));
    const content = encoder.encode(`${id}.${timestamp}.${body}`);
    for (const signature of signatures.split(" ")) {
      const [version, value] = signature.split(",");
      if (
        version === "v1" && value &&
        await crypto.subtle.verify(
          "HMAC",
          signingKey,
          fromBase64(value),
          content,
        )
      ) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function compararSecreto(
  actual: string | null,
  expected: string,
): Promise<boolean> {
  if (!actual || expected.length < 32) return false;
  const one = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(actual)),
  );
  const two = new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  );
  let different = 0;
  for (let i = 0; i < one.length; i++) different |= one[i] ^ two[i];
  return different === 0;
}
