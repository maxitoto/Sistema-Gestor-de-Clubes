import type { ColumnaExportacion, ControlSerializacion } from './types';
import {
	cederExportacion,
	comprobarCancelacion,
	textoXml,
	validarColumnas,
	valorCelda,
} from './types';
import { crearZip } from './zip';

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function referenciaColumna(indice: number): string {
	let i = indice + 1,
		valor = '';
	while (i > 0) {
		valor = String.fromCharCode(65 + ((i - 1) % 26)) + valor;
		i = Math.floor((i - 1) / 26);
	}
	return valor;
}
function celda(referencia: string, valor: string | number | null): string {
	if (valor === null) {
		return `<c r="${referencia}"/>`;
	}
	if (typeof valor === 'number') {
		return `<c r="${referencia}" t="n"><v>${valor}</v></c>`;
	}
	return `<c r="${referencia}" t="inlineStr"><is><t xml:space="preserve">${textoXml(valor)}</t></is></c>`;
}
export async function exportXlsx<Fila>(
	filas: readonly Fila[],
	columnas: readonly ColumnaExportacion<Fila>[],
	control: ControlSerializacion = {},
): Promise<Uint8Array<ArrayBuffer>> {
	validarColumnas(columnas);
	comprobarCancelacion(control.signal);
	const rows = [
		`<row r="1">${columnas.map((c, i) => celda(`${referenciaColumna(i)}1`, c.titulo)).join('')}</row>`,
	];
	for (let i = 0; i < filas.length; i++) {
		const fila = filas[i];
		if (fila === undefined) {
			throw new Error('Falta una fila de la exportación.');
		}
		const numero = i + 2;
		rows.push(
			`<row r="${numero}">${columnas.map((c, j) => celda(`${referenciaColumna(j)}${numero}`, valorCelda(c, fila))).join('')}</row>`,
		);
		if ((i + 1) % 1000 === 0) {
			await cederExportacion(control.signal);
		}
	}
	return crearZip(
		[
			{
				nombre: '[Content_Types].xml',
				texto: `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
			},
			{
				nombre: '_rels/.rels',
				texto: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
			},
			{
				nombre: 'xl/workbook.xml',
				texto: `${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Datos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
			},
			{
				nombre: 'xl/_rels/workbook.xml.rels',
				texto: `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
			},
			{
				nombre: 'xl/styles.xml',
				texto: `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
			},
			{
				nombre: 'xl/worksheets/sheet1.xml',
				texto: `${XML}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${referenciaColumna(columnas.length - 1)}${filas.length + 1}"/><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData>${rows.join('')}</sheetData><autoFilter ref="A1:${referenciaColumna(columnas.length - 1)}${filas.length + 1}"/></worksheet>`,
			},
		],
		control.signal,
	);
}
