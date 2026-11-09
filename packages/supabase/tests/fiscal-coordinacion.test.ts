import { describe, expect, test } from "bun:test";
import { construirSolicitudFiscal } from "../functions/_shared/modules/fiscal/domain/construir-solicitud.ts";
import type { ContextoFiscal, EjecucionFiscal, AdquisicionFiscal, ModoEjecucionFiscal, MotivoIncidenciaFiscal } from "../functions/_shared/modules/fiscal/domain/intento-fiscal.ts";
import type { SolicitudFiscal } from "../functions/_shared/modules/fiscal/domain/solicitud-fiscal.ts";
import type { AutorizacionArca, DiagnosticoArca, PuertoArca, ResultadoConsultaArca, ResultadoSolicitudArca, ResultadoUltimoArca } from "../functions/_shared/modules/fiscal/application/PuertoArca.ts";
import type { RepositorioIntentosFiscales } from "../functions/_shared/modules/fiscal/application/RepositorioIntentosFiscales.ts";
import { EmitirComprobanteUseCase } from "../functions/_shared/modules/fiscal/application/EmitirComprobanteUseCase.ts";
import { ConciliarIntentoUseCase } from "../functions/_shared/modules/fiscal/application/ConciliarIntentoUseCase.ts";
import { estadoFiscalPublico } from "../functions/_shared/modules/fiscal/application/estado-publico.ts";

