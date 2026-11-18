import { XMLParser, XMLValidator } from "fast-xml-parser";
export const WSFE_NS = "http://ar.gov.afip.dif.FEV1/";
export const WSAA_NS = "http://wsaa.view.sua.dvadac.desein.afip.gov";
export const SOAP_NS = "http://schemas.xmlsoap.org/soap/envelope/";
export class XmlArcaError extends Error {
  constructor() {
    super("La respuesta fiscal no tiene una estructura XML confiable.");
  }
}
export interface NodoXml {
  nombre: string;
  espacio: string;
  texto: string;
  hijos: NodoXml[];
}
export function escaparXml(value: string | number): string {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll(
      "'",
      "&apos;",
    );
}
export function etiqueta(nombre: string, value: string | number): string {
  return `<${nombre}>${escaparXml(value)}</${nombre}>`;
}
/** No DTD/entidades externas; límite previo al parseo y nombres de espacio comprobables. */
export function analizarXml(xml: string, maxBytes = 2_000_000): NodoXml {
  if (
    new TextEncoder().encode(xml).length > maxBytes ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true
  ) throw new XmlArcaError();
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: true,
    ignoreDeclaration: true,
    ignorePiTags: true,
  });
  const parsed: unknown = parser.parse(xml);
  let count = 0;
  function nodes(
    input: unknown,
    ns: Record<string, string>,
    depth: number,
  ): NodoXml[] {
    if (depth > 32 || !Array.isArray(input)) throw new XmlArcaError();
    const result: NodoXml[] = [];
    for (const value of input) {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new XmlArcaError();
      }
      const item = value as Record<string, unknown>;
      if ("#text" in item) {
        if (String(item["#text"]).trim()) throw new XmlArcaError();
        continue;
      }
      const names = Object.keys(item).filter((k) => k !== ":@");
      if (names.length !== 1) throw new XmlArcaError();
      const full = names[0];
      if (full.startsWith("?")) continue;
      const scope = { ...ns };
      const attrs = item[":@"];
      if (attrs && typeof attrs === "object") {
        for (const [key, val] of Object.entries(attrs)) {
          if (key === "@_xmlns") {
            scope[""] = String(val);
          } else if (key.startsWith("@_xmlns:")) {
            scope[key.slice(8)] = String(val);
          }
        }
      }
      const parts = full.split(":");
      if (parts.length > 2) throw new XmlArcaError();
      const prefix = parts.length === 2 ? parts[0] : "", name = parts.at(-1)!;
      if (prefix && !scope[prefix]) throw new XmlArcaError();
      const children = item[full];
      if (!Array.isArray(children) || ++count > 20_000) {
        throw new XmlArcaError();
      }
      let text = "";
      const elements: unknown[] = [];
      for (const child of children) {
        if (child && typeof child === "object" && "#text" in child) {
          text += String((child as Record<string, unknown>)["#text"]);
        } else elements.push(child);
      }
      if (text.trim() && elements.length) throw new XmlArcaError();
      result.push({
        nombre: name,
        espacio: scope[prefix] ?? "",
        texto: text.trim(),
        hijos: nodes(elements, scope, depth + 1),
      });
    }
    return result;
  }
  const roots = nodes(parsed, {}, 0);
  if (roots.length !== 1) throw new XmlArcaError();
  return roots[0];
}
export function hijos(
  node: NodoXml,
  name: string,
  ns = node.espacio,
): NodoXml[] {
  return node.hijos.filter((n) => n.nombre === name && n.espacio === ns);
}
export function hijo(node: NodoXml, name: string, ns = node.espacio): NodoXml {
  const matches = hijos(node, name, ns);
  if (matches.length !== 1) throw new XmlArcaError();
  return matches[0];
}
export function opcional(
  node: NodoXml,
  name: string,
  ns = node.espacio,
): NodoXml | undefined {
  const matches = hijos(node, name, ns);
  if (matches.length > 1) throw new XmlArcaError();
  return matches[0];
}
export function texto(node: NodoXml, name: string, ns = node.espacio): string {
  const child = hijo(node, name, ns);
  if (child.hijos.length) throw new XmlArcaError();
  return child.texto;
}
export function resultadoSoap(
  xml: string,
  operacion: string,
  namespace = WSFE_NS,
): NodoXml {
  const envelope = analizarXml(xml);
  if (envelope.nombre !== "Envelope" || envelope.espacio !== SOAP_NS) {
    throw new XmlArcaError();
  }
  const body = hijo(envelope, "Body", SOAP_NS);
  if (body.hijos.length !== 1 || opcional(body, "Fault", SOAP_NS)) {
    throw new XmlArcaError();
  }
  const response = hijo(body, `${operacion}Response`, namespace);
  return hijo(response, `${operacion}Result`, namespace);
}
export function sobreSoap(
  operacion: string,
  contenido: string,
  namespace = WSFE_NS,
): string {
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="${SOAP_NS}"><soap:Body><${operacion} xmlns="${namespace}">${contenido}</${operacion}></soap:Body></soap:Envelope>`;
}
export function decimalSoap(value: string, places: number): string {
  const match = value.trim().match(/^(0|[1-9]\d{0,14})(?:\.(\d{1,12}))?$/);
  if (!match) throw new XmlArcaError();
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (fraction.length > places) throw new XmlArcaError();
  return `${match[1]}.${fraction.padEnd(places, "0")}`;
}
