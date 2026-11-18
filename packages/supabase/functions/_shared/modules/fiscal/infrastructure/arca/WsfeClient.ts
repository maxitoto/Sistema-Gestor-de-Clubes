import type {
  AutorizacionArca,
  CodigoArca,
  DiagnosticoArca,
  PuertoArca,
  ResultadoConsultaArca,
  ResultadoSolicitudArca,
  ResultadoUltimoArca,
} from "../../application/PuertoArca.ts";
import {
  type IdentidadFiscal,
  validarIdentidadFiscal,
} from "../../domain/identidad-fiscal.ts";
import {
  type DetalleFiscal,
  fechaFiscalValida,
  type SolicitudFiscal,
  validarSolicitudFiscal,
} from "../../domain/solicitud-fiscal.ts";
import {
  ArcaConfiguracionError,
  type ConfiguracionArca,
  exigirArcaExterno,
} from "../configuracion-arca.ts";
import { enviarSoap, type RedArca } from "./transporte.ts";
import { ArcaAccesoError, type TicketAcceso } from "./WsaaClient.ts";
import {
  decimalSoap,
  etiqueta,
  hijo,
  hijos,
  type NodoXml,
  opcional,
  resultadoSoap,
  sobreSoap,
  texto,
  WSFE_NS,
  XmlArcaError,
} from "./xml.ts";
interface AutenticadorWsaa {
  obtener(): Promise<TicketAcceso>;
}
const propios: Record<string, string> = {
  "500": "El servicio fiscal informó un error interno.",
  "501": "El servicio fiscal informó un error de base de datos.",
  "502": "El autorizador fiscal informó una transacción activa.",
  "600": "El servicio fiscal no confirmó la autenticación.",
  "601": "La CUIT representada no está incluida en el ticket de acceso.",
  "602": "ARCA informó que no hay datos para la identidad consultada.",
};
const aviso = (
  codigo: string,
  mensaje: string,
): CodigoArca[] => [{ codigo, mensaje }];
function codigos(node: NodoXml, container: string, item: string): CodigoArca[] {
  const root = opcional(node, container);
  if (!root) return [];
  const values = hijos(root, item);
  if (values.length > 30 || values.length !== root.hijos.length) {
    throw new XmlArcaError();
  }
  return values.map((value) => {
    const code = texto(value, "Code");
    if (!/^\d{1,8}$/.test(code)) throw new XmlArcaError();
    return {
      codigo: code,
      mensaje: propios[code] ??
        `ARCA informó el código fiscal ${code}. Consultar su descripción oficial antes de corregir datos.`,
    };
  });
}
function errorPuntosVenta(errors: CodigoArca[]): ArcaAccesoError {
  const codes = [...new Set(errors.map((error) => error.codigo))];
  const suffix = " Códigos WSFE: " + codes.join(", ") + ".";
  if (codes.includes("601")) {
    return new ArcaAccesoError(
      "WSFE_CUIT_NO_AUTORIZADA",
      "La CUIT representada no está incluida en el ticket. Revisar la CUIT guardada y la representación autorizada a wsfe en WSASS." +
        suffix,
    );
  }
  if (codes.includes("600")) {
    return new ArcaAccesoError(
      "WSFE_AUTENTICACION_NO_CONFIRMADA",
      "WSFE no confirmó token y firma para esta operación. Revisar el ticket y el ambiente; no cambiar el punto de venta por este error." +
        suffix,
    );
  }
  if (codes.some((code) => ["500", "501", "502"].includes(code))) {
    return new ArcaAccesoError(
      "WSFE_PUNTOS_VENTA_ERROR_INTERNO",
      "WSFE informó un error interno al consultar puntos de venta. Conservar el diagnóstico y revisar disponibilidad antes de reintentar." +
        suffix,
      true,
    );
  }
  return new ArcaAccesoError(
    "WSFE_PUNTOS_VENTA_RECHAZADOS",
    "WSFE no confirmó la consulta de puntos de venta. Revisar la descripción oficial de los códigos antes de cambiar datos." +
      suffix,
  );
}
function errorEstructuraPuntosVenta(): ArcaAccesoError {
  return new ArcaAccesoError(
    "WSFE_PUNTOS_VENTA_RESPUESTA_INVALIDA",
    "La respuesta de puntos de venta no cumple la estructura SOAP/XML o los tipos esperados. Revisar el adaptador; el punto configurado no quedó validado.",
  );
}
function numero(value: string, allowZero = false): string {
  if (!/^\d{1,20}$/.test(value)) throw new XmlArcaError();
  const result = BigInt(value).toString();
  if (!allowZero && result === "0") throw new XmlArcaError();
  return result;
}
const entero = (node: NodoXml, key: string): number => {
  const value = numero(texto(node, key), true);
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new XmlArcaError();
  return n;
};
function isoFecha(value: string): string {
  if (!fechaFiscalValida(value)) throw new XmlArcaError();
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}
function authXml(ticket: TicketAcceso, cuit: string): string {
  return `<Auth>${etiqueta("Token", ticket.token)}${
    etiqueta("Sign", ticket.sign)
  }${etiqueta("Cuit", cuit)}</Auth>`;
}
export function solicitudWsfeXml(solicitud: SolicitudFiscal): string {
  const s = validarSolicitudFiscal(solicitud), d = s.detalle, i = s.identidad;
  let xml = [
    "Concepto",
    "DocTipo",
    "DocNro",
    "CbteDesde",
    "CbteHasta",
    "CbteFch",
    "ImpTotal",
    "ImpTotConc",
    "ImpNeto",
    "ImpOpEx",
    "ImpTrib",
    "ImpIVA",
  ].map((key) =>
    etiqueta(key, d[key as keyof DetalleFiscal] as string | number)
  ).join("");
  for (const key of ["FchServDesde", "FchServHasta", "FchVtoPago"] as const) {
    if (d[key] !== undefined) xml += etiqueta(key, d[key]!);
  }
  xml += etiqueta("MonId", d.MonId) + etiqueta("MonCotiz", d.MonCotiz) +
    etiqueta("CondicionIVAReceptorId", d.CondicionIVAReceptorId);
  if (d.CbtesAsoc) {
    xml += "<CbtesAsoc>" + d.CbtesAsoc.map((a) =>
      "<CbteAsoc>" + etiqueta("Tipo", a.Tipo) + etiqueta("PtoVta", a.PtoVta) +
      etiqueta("Nro", a.Nro) + (a.Cuit ? etiqueta("Cuit", a.Cuit) : "") +
      (a.CbteFch ? etiqueta("CbteFch", a.CbteFch) : "") + "</CbteAsoc>"
    ).join("") + "</CbtesAsoc>";
  }
  if (d.Tributos) {
    xml += "<Tributos>" + d.Tributos.map((a) =>
      "<Tributo>" + etiqueta("Id", a.Id) + etiqueta("Desc", a.Desc) +
      etiqueta("BaseImp", a.BaseImp) + etiqueta("Alic", a.Alic) +
      etiqueta("Importe", a.Importe) + "</Tributo>"
    ).join("") + "</Tributos>";
  }
  if (d.Iva) {
    xml += "<Iva>" + d.Iva.map((a) =>
      "<AlicIva>" + etiqueta("Id", a.Id) + etiqueta("BaseImp", a.BaseImp) +
      etiqueta("Importe", a.Importe) + "</AlicIva>"
    ).join("") + "</Iva>";
  }
  return `<FeCAEReq><FeCabReq><CantReg>1</CantReg>${
    etiqueta("PtoVta", i.puntoVenta)
  }${
    etiqueta("CbteTipo", i.tipoComprobante)
  }</FeCabReq><FeDetReq><FECAEDetRequest>${xml}</FECAEDetRequest></FeDetReq></FeCAEReq>`;
}
function autorizacion(
  id: IdentidadFiscal,
  d: DetalleFiscal,
  cae: string,
  vencimiento: string,
): AutorizacionArca {
  if (
    (!/^\d{14}$/.test(cae) || /^0+$/.test(cae)) ||
    isoFecha(vencimiento) < isoFecha(d.CbteFch)
  ) {
    throw new XmlArcaError();
  }
  return {
    identidad: structuredClone(id),
    numero: d.CbteDesde,
    cae,
    vencimiento: isoFecha(vencimiento),
    fecha: d.CbteFch,
    docTipo: d.DocTipo,
    docNro: d.DocNro,
    concepto: d.Concepto,
    moneda: d.MonId,
    cotizacion: d.MonCotiz,
    importeTotal: d.ImpTotal,
    importeNeto: d.ImpNeto,
    importeNoGravado: d.ImpTotConc,
    importeExento: d.ImpOpEx,
    importeIva: d.ImpIVA,
    importeTributos: d.ImpTrib,
    detalle: structuredClone(d),
  };
}
function detalleCoincide(n: NodoXml, d: DetalleFiscal): boolean {
  return entero(n, "Concepto") === d.Concepto &&
    entero(n, "DocTipo") === d.DocTipo &&
    numero(texto(n, "DocNro"), true) === d.DocNro &&
    numero(texto(n, "CbteDesde")) === d.CbteDesde &&
    numero(texto(n, "CbteHasta")) === d.CbteHasta &&
    texto(n, "CbteFch") === d.CbteFch;
}
/** Sólo R/R con identidad íntegra demuestra rechazo. Error genérico o respuesta incompleta conserva incertidumbre. */
export function clasificarSolicitudWsfe(
  xml: string,
  solicitud: SolicitudFiscal,
  status = 200,
): ResultadoSolicitudArca {
  try {
    const s = validarSolicitudFiscal(solicitud),
      result = resultadoSoap(xml, "FECAESolicitar"),
      errors = codigos(result, "Errors", "Err"),
      header = hijo(result, "FeCabResp"),
      details = hijo(result, "FeDetResp"),
      rows = hijos(details, "FECAEDetResponse");
    if (
      status !== 200 || rows.length !== 1 || details.hijos.length !== 1 ||
      entero(header, "CantReg") !== 1 ||
      numero(texto(header, "Cuit")) !== s.identidad.cuit ||
      entero(header, "PtoVta") !== s.identidad.puntoVenta ||
      entero(header, "CbteTipo") !== s.identidad.tipoComprobante ||
      !detalleCoincide(rows[0], s.detalle)
    ) {
      return {
        tipo: "desconocido",
        codigos: errors.length ? errors : aviso(
          "ARCA_IDENTIDAD_NO_COINCIDE",
          "La respuesta no coincide íntegramente con la solicitud reservada.",
        ),
      };
    }
    const detail = rows[0],
      resultHeader = texto(header, "Resultado"),
      resultDetail = texto(detail, "Resultado"),
      observaciones = codigos(detail, "Observaciones", "Obs");
    if (resultHeader === "A" && resultDetail === "A" && !errors.length) {
      return {
        tipo: "autorizado",
        autorizacion: autorizacion(
          s.identidad,
          s.detalle,
          texto(detail, "CAE"),
          texto(detail, "CAEFchVto"),
        ),
        observaciones,
      };
    }
    const cae = opcional(detail, "CAE");
    if (resultHeader === "R" && resultDetail === "R" && !cae?.texto) {
      return {
        tipo: "rechazado",
        codigos: [...errors, ...observaciones].length
          ? [...errors, ...observaciones]
          : aviso(
            "ARCA_RECHAZADO",
            "ARCA rechazó expresamente el detalle de esta solicitud.",
          ),
      };
    }
    return {
      tipo: "desconocido",
      codigos: errors.length ? errors : aviso(
        "ARCA_RESPUESTA_NO_CONCLUYENTE",
        "El resultado no acredita autorización ni rechazo de esta solicitud.",
      ),
    };
  } catch {
    return {
      tipo: "desconocido",
      codigos: aviso(
        "ARCA_RESPUESTA_INCOMPLETA",
        "No se pudo verificar el resultado fiscal recibido. Consultar la misma identidad antes de otro envío.",
      ),
    };
  }
}
function detalleConsulta(n: NodoXml, id: IdentidadFiscal): DetalleFiscal {
  const campos = new Set([
    "Concepto",
    "DocTipo",
    "DocNro",
    "CondicionIVAReceptorId",
    "CbteDesde",
    "CbteHasta",
    "CbteFch",
    "ImpTotal",
    "ImpTotConc",
    "ImpNeto",
    "ImpOpEx",
    "ImpTrib",
    "ImpIVA",
    "MonId",
    "MonCotiz",
    "FchServDesde",
    "FchServHasta",
    "FchVtoPago",
    "Iva",
    "Tributos",
    "CbtesAsoc",
    "Resultado",
    "CodAutorizacion",
    "EmisionTipo",
    "FchVto",
    "FchProceso",
    "Observaciones",
    "PtoVta",
    "CbteTipo",
    "Opcionales",
    "Compradores",
    "PeriodoAsoc",
    "Actividades",
    "CanMisMonExt",
  ]);
  if (
    n.hijos.some((node) =>
      node.espacio !== n.espacio || !campos.has(node.nombre)
    )
  ) throw new XmlArcaError();
  const colecciones: [string, string, string[]][] = [
    ["Iva", "AlicIva", ["Id", "BaseImp", "Importe"]],
    ["Tributos", "Tributo", ["Id", "Desc", "BaseImp", "Alic", "Importe"]],
    ["CbtesAsoc", "CbteAsoc", ["Tipo", "PtoVta", "Nro", "Cuit", "CbteFch"]],
  ];
  for (const [container, item, allowed] of colecciones) {
    const list = opcional(n, container);
    if (
      list &&
      list.hijos.some((row) =>
        row.espacio !== n.espacio || row.nombre !== item ||
        row.hijos.some((field) =>
          field.espacio !== n.espacio || !allowed.includes(field.nombre)
        )
      )
    ) throw new XmlArcaError();
  }
  const detalle: Record<string, unknown> = {
    Concepto: entero(n, "Concepto"),
    DocTipo: entero(n, "DocTipo"),
    DocNro: numero(texto(n, "DocNro"), true),
    CondicionIVAReceptorId: entero(n, "CondicionIVAReceptorId"),
    CbteDesde: numero(texto(n, "CbteDesde")),
    CbteHasta: numero(texto(n, "CbteHasta")),
    CbteFch: texto(n, "CbteFch"),
    MonId: texto(n, "MonId"),
    MonCotiz: decimalSoap(texto(n, "MonCotiz"), 6),
  };
  for (
    const key of [
      "ImpTotal",
      "ImpTotConc",
      "ImpNeto",
      "ImpOpEx",
      "ImpTrib",
      "ImpIVA",
    ]
  ) detalle[key] = decimalSoap(texto(n, key), 2);
  for (const key of ["FchServDesde", "FchServHasta", "FchVtoPago"]) {
    const node = opcional(n, key);
    if (node?.texto) detalle[key] = node.texto;
  }
  const iva = opcional(n, "Iva");
  if (iva?.hijos.length) {
    detalle.Iva = hijos(iva, "AlicIva").map((a) => ({
      Id: entero(a, "Id"),
      BaseImp: decimalSoap(texto(a, "BaseImp"), 2),
      Importe: decimalSoap(texto(a, "Importe"), 2),
    }));
  }
  const tributos = opcional(n, "Tributos");
  if (tributos?.hijos.length) {
    detalle.Tributos = hijos(tributos, "Tributo").map((a) => ({
      Id: entero(a, "Id"),
      Desc: texto(a, "Desc"),
      BaseImp: decimalSoap(texto(a, "BaseImp"), 2),
      Alic: decimalSoap(texto(a, "Alic"), 2),
      Importe: decimalSoap(texto(a, "Importe"), 2),
    }));
  }
  const asociados = opcional(n, "CbtesAsoc");
  if (asociados?.hijos.length) {
    detalle.CbtesAsoc = hijos(asociados, "CbteAsoc").map((a) => {
      const cuit = opcional(a, "Cuit")?.texto,
        fecha = opcional(a, "CbteFch")?.texto;
      return {
        Tipo: entero(a, "Tipo"),
        PtoVta: entero(a, "PtoVta"),
        Nro: numero(texto(a, "Nro")),
        ...(cuit ? { Cuit: cuit } : {}),
        ...(fecha ? { CbteFch: fecha } : {}),
      };
    });
  }
  for (
    const name of [
      "Opcionales",
      "Compradores",
      "PeriodoAsoc",
      "Actividades",
      "CanMisMonExt",
    ]
  ) {
    const node = opcional(n, name);
    if (node && (node.texto || node.hijos.length)) throw new XmlArcaError();
  }
  return validarSolicitudFiscal({
    version: 1,
    identidad: id,
    emisor: {
      nombre: "Validación interna de consulta",
      domicilio: "No se persiste",
    },
    receptor: { nombre: "Validación interna de consulta" },
    detalle,
  }).detalle;
}
export function clasificarConsultaWsfe(
  xml: string,
  id: IdentidadFiscal,
  numeroConsultado: string,
  status = 200,
): ResultadoConsultaArca {
  try {
    validarIdentidadFiscal(id);
    numero(numeroConsultado);
    const result = resultadoSoap(xml, "FECompConsultar"),
      errors = codigos(result, "Errors", "Err"),
      data = opcional(result, "ResultGet");
    if (status !== 200) {
      return {
        tipo: "ambiguo",
        codigos: errors.length ? errors : aviso(
          "ARCA_CONSULTA_NO_CONFIABLE",
          "No se confirmó la consulta fiscal.",
        ),
      };
    }
    if (!data && errors.length === 1 && errors[0].codigo === "602") {
      return { tipo: "no_encontrado", codigos: errors };
    }
    if (
      !data || errors.length || texto(data, "Resultado") !== "A" ||
      texto(data, "EmisionTipo") !== "CAE" ||
      entero(data, "PtoVta") !== id.puntoVenta ||
      entero(data, "CbteTipo") !== id.tipoComprobante
    ) {
      return {
        tipo: "ambiguo",
        codigos: errors.length ? errors : aviso(
          "ARCA_CONSULTA_NO_COINCIDE",
          "La consulta no acredita una autorización compatible.",
        ),
      };
    }
    const d = detalleConsulta(data, id);
    if (d.CbteDesde !== numeroConsultado || d.CbteHasta !== numeroConsultado) {
      throw new XmlArcaError();
    }
    return {
      tipo: "encontrado",
      autorizacion: autorizacion(
        id,
        d,
        texto(data, "CodAutorizacion"),
        texto(data, "FchVto"),
      ),
      observaciones: codigos(data, "Observaciones", "Obs"),
    };
  } catch {
    return {
      tipo: "ambiguo",
      codigos: aviso(
        "ARCA_CONSULTA_INCOMPLETA",
        "La respuesta no permite cotejar todos los datos fiscales. Se conserva la incidencia.",
      ),
    };
  }
}
export class WsfeClient implements PuertoArca {
  constructor(
    private config: ConfiguracionArca,
    private wsaa: AutenticadorWsaa,
    private red: RedArca = fetch,
  ) {}
  private async ejecutar(
    operation: string,
    body: string,
    cuit: string,
  ): Promise<{ status: number; xml: string }> {
    exigirArcaExterno(this.config);
    const ticket = await this.wsaa.obtener();
    return await enviarSoap(
      this.config,
      this.config.wsfeUrl,
      WSFE_NS + operation,
      sobreSoap(operation, authXml(ticket, cuit) + body),
      this.red,
    );
  }
  async obtenerUltimoAutorizado(
    id: IdentidadFiscal,
  ): Promise<ResultadoUltimoArca> {
    validarIdentidadFiscal(id);
    try {
      const response = await this.ejecutar(
        "FECompUltimoAutorizado",
        etiqueta("PtoVta", id.puntoVenta) +
          etiqueta("CbteTipo", id.tipoComprobante),
        id.cuit,
      );
      const result = resultadoSoap(response.xml, "FECompUltimoAutorizado"),
        errors = codigos(result, "Errors", "Err");
      if (
        response.status !== 200 || errors.length ||
        entero(result, "PtoVta") !== id.puntoVenta ||
        entero(result, "CbteTipo") !== id.tipoComprobante
      ) {
        return {
          tipo: "no_disponible",
          codigos: errors.length ? errors : aviso(
            "ARCA_ULTIMO_NO_CONFIRMADO",
            "No se verificó el último número autorizado de esta serie.",
          ),
        };
      }
      return {
        tipo: "obtenido",
        numero: numero(texto(result, "CbteNro"), true),
      };
    } catch (error) {
      return {
        tipo: "no_disponible",
        codigos: aviso(
          error instanceof ArcaAccesoError
            ? error.codigo
            : "ARCA_ULTIMO_NO_DISPONIBLE",
          "No se obtuvo un último número confiable; no se reservó un número nuevo desde esta respuesta.",
        ),
      };
    }
  }
  async consultar(
    id: IdentidadFiscal,
    nro: string,
  ): Promise<ResultadoConsultaArca> {
    validarIdentidadFiscal(id);
    numero(nro);
    try {
      const response = await this.ejecutar(
        "FECompConsultar",
        "<FeCompConsReq>" + etiqueta("CbteTipo", id.tipoComprobante) +
          etiqueta("CbteNro", nro) + etiqueta("PtoVta", id.puntoVenta) +
          "</FeCompConsReq>",
        id.cuit,
      );
      return clasificarConsultaWsfe(response.xml, id, nro, response.status);
    } catch (error) {
      return {
        tipo: "ambiguo",
        codigos: aviso(
          error instanceof ArcaAccesoError
            ? error.codigo
            : "ARCA_CONSULTA_NO_DISPONIBLE",
          "No se pudo consultar la identidad fiscal; no habilita otro envío por sí sola.",
        ),
      };
    }
  }
  async solicitar(input: SolicitudFiscal): Promise<ResultadoSolicitudArca> {
    const s = validarSolicitudFiscal(input);
    exigirArcaExterno(this.config);
    let ticket: TicketAcceso;
    try {
      ticket = await this.wsaa.obtener();
    } catch (error) {
      return {
        tipo: "transitorio",
        codigos: aviso(
          error instanceof ArcaAccesoError
            ? error.codigo
            : "WSAA_NO_DISPONIBLE",
          "No se inició la solicitud a WSFE porque falta acceso de autenticación confirmado.",
        ),
      };
    }
    try {
      const response = await enviarSoap(
        this.config,
        this.config.wsfeUrl,
        WSFE_NS + "FECAESolicitar",
        sobreSoap(
          "FECAESolicitar",
          authXml(ticket, s.identidad.cuit) + solicitudWsfeXml(s),
        ),
        this.red,
      );
      return clasificarSolicitudWsfe(response.xml, s, response.status);
    } catch {
      return {
        tipo: "desconocido",
        codigos: aviso(
          "ARCA_RED_DESCONOCIDA",
          "La solicitud pudo llegar a ARCA. Consultar la misma identidad antes de volver a emitir.",
        ),
      };
    }
  }
  async diagnosticar(cuit: string): Promise<DiagnosticoArca> {
    validarIdentidadFiscal({
      cuit,
      ambiente: "homologacion",
      puntoVenta: 1,
      tipoComprobante: 1,
    });
    let response: { status: number; xml: string };
    try {
      response = await this.ejecutar("FEParamGetPtosVenta", "", cuit);
    } catch (error) {
      if (
        error instanceof ArcaAccesoError ||
        error instanceof ArcaConfiguracionError
      ) throw error;
      throw new ArcaAccesoError(
        "WSFE_PUNTOS_VENTA_NO_DISPONIBLE",
        "No se recibió una respuesta completa de WSFE al consultar puntos de venta. Revisar conexión y disponibilidad antes de reintentar.",
        true,
      );
    }
    let result: NodoXml, data: NodoXml | undefined, errors: CodigoArca[];
    try {
      result = resultadoSoap(response.xml, "FEParamGetPtosVenta");
      data = opcional(result, "ResultGet");
      if (
        result.texto ||
        result.hijos.some((child) =>
          child.espacio !== WSFE_NS ||
          !["ResultGet", "Errors", "Events"].includes(child.nombre)
        )
      ) throw new XmlArcaError();
      errors = codigos(result, "Errors", "Err");
      // Los eventos son informativos; validar su estructura sin reflejar Msg.
      codigos(result, "Events", "Evt");
    } catch {
      throw errorEstructuraPuntosVenta();
    }
    if (
      errors.length && errors.every((error) => error.codigo === "602") &&
      data &&
      (data.texto || data.hijos.length)
    ) {
      throw new ArcaAccesoError(
        "WSFE_PUNTOS_VENTA_RESPUESTA_CONTRADICTORIA",
        "WSFE devolvió datos junto con el código602 de ausencia de datos. Conservar el diagnóstico; el punto configurado no quedó validado. Códigos WSFE: 602.",
      );
    }
    const sinDatos = errors.length > 0 &&
      errors.every((error) => error.codigo === "602");
    if (response.status !== 200) {
      if (errors.length && !sinDatos) throw errorPuntosVenta(errors);
      throw new ArcaAccesoError(
        "WSFE_PUNTOS_VENTA_HTTP_NO_EXITOSO",
        "WSFE devolvió HTTP" + response.status +
          " al consultar el listado. No se confirmó un resultado utilizable." +
          (sinDatos ? " Códigos WSFE: 602." : ""),
      );
    }
    if (sinDatos) {
      // Respuesta de negocio válida sin listado; la serie se consulta por separado.
      return {
        autenticado: true,
        ambiente: "homologacion",
        servicio: "wsfe",
        puntosVenta: [],
        ausenciaDatos: "602",
      };
    }
    if (errors.length) throw errorPuntosVenta(errors);
    let puntosVenta: DiagnosticoArca["puntosVenta"];
    try {
      // El WSDL permite ResultGet ausente o una colección sin PtoVenta.
      const rows = data ? hijos(data, "PtoVenta") : [];
      if (data && (data.texto || rows.length !== data.hijos.length)) {
        throw new XmlArcaError();
      }
      puntosVenta = rows.map((row) => {
        if (
          row.texto || row.hijos.some((child) =>
            child.espacio !== WSFE_NS ||
            !["Nro", "EmisionTipo", "Bloqueado", "FchBaja"].includes(
              child.nombre,
            )
          )
        ) throw new XmlArcaError();
        const blocked = texto(row, "Bloqueado"),
          baja = opcional(row, "FchBaja")?.texto ?? "",
          nro = entero(row, "Nro");
        if (blocked !== "S" && blocked !== "N" || nro < 1 || nro > 99999) {
          throw new XmlArcaError();
        }
        return {
          numero: nro,
          emisionTipo: texto(row, "EmisionTipo"),
          bloqueado: blocked === "S",
          bajaFecha: baja && baja !== "NULL" ? isoFecha(baja) : null,
        };
      });
    } catch {
      throw errorEstructuraPuntosVenta();
    }
    return {
      autenticado: true,
      ambiente: "homologacion",
      servicio: "wsfe",
      puntosVenta,
    };
  }
}