// Puerto y repositorio enteramente en memoria: estos tests NO acreditan ARCA ni PostgreSQL.
const ID="50000000-0000-0000-0000-000000000001";
const EXEC="50000000-0000-0000-0000-000000000002";
const clock=()=>new Date("2026-11-01T01:30:00Z");
const copy=<T>(v:T):T=>structuredClone(v);
function contexto():ContextoFiscal {
  return {comprobante:{id:ID,pago_id:ID,tipo:"factura",punto_venta:7,estado_fiscal:"pendiente_cae",numero_comprobante:null,cae:null,cae_vencimiento:null,numero_solicitado:null,solicitud_fiscal:null,pdf_url:null,created_at:"2026-10-01T12:00:00Z",updated_at:"2026-10-01T12:00:00Z"},pago:{id:ID,cuota_id:ID,usuario_id:ID,monto:"121.00",fecha_pago:"2026-10-01T12:00:00Z",estado:"completado",medio_pago:"efectivo",referencia_pago:null},cuota:{id:ID,socio_id:ID,categoria_id:ID,periodo_mes:10,periodo_anio:2026},socio:{id:ID,nombre:"Ana",apellido:"Prueba Sintetica",dni:"30000001",direccion:"  Calle ficticia 10  "},club:{id:ID,nombre:"Club Sintetico",cuit:"30-00000000-0",domicilio_fiscal:"Calle ficticia 1",punto_venta:7,email_contacto:"club@example.test",logo_storage_path:null},configuracion:{ambiente:"homologacion",tipo_factura:11,concepto:1,moneda:"PES",cotizacion:"1.000000",perfil_importes:{modo:"neto_sin_iva"},usar_periodo_cuota:false,vencimiento_pago:"fecha_comprobante",confirmado:true},receptor:{doc_tipo:96,doc_numero:"30000001",condicion_iva_id:5,confirmado:true},ejecucion:null};
}
function autorizacion(s:SolicitudFiscal):AutorizacionArca {
 const d=s.detalle;
 return {identidad:copy(s.identidad),numero:d.CbteDesde,cae:"12345678901234",vencimiento:"20261110",fecha:d.CbteFch,docTipo:d.DocTipo,docNro:d.DocNro,concepto:d.Concepto,moneda:d.MonId,cotizacion:d.MonCotiz,importeTotal:d.ImpTotal,importeNeto:d.ImpNeto,importeNoGravado:d.ImpTotConc,importeExento:d.ImpOpEx,importeIva:d.ImpIVA,importeTributos:d.ImpTrib,detalle:copy(d)};
}
class Repo implements RepositorioIntentosFiscales {
 ctx=contexto(); trace:string[]=[]; incidencias:MotivoIncidenciaFiscal[]=[]; overrides:AdquisicionFiscal|null=null; failConfirm=false;
 get execution(){if(!this.ctx.ejecucion)throw new Error("fixture sin ejecucion");return this.ctx.ejecucion;}
 async leerContexto(_id:string){this.trace.push("leer");return copy(this.ctx);}
 async consultar(_id:string){return copy(this.ctx.ejecucion);}
 async iniciar(_id:string,modo:ModoEjecucionFiscal,id:string):Promise<AdquisicionFiscal>{
  this.trace.push(`iniciar:${modo}:${id}`);
  if(this.overrides)return copy(this.overrides);
  if(this.ctx.ejecucion){this.ctx.ejecucion.version=(BigInt(this.ctx.ejecucion.version)+1n).toString();return {estado:this.execution.posibleEnvio?"conciliacion":"adquirida",motivo:null,ejecucion:copy(this.execution)};}
  this.ctx.ejecucion={id,comprobanteId:ID,serieId:ID,version:"1",estado:"adquirida",identidad:{cuit:"30000000000",ambiente:"homologacion",puntoVenta:7,tipoComprobante:11},numero:null,solicitud:null,posibleEnvio:false,resultado:null,iniciadoEn:clock().toISOString(),cerradoEn:null};
  return {estado:"adquirida",motivo:null,ejecucion:copy(this.execution)};
 }
 async preparar(_id:string,_version:string,numero:string,solicitud:SolicitudFiscal){this.trace.push("preparar");Object.assign(this.execution,{numero,solicitud:copy(solicitud),estado:"preparada"});return copy(this.execution);}
 async marcarEnvio(_id:string,_version:string){this.trace.push("marcar");Object.assign(this.execution,{posibleEnvio:true,estado:"posible_envio"});return copy(this.execution);}
 async registrarIncidencia(_id:string,_version:string,motivo:MotivoIncidenciaFiscal){this.trace.push("incidencia");this.incidencias.push(motivo);this.execution.estado="incidencia";return copy(this.execution);}
 async confirmar(_id:string,_version:string,resultado:ResultadoSolicitudArca){
  this.trace.push(`confirmar:${resultado.tipo}`);if(this.failConfirm)throw new Error("commit sin confirmacion");
  this.execution.resultado=copy(resultado);this.execution.estado=resultado.tipo;
  if(resultado.tipo==="autorizado")Object.assign(this.ctx.comprobante,{estado_fiscal:"valido",numero_comprobante:resultado.autorizacion.numero,cae:resultado.autorizacion.cae,cae_vencimiento:resultado.autorizacion.vencimiento});
  return copy(this.execution);
 }
}
class Arca implements PuertoArca {
 solicitud:SolicitudFiscal|null=null; sends=0; queries=0; diagnosis:DiagnosticoArca={autenticado:true,ambiente:"homologacion",servicio:"wsfe",puntosVenta:[{numero:7,emisionTipo:"CAE",bloqueado:false,bajaFecha:null}]};
 last:ResultadoUltimoArca={tipo:"obtenido",numero:"41"}; result:ResultadoSolicitudArca|null=null; query:ResultadoConsultaArca|null=null; throwSend=false; throwDiagnosis=false; throwQuery=false;
 constructor(private repo:Repo){}
 async diagnosticar(_cuit:string){this.repo.trace.push("diagnosticar");if(this.throwDiagnosis)throw new Error("TA no disponible");return copy(this.diagnosis);}
 async obtenerUltimoAutorizado(){this.repo.trace.push("ultimo");return copy(this.last);}
 async consultar(){this.repo.trace.push("consultar");this.queries++;if(this.throwQuery)throw new Error("sin respuesta");return this.query?copy(this.query):{tipo:"no_encontrado" as const,codigos:[]};}
 async solicitar(s:SolicitudFiscal){this.repo.trace.push("solicitar");expect(this.repo.execution.posibleEnvio).toBe(true);expect(this.repo.execution.solicitud).toEqual(s);this.sends++;this.solicitud=copy(s);if(this.throwSend)throw new Error("timeout SIMULADO");return this.result?copy(this.result):{tipo:"autorizado" as const,autorizacion:autorizacion(s),observaciones:[]};}
}
function escenario(){const repo=new Repo(),arca=new Arca(repo),caso=new EmitirComprobanteUseCase(repo,arca,()=>EXEC,clock);return {repo,arca,caso};}
async function preparada(repo:Repo,posibleEnvio=false){await repo.iniciar(ID,"inicial",EXEC);await repo.preparar(EXEC,"1","42",construirSolicitudFiscal(repo.ctx,"42",clock()));if(posibleEnvio)await repo.marcarEnvio(EXEC,"1");repo.trace=[];}

