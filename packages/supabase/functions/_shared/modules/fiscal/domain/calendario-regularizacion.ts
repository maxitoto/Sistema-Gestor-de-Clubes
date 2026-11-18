/** Reloj de negocio: UTC instantes, ventana exacta 24h, horarios anclados sin ráfagas. */
export const MINUTOS_REGULARIZACION = [10, 30, 120, 360, 720, 1380] as const;
export const MAX_REINTENTOS_FISCALES = 6;
export function calendarioRegularizacion(
  inicio: string,
  ahora: Date,
  intentos: number,
) {
  const start = Date.parse(inicio), now = ahora.getTime();
  if (
    !Number.isFinite(start) || !Number.isFinite(now) ||
    !Number.isInteger(intentos) || intentos < 0 || intentos > 6
  ) throw new Error("La ventana fiscal no es válida.");
  const vence = start + 86400000;
  const expirado = now >= vence || intentos >= MAX_REINTENTOS_FISCALES;
  const proximo = expirado
    ? undefined
    : MINUTOS_REGULARIZACION.map((m) => start + m * 60000).find((t) => t > now);
  return {
    vence: new Date(vence).toISOString(),
    expirado,
    proximo: proximo === undefined ? null : new Date(proximo).toISOString(),
    puedeForzar: !expirado && now >= start,
  };
}
