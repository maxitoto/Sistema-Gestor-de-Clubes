import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Perfil = {
	configuracion: {
		ambiente: "homologacion";
		tipo_factura: number;
		tipo_nota_credito?: number | null;
		concepto: 1 | 2 | 3;
		moneda: "PES";
		cotizacion: "1.000000";
		perfil_importes: { modo: string; ivaId?: number; porcentajeIva?: string };
		usar_periodo_cuota: boolean;
		vencimiento_pago: "fecha_comprobante" | "fin_periodo";
		confirmado: true;
	};
	receptores: {
		socio_id: string;
		doc_tipo: number;
		doc_numero: string;
		condicion_iva_id: number;
		confirmado: true;
	}[];
};

function object(
	v: unknown,
	required: string[],
	optional: string[] = [],
): Record<string, unknown> {
	if (!v || typeof v !== "object" || Array.isArray(v))
		throw new Error("Se esperaba un objeto JSON.");
	const row = v as Record<string, unknown>;
	if (
		required.some((k) => !(k in row)) ||
		Object.keys(row).some((k) => !required.includes(k) && !optional.includes(k))
	)
		throw new Error("El archivo contiene campos faltantes o no admitidos.");
	return row;
}

const integer = (v: unknown, min: number, max: number) =>
	typeof v === "number" && Number.isInteger(v) && v >= min && v <= max;

export function validarPerfilFiscal(v: unknown): Perfil {
	const row = object(v, ["configuracion", "receptores"]);
	const c = object(
		row.configuracion,
		[
			"ambiente",
			"tipo_factura",
			"concepto",
			"moneda",
			"cotizacion",
			"perfil_importes",
			"usar_periodo_cuota",
			"vencimiento_pago",
			"confirmado",
		],
		["tipo_nota_credito"],
	);
	if (
		c.ambiente !== "homologacion" ||
		!integer(c.tipo_factura, 1, 999) ||
		!integer(c.concepto, 1, 3) ||
		c.moneda !== "PES" ||
		c.cotizacion !== "1.000000" ||
		typeof c.usar_periodo_cuota !== "boolean" ||
		c.usar_periodo_cuota !== (c.concepto !== 1) ||
		!["fecha_comprobante", "fin_periodo"].includes(
			String(c.vencimiento_pago),
		) ||
		c.confirmado !== true
	)
		throw new Error(
			"Completar y confirmar decisiones fiscales explícitas. El perfil de negocio sólo admite homologación y montos PES sin conversión.",
		);
	if (
		c.tipo_nota_credito !== undefined &&
		c.tipo_nota_credito !== null &&
		(!integer(c.tipo_nota_credito, 1, 999) ||
			c.tipo_nota_credito === c.tipo_factura)
	)
		throw new Error(
			"El código fiscal de Nota de Crédito debe ser explícito, válido y distinto del de factura; no se deduce automáticamente.",
		);
	const p = object(c.perfil_importes, ["modo"], ["ivaId", "porcentajeIva"]);
	if (
		!["neto_sin_iva", "exento", "no_gravado", "iva_incluido"].includes(
			String(p.modo),
		)
	)
		throw new Error("Falta la clasificación de importes aprobada.");
	if (p.modo === "iva_incluido") {
		if (
			!integer(p.ivaId, 1, 999) ||
			typeof p.porcentajeIva !== "string" ||
			!/^\d{1,3}\.\d{2}$/.test(p.porcentajeIva) ||
			Number(p.porcentajeIva) > 100
		)
			throw new Error("Indicar alícuota y porcentaje explícitos válidos.");
	} else if (Object.keys(p).length !== 1)
		throw new Error("Ese perfil de importes no admite una alícuota.");
	if (
		!Array.isArray(row.receptores) ||
		row.receptores.length < 1 ||
		row.receptores.length > 10000
	)
		throw new Error("Indicar entre 1 y 10000 receptores de prueba autorizados.");
	const ids = new Set<string>();
	for (const entry of row.receptores) {
		const r = object(entry, [
			"socio_id",
			"doc_tipo",
			"doc_numero",
			"condicion_iva_id",
			"confirmado",
		]);
		if (
			typeof r.socio_id !== "string" ||
			!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
				r.socio_id,
			) ||
			ids.has(r.socio_id.toLowerCase()) ||
			!integer(r.doc_tipo, 1, 999) ||
			typeof r.doc_numero !== "string" ||
			!/^(0|[1-9]\d{0,19})$/.test(r.doc_numero) ||
			!integer(r.condicion_iva_id, 1, 99) ||
			r.confirmado !== true
		)
			throw new Error(
				"Completar identidad, documento y condición IVA de cada receptor, sin duplicados.",
			);
		if (
			([80, 86, 87].includes(r.doc_tipo as number) &&
				!/^\d{11}$/.test(r.doc_numero)) ||
			(r.doc_tipo === 96 && !/^\d{7,8}$/.test(r.doc_numero))
		)
			throw new Error(
				"El formato del documento no coincide con el tipo elegido.",
			);
		ids.add(r.socio_id.toLowerCase());
	}
	return structuredClone(row) as unknown as Perfil;
}