describe("mapeo explicitamente confirmado",()=>{
 test("fecha fiscal de preparacion en Buenos Aires e identidad numerica",()=>{const s=construirSolicitudFiscal(contexto(),"42",clock());expect(s.detalle.CbteFch).toBe("20261031");expect(s.identidad.cuit).toBe("30000000000");expect(s.receptor).toEqual({nombre:"Ana Prueba Sintetica",domicilio:"Calle ficticia 10"});});
 test("domicilio vacio se omite del snapshot",()=>{const ctx=contexto();ctx.socio.direccion="   ";expect(construirSolicitudFiscal(ctx,"42",clock()).receptor).toEqual({nombre:"Ana Prueba Sintetica"});});
 for(const [modo,campo] of [["neto_sin_iva","ImpNeto"],["exento","ImpOpEx"],["no_gravado","ImpTotConc"]] as const)test(`clasificacion ${modo} sin inferencia de IVA`,()=>{const ctx=contexto();ctx.configuracion!.perfil_importes={modo};const d=construirSolicitudFiscal(ctx,"42",clock()).detalle;expect(d[campo]).toBe("121.00");expect(d.ImpIVA).toBe("0.00");expect(d.Iva).toBeUndefined();expect(BigInt(d.ImpNeto.replace(".",""))+BigInt(d.ImpOpEx.replace(".",""))+BigInt(d.ImpTotConc.replace(".",""))).toBe(12100n);});
 test("IVA incluido se separa en centavos exactos",()=>{const ctx=contexto();ctx.configuracion!.perfil_importes={modo:"iva_incluido",ivaId:5,porcentajeIva:"21.00"};const d=construirSolicitudFiscal(ctx,"42",clock()).detalle;expect(d.ImpNeto).toBe("100.00");expect(d.ImpIVA).toBe("21.00");expect(d.Iva).toEqual([{Id:5,BaseImp:"100.00",Importe:"21.00"}]);});
 test("redondeo de centavo conserva el total",()=>{const ctx=contexto();ctx.pago.monto="0.03";ctx.configuracion!.perfil_importes={modo:"iva_incluido",ivaId:5,porcentajeIva:"21.00"};const d=construirSolicitudFiscal(ctx,"42",clock()).detalle;expect(d.ImpNeto).toBe("0.02");expect(d.ImpIVA).toBe("0.01");});
 test("importe grande no usa punto flotante",()=>{const ctx=contexto();ctx.pago.monto="9999999999999.99";ctx.configuracion!.perfil_importes={modo:"iva_incluido",ivaId:5,porcentajeIva:"21.00"};const d=construirSolicitudFiscal(ctx,"42",clock()).detalle;expect(BigInt(d.ImpNeto.replace(".",""))+BigInt(d.ImpIVA.replace(".",""))).toBe(999999999999999n);});
 test("servicio considera febrero bisiesto y vencimiento de fin de periodo",()=>{const ctx=contexto();Object.assign(ctx.configuracion!,{concepto:2,usar_periodo_cuota:true,vencimiento_pago:"fin_periodo"});Object.assign(ctx.cuota,{periodo_mes:2,periodo_anio:2024});const d=construirSolicitudFiscal(ctx,"42",new Date("2024-02-02T12:00:00Z")).detalle;expect([d.FchServDesde,d.FchServHasta,d.FchVtoPago]).toEqual(["20240201","20240229","20240229"]);});
 test("cuota antigua no fija vencimiento anterior a la fecha fiscal",()=>{const ctx=contexto();Object.assign(ctx.configuracion!,{concepto:3,usar_periodo_cuota:true,vencimiento_pago:"fin_periodo"});const d=construirSolicitudFiscal(ctx,"42",new Date("2026-11-02T12:00:00Z")).detalle;expect(d.FchServHasta).toBe("20261031");expect(d.FchVtoPago).toBe("20261102");});
 test("requiere ambas confirmaciones antes de emitir",()=>{const ctx=contexto();ctx.configuracion!.confirmado=false;expect(()=>construirSolicitudFiscal(ctx,"42",clock())).toThrow();ctx.configuracion!.confirmado=true;ctx.receptor!.confirmado=false;expect(()=>construirSolicitudFiscal(ctx,"42",clock())).toThrow();});
 test("no convierte moneda ni habilita produccion",()=>{const ctx=contexto();ctx.configuracion!.moneda="DOL";expect(()=>construirSolicitudFiscal(ctx,"42",clock())).toThrow();ctx.configuracion!.moneda="PES";ctx.configuracion!.cotizacion="2.000000";expect(()=>construirSolicitudFiscal(ctx,"42",clock())).toThrow();});
 test("no documenta cobro anulado ni nota de credito",()=>{const ctx=contexto();ctx.pago.estado="anulado";expect(()=>construirSolicitudFiscal(ctx,"42",clock())).toThrow();ctx.pago.estado="completado";ctx.comprobante.tipo="nota_credito";expect(()=>construirSolicitudFiscal(ctx,"42",clock())).toThrow();});
});

describe("coordinacion y recuperacion sin reenviar",()=>{
 test("congela y marca antes del unico pedido; confirma despues de red",async()=>{const {repo,arca,caso}=escenario();const result=await caso.ejecutar(ID);expect(result.resultado).toBe("autorizado");expect(arca.sends).toBe(1);expect(repo.trace).toEqual(["leer",`iniciar:inicial:${EXEC}`,"diagnosticar","ultimo","leer","preparar","marcar","solicitar","confirmar:autorizado"]);expect(repo.execution.numero).toBe("42");expect(repo.ctx.pago.estado).toBe("completado");});
 test("factura ya valida no adquiere ni solicita de nuevo",async()=>{const {repo,arca,caso}=escenario();repo.ctx.comprobante.estado_fiscal="valido";expect((await caso.ejecutar(ID)).resultado).toBe("autorizado");expect(repo.trace).toEqual(["leer"]);expect(arca.sends).toBe(0);});
 test("perfil incompleto falla antes de reservar o hacer red",async()=>{const {repo,arca,caso}=escenario();repo.ctx.configuracion=null;await expect(caso.ejecutar(ID)).rejects.toThrow();expect(repo.trace).toEqual(["leer"]);expect(arca.sends).toBe(0);});
 test("otro emisor en curso impide la red",async()=>{const {repo,arca,caso}=escenario();repo.overrides={estado:"en_curso",motivo:null,ejecucion:null};expect((await caso.ejecutar(ID)).resultado).toBe("en_proceso");expect(repo.trace.some(v=>v==="diagnosticar")).toBe(false);expect(arca.sends).toBe(0);});
 test("rechazo terminal retorna sin consultar ni reenviar",async()=>{const {repo,arca,caso}=escenario();await preparada(repo,true);repo.execution.estado="rechazado";repo.overrides={estado:"finalizada",motivo:null,ejecucion:copy(repo.execution)};expect((await caso.ejecutar(ID)).resultado).toBe("rechazado");expect(arca.sends).toBe(0);expect(arca.queries).toBe(0);});
 for(const state of ["ausente","CAEA","bloqueado","baja"] as const)test(`punto de venta ${state} no solicita CAE`,async()=>{const {repo,arca,caso}=escenario();if(state==="ausente")arca.diagnosis.puntosVenta=[];else if(state==="CAEA")arca.diagnosis.puntosVenta[0]!.emisionTipo="CAEA";else if(state==="bloqueado")arca.diagnosis.puntosVenta[0]!.bloqueado=true;else arca.diagnosis.puntosVenta[0]!.bajaFecha="2026-10-01";expect((await caso.ejecutar(ID)).resultado).toBe("pendiente");expect(arca.sends).toBe(0);expect(repo.execution.posibleEnvio).toBe(false);expect(repo.execution.estado).toBe("transitorio");expect(repo.trace.includes("ultimo")).toBe(false);});
 test("fallo de WSAA previo al pedido es transitorio sin marcar envio",async()=>{const {repo,arca,caso}=escenario();arca.throwDiagnosis=true;await caso.ejecutar(ID);expect(repo.execution.estado).toBe("transitorio");expect(repo.execution.posibleEnvio).toBe(false);expect(arca.sends).toBe(0);});
 test("ultimo no disponible impide preparar y enviar",async()=>{const {repo,arca,caso}=escenario();arca.last={tipo:"no_disponible",codigos:[]};await caso.ejecutar(ID);expect(repo.execution.estado).toBe("transitorio");expect(repo.trace.includes("preparar")).toBe(false);expect(arca.sends).toBe(0);});
 test("timeout guarda desconocido y recupera por consulta exacta sin segundo pedido",async()=>{const {repo,arca,caso}=escenario();arca.throwSend=true;expect((await caso.ejecutar(ID)).resultado).toBe("pendiente");expect(repo.execution.estado).toBe("desconocido");expect(repo.execution.posibleEnvio).toBe(true);const stored=copy(repo.execution.solicitud!);arca.query={tipo:"encontrado",autorizacion:autorizacion(stored),observaciones:[]};repo.ctx.configuracion=null;repo.trace=[];expect((await caso.ejecutar(ID)).resultado).toBe("autorizado");expect(arca.sends).toBe(1);expect(arca.queries).toBe(1);expect(repo.execution.solicitud).toEqual(stored);expect(repo.trace).toEqual(["leer",`iniciar:conciliacion:${EXEC}`,"consultar","confirmar:autorizado"]);expect(repo.ctx.pago.estado).toBe("completado");});
 test("respuesta transitoria despues de marcar se trata como desconocida",async()=>{const {repo,arca,caso}=escenario();arca.result={tipo:"transitorio",codigos:[]};await caso.ejecutar(ID);expect(repo.execution.estado).toBe("desconocido");expect(repo.execution.posibleEnvio).toBe(true);expect(arca.sends).toBe(1);});
 test("rechazo fiscal no revierte el cobro",async()=>{const {repo,arca,caso}=escenario();arca.result={tipo:"rechazado",codigos:[{codigo:"PRUEBA",mensaje:"SIMULACION"}]};expect((await caso.ejecutar(ID)).resultado).toBe("rechazado");expect(repo.ctx.pago.estado).toBe("completado");expect(repo.ctx.pago.monto).toBe("121.00");});
 test("autorizacion de otro documento no se atribuye al intento",async()=>{const {repo,arca,caso}=escenario();const a=autorizacion(construirSolicitudFiscal(repo.ctx,"42",clock()));a.docNro="30000002";arca.result={tipo:"autorizado",autorizacion:a,observaciones:[]};await caso.ejecutar(ID);expect(repo.execution.estado).toBe("desconocido");expect(repo.ctx.comprobante.cae).toBeNull();});
 test("consulta con IVA/perfil divergente mantiene desconocido",async()=>{const {repo,arca}=escenario();await preparada(repo,true);const a=autorizacion(repo.execution.solicitud!);a.detalle.CondicionIVAReceptorId=6;arca.query={tipo:"encontrado",autorizacion:a,observaciones:[]};expect((await new ConciliarIntentoUseCase(repo,arca).ejecutar(copy(repo.execution))).resultado).toBe("pendiente");expect(repo.execution.estado).toBe("desconocido");expect(arca.sends).toBe(0);});
 for(const found of ["ausente","ambiguo","error"] as const)test(`consulta ${found} no autoriza ni reenvia`,async()=>{const {repo,arca}=escenario();await preparada(repo,true);if(found==="ambiguo")arca.query={tipo:"ambiguo",codigos:[]};if(found==="error")arca.throwQuery=true;await new ConciliarIntentoUseCase(repo,arca).ejecutar(copy(repo.execution));expect(repo.execution.estado).toBe("desconocido");expect(repo.execution.posibleEnvio).toBe(true);expect(arca.sends).toBe(0);});
 test("numero ya ocupado antes de primer envio registra incidencia sin atribuir CAE",async()=>{const {repo,arca}=escenario();await preparada(repo);arca.query={tipo:"encontrado",autorizacion:autorizacion(repo.execution.solicitud!),observaciones:[]};await new ConciliarIntentoUseCase(repo,arca).ejecutar(copy(repo.execution));expect(repo.incidencias).toEqual(["numero_ocupado"]);expect(repo.ctx.comprobante.cae).toBeNull();expect(repo.execution.posibleEnvio).toBe(false);expect(arca.sends).toBe(0);});
 test("ausencia previa a envio no libera automaticamente la numeracion",async()=>{const {repo,arca}=escenario();await preparada(repo);await new ConciliarIntentoUseCase(repo,arca).ejecutar(copy(repo.execution));expect(repo.incidencias).toEqual(["ausencia_no_concluyente"]);expect(arca.sends).toBe(0);});
 test("fallo de confirmacion no provoca una segunda confirmacion ni otro pedido",async()=>{const {repo,arca,caso}=escenario();repo.failConfirm=true;await expect(caso.ejecutar(ID)).rejects.toThrow("commit sin confirmacion");expect(repo.trace.filter(v=>v.startsWith("confirmar:"))).toEqual(["confirmar:autorizado"]);expect(arca.sends).toBe(1);});
 test("recupera adquisicion sin snapshot y prepara una unica solicitud",async()=>{const {repo,arca,caso}=escenario();await repo.iniciar(ID,"inicial",EXEC);repo.trace=[];expect((await caso.ejecutar(ID)).resultado).toBe("autorizado");expect(arca.sends).toBe(1);expect(repo.execution.id).toBe(EXEC);expect(repo.execution.version).toBe("2");expect(repo.trace.filter(v=>v==="preparar")).toHaveLength(1);});
 test("recupera snapshot preparado con numeracion aun libre y no lo reescribe",async()=>{const {repo,arca,caso}=escenario();await preparada(repo);const snapshot=copy(repo.execution.solicitud);expect((await caso.ejecutar(ID)).resultado).toBe("autorizado");expect(arca.sends).toBe(1);expect(repo.execution.solicitud).toEqual(snapshot);expect(repo.trace.includes("preparar")).toBe(false);expect(repo.trace.indexOf("ultimo")).toBeLessThan(repo.trace.indexOf("marcar"));});
 test("snapshot preparado cuyo numero avanzo no se renumera ni solicita",async()=>{const {repo,arca,caso}=escenario();await preparada(repo);arca.last={tipo:"obtenido",numero:"42"};arca.query={tipo:"encontrado",autorizacion:autorizacion(repo.execution.solicitud!),observaciones:[]};await caso.ejecutar(ID);expect(repo.incidencias).toEqual(["numero_ocupado"]);expect(repo.execution.numero).toBe("42");expect(arca.sends).toBe(0);expect(repo.execution.posibleEnvio).toBe(false);});
 test("cobro anulado se bloquea antes de adquirir",async()=>{const {repo,arca,caso}=escenario();repo.ctx.pago.estado="anulado";expect((await caso.ejecutar(ID)).resultado).toBe("bloqueado");expect(repo.trace).toEqual(["leer"]);expect(arca.sends).toBe(0);});
});