async function main() {
	const args = process.argv.slice(2);
	if (args.length !== 2 || args[0] !== "--archivo")
		throw new Error(
			"Uso: bun run fiscal:perfil --archivo <ruta-perfil-fiscal.json>",
		);
	const source = resolve(process.cwd(), args[1]!);
	const bytes = readFileSync(source);
	if (bytes.length > 2_000_000) throw new Error("Archivo demasiado grande.");
	let value: unknown;
	try {
		value = JSON.parse(bytes.toString("utf8"));
	} catch {
		throw new Error("El archivo no es JSON válido.");
	}
	const perfil = validarPerfilFiscal(value);
	const name =
		process.env.SUPABASE_DB_CONTAINER || "supabase_db_sistema-club-los-andes";
	const sql = `BEGIN;
 SET LOCAL lock_timeout='10s';
 INSERT INTO private.fiscal_configuracion(club_id,ambiente,tipo_factura,concepto,moneda,cotizacion,perfil_importes,usar_periodo_cuota,vencimiento_pago,confirmado)
 SELECT '00000000-0000-0000-0000-000000000000'::uuid,j->>'ambiente',(j->>'tipo_factura')::integer,(j->>'concepto')::integer,j->>'moneda',(j->>'cotizacion')::numeric,j->'perfil_importes',(j->>'usar_periodo_cuota')::boolean,j->>'vencimiento_pago',(j->>'confirmado')::boolean FROM (SELECT (:'perfil')::jsonb->'configuracion' j)t
 ON CONFLICT(club_id) DO UPDATE SET ambiente=excluded.ambiente,tipo_factura=excluded.tipo_factura,concepto=excluded.concepto,moneda=excluded.moneda,cotizacion=excluded.cotizacion,perfil_importes=excluded.perfil_importes,usar_periodo_cuota=excluded.usar_periodo_cuota,vencimiento_pago=excluded.vencimiento_pago,confirmado=excluded.confirmado,updated_at=clock_timestamp();
 INSERT INTO private.fiscal_receptores(socio_id,doc_tipo,doc_numero,condicion_iva_id,confirmado)
 SELECT (j->>'socio_id')::uuid,(j->>'doc_tipo')::integer,j->>'doc_numero',(j->>'condicion_iva_id')::integer,(j->>'confirmado')::boolean FROM jsonb_array_elements((:'perfil')::jsonb->'receptores')j
 ON CONFLICT(socio_id) DO UPDATE SET doc_tipo=excluded.doc_tipo,doc_numero=excluded.doc_numero,condicion_iva_id=excluded.condicion_iva_id,confirmado=excluded.confirmado,updated_at=clock_timestamp();
 COMMIT;`;
	const child = Bun.spawn(
		[
			"docker",
			"exec",
			"-i",
			name,
			"psql",
			"-X",
			"-U",
			"postgres",
			"-d",
			"postgres",
			"-v",
			"ON_ERROR_STOP=1",
			"-v",
			`perfil=${JSON.stringify(perfil)}`,
		],
		{ stdin: "pipe", stdout: "pipe", stderr: "pipe" },
	);
	child.stdin.write(sql);
	child.stdin.end();
	await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	if ((await child.exited) !== 0)
		throw new Error(
			"La base rechazó el perfil; la transacción se revirtió. Revisar valores, socios existentes y migraciones.",
		);
	console.log(
		`Perfil de homologación guardado con ${perfil.receptores.length} receptor(es). No se habilitó la red ni se emitió un comprobante.`,
	);
}

if (import.meta.main)
	main().catch((error) => {
		console.error(
			error instanceof Error
				? error.message
				: "No se pudo configurar el perfil local.",
		);
		process.exitCode = 1;
	});