describe("Homologación:602 exclusivo consulta serie antes de emitir", () => {
 function sinListado(arca:Arca) { arca.diagnosis={autenticado:true,ambiente:"homologacion",servicio:"wsfe",puntosVenta:[],ausenciaDatos:"602"}; }
 test("602 y último8 reservan9 y marcan antes del único envío", async () => {
  const {repo,arca,caso}=escenario(); sinListado(arca); arca.last={tipo:"obtenido",numero:"8"};
  expect((await caso.ejecutar(ID)).resultado).toBe("autorizado");
  expect(repo.trace).toEqual(["leer",`iniciar:inicial:${EXEC}`,"diagnosticar","ultimo","leer","preparar","marcar","solicitar","confirmar:autorizado"]);
  expect(repo.execution.numero).toBe("9"); expect(arca.sends).toBe(1); expect(repo.ctx.pago.estado).toBe("completado");
 });
 for(const code of ["11002","600","601","602","ARCA_ULTIMO_NO_DISPONIBLE"]) test(`602 y último fallido ${code} no preparan ni envían`,async()=>{
  const {repo,arca,caso}=escenario(); sinListado(arca); arca.last={tipo:"no_disponible",codigos:[{codigo:code,mensaje:"Respuesta sintética"}]};
  await caso.ejecutar(ID); expect(repo.execution.estado).toBe("transitorio"); expect(repo.trace.includes("ultimo")).toBe(true);
  expect(repo.trace.includes("preparar")).toBe(false); expect(repo.trace.includes("marcar")).toBe(false); expect(arca.sends).toBe(0);
 });
 test("602 y excepción de último no preparan ni envían",async()=>{
  const {repo,arca,caso}=escenario(); sinListado(arca); arca.obtenerUltimoAutorizado=async()=>{throw new Error("SIMULADO");};
  await caso.ejecutar(ID); expect(repo.execution.estado).toBe("transitorio"); expect(repo.execution.posibleEnvio).toBe(false); expect(arca.sends).toBe(0);
 });
 for(const change of [
  {ausenciaDatos:"600"}, {ausenciaDatos:"602,601"}, {ambiente:"produccion"},
  {servicio:"otro"}, {autenticado:false},
  {puntosVenta:[{numero:7,emisionTipo:"CAE",bloqueado:false,bajaFecha:null}]},
 ]) test(`marcador602 incompatible bloquea: ${JSON.stringify(change)}`,async()=>{
  const {repo,arca,caso}=escenario(); sinListado(arca); Object.assign(arca.diagnosis,change);
  await caso.ejecutar(ID); expect(repo.execution.estado).toBe("transitorio"); expect(repo.trace.includes("ultimo")).toBe(false); expect(arca.sends).toBe(0);
 });
 test("602 no autoriza una identidad de ejecución ajena a homologación",async()=>{
  const {repo,arca,caso}=escenario(); sinListado(arca); await repo.iniciar(ID,"inicial",EXEC);
  Object.assign(repo.execution.identidad,{ambiente:"produccion"}); repo.trace=[];
  await caso.ejecutar(ID); expect(repo.trace.includes("ultimo")).toBe(false); expect(arca.sends).toBe(0);
 });
 test("602 y timeout se concilian sin segundo envío ni repetir diagnóstico",async()=>{
  const {repo,arca,caso}=escenario(); sinListado(arca); arca.throwSend=true;
  expect((await caso.ejecutar(ID)).resultado).toBe("pendiente"); expect(repo.execution.estado).toBe("desconocido");
  const stored=copy(repo.execution.solicitud!); arca.query={tipo:"encontrado",autorizacion:autorizacion(stored),observaciones:[]}; repo.trace=[];
  expect((await caso.ejecutar(ID)).resultado).toBe("autorizado"); expect(arca.sends).toBe(1); expect(arca.queries).toBe(1);
  expect(repo.trace).toEqual(["leer",`iniciar:conciliacion:${EXEC}`,"consultar","confirmar:autorizado"]); expect(repo.execution.solicitud).toEqual(stored);
 });
 test("602 con snapshot preparado y serie avanzada concilia sin renumerar",async()=>{
  const {repo,arca,caso}=escenario(); sinListado(arca); await preparada(repo); arca.last={tipo:"obtenido",numero:"42"};
  arca.query={tipo:"encontrado",autorizacion:autorizacion(repo.execution.solicitud!),observaciones:[]};
  await caso.ejecutar(ID); expect(repo.incidencias).toEqual(["numero_ocupado"]); expect(repo.execution.numero).toBe("42");
  expect(repo.trace.includes("preparar")).toBe(false); expect(repo.execution.posibleEnvio).toBe(false); expect(arca.sends).toBe(0);
 });
});

describe("estado publico sin material privado",()=>{
 test("gate cerrado ofrece PDF provisional y no emision",()=>{const ctx=contexto();const dto=estadoFiscalPublico(ctx,false);expect(dto.emisionDisponible).toBe(false);expect(dto.pdfVersion).toBe("provisional");expect(dto.cobroConfirmado).toBe(true);expect(Object.keys(dto)).not.toContain("configuracion");expect(Object.keys(dto)).not.toContain("solicitud");});
 test("gate y perfil explicitos habilitan emision inicial",()=>{expect(estadoFiscalPublico(contexto(),true).emisionDisponible).toBe(true);});
 for(const estado of ["transitorio","incidencia","rechazado"] as const)test(`terminal ${estado} deriva a Monitoreo fiscal`,async()=>{const {repo}=escenario();await preparada(repo);repo.execution.estado=estado;const dto=estadoFiscalPublico(repo.ctx,true);expect(dto.emisionDisponible).toBe(false);expect(dto.aviso).toContain("Monitoreo fiscal");expect(dto.cobroConfirmado).toBe(true);});
 test("intento desconocido deriva consulta administrativa aun sin perfil actual",async()=>{const {repo}=escenario();await preparada(repo,true);repo.execution.estado="desconocido";repo.ctx.configuracion=null;const dto=estadoFiscalPublico(repo.ctx,true);expect(dto.emisionDisponible).toBe(false);expect(dto.aviso).toContain("Monitoreo fiscal");});
 test("documento valido conserva version autorizada sin nueva emision",()=>{const ctx=contexto();ctx.comprobante.estado_fiscal="valido";ctx.comprobante.cae="90000000000001";ctx.comprobante.numero_comprobante="1";ctx.comprobante.cae_vencimiento="2026-11-04";expect(estadoFiscalPublico(ctx,true).pdfVersion).toBe("autorizado");expect(estadoFiscalPublico(ctx,true).emisionDisponible).toBe(false);});
});
