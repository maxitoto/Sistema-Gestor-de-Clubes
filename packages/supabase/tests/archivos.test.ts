import { describe, expect, test } from "bun:test";
import { deflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { ArchivosService, type RepositorioArchivos } from "../functions/_shared/modules/archivos/application/ArchivosService.ts";
import { ArchivoError, identidadArchivo, type IdentidadArchivo, validarRutaArchivo } from "../functions/_shared/modules/archivos/domain/archivo.ts";
import { validarBytes } from "../functions/_shared/modules/archivos/infrastructure/validarBytes.ts";

function crc(bytes: Uint8Array) { let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^(0xedb88320&-(value&1));}return(value^0xffffffff)>>>0; }
function chunk(name:string,data:Uint8Array) {const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);result.write(name,4);result.set(data,8);result.writeUInt32BE(crc(result.subarray(4,result.length-4)),result.length-4);return result;}
function png() {const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,37,99,235,255]))),chunk('IEND',Buffer.alloc(0))]));}
const jpeg = Uint8Array.from(Buffer.from('/9j/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAACAAIDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCUAVkPf//Z', 'base64'));
const identity:IdentidadArchivo={tipo:'socio-foto',entidadId:'00000000-0000-4000-8000-000000000001'};
const path=`socios/${identity.entidadId}/00000000-0000-4000-8000-000000000002.png`;
describe('Contenido real y límites de archivos',()=>{
 test('PNG válido incluye CRC e imagen descomprimible; JPEG válido tiene segmentos y escaneo',async()=>{
  expect(await validarBytes('socio-foto',png(),'image/png')).toEqual({tipoMime:'image/png',extension:'png',tamano:png().length});
  expect((await validarBytes('socio-foto',jpeg,'image/jpeg')).tipoMime).toBe('image/jpeg');
 });
 test('rechaza firma ficticia, CRC dañado, truncado, bytes después del final y MIME mentido',async()=>{
  const damaged=png();damaged[damaged.length-1]^=1;
  for(const data of [new TextEncoder().encode('<html>foto.png</html>'),damaged,png().slice(0,-1),new Uint8Array([...png(),0]),jpeg.slice(0,-2),new Uint8Array([...jpeg,0])]) await expect(validarBytes('socio-foto',data)).rejects.toBeInstanceOf(ArchivoError);
  await expect(validarBytes('socio-foto',png(),'application/pdf')).rejects.toBeInstanceOf(ArchivoError);
 });
 test('PNG con CRC e inflado correctos pero índice de paleta inexistente no se acepta',async()=>{
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=3;
  const invalidPalette=new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('PLTE',Buffer.from([0,0,0])),chunk('IDAT',deflateSync(Buffer.from([0,255]))),chunk('IEND',Buffer.alloc(0))]));
  await expect(validarBytes('socio-foto',invalidPalette,'image/png')).rejects.toBeInstanceOf(ArchivoError);
 });
 test('no permite imágenes vacías o mayores a5MB ni evidencia mayor a10MB',async()=>{
  await expect(validarBytes('socio-foto',new Uint8Array())).rejects.toMatchObject({statusCode:413});
  await expect(validarBytes('socio-foto',new Uint8Array(5*1024*1024+1))).rejects.toMatchObject({statusCode:413});
  await expect(validarBytes('gasto-evidencia',new Uint8Array(10*1024*1024+1))).rejects.toMatchObject({statusCode:413});
 });
 test('PDF real se parsea; cabecera/EOF falsos y PDF interactivo se rechazan',async()=>{
  const doc=await PDFDocument.create();doc.addPage([200,200]);const bytes=await doc.save();
  expect((await validarBytes('gasto-evidencia',bytes,'application/pdf')).tipoMime).toBe('application/pdf');
  await expect(validarBytes('socio-foto',bytes)).rejects.toBeInstanceOf(ArchivoError);
  await expect(validarBytes('gasto-evidencia',new TextEncoder().encode('%PDF-1.7\nHTML\n%%EOF'))).rejects.toBeInstanceOf(ArchivoError);
  const action=doc.context.obj({S:PDFName.of('JavaScript'),JS:PDFString.of('app.alert(1)')});doc.catalog.set(PDFName.of('OpenAction'),action);
  await expect(validarBytes('gasto-evidencia',await doc.save())).rejects.toBeInstanceOf(ArchivoError);
 });
 test('entidad y path no admiten otra raíz, otroID, traversal ni PDF en foto',()=>{
  expect(validarRutaArchivo(identity,path)).toBe(path);
  for(const value of [path.replace('/00000000-0000-4000-8000-000000000001/','/00000000-0000-4000-8000-000000000003/'),path.replace('socios/','club/'),`${path}/../x.png`,path.replace('.png','.pdf')]) expect(()=>validarRutaArchivo(identity,value)).toThrow();
  expect(()=>identidadArchivo('certificado',identity.entidadId)).toThrow();
 });
});
function fakeRepository() {
 const calls:string[]=[];
 const repo:RepositorioArchivos={
  autorizar:async()=>{calls.push('autorizar');},guardar:async()=>{calls.push('guardar');},registrar:async()=>{calls.push('registrar');},
  asociar:async()=>{calls.push('asociar-humano');},leer:async()=>({path,legacy:null}),firmar:async(p)=>{calls.push(`firmar:${p}`);return'https://local.test/temporal';},
  reservarDescarte:async()=>{calls.push('reservar');},borrar:async()=>{calls.push('borrar');},finalizarDescarte:async()=>{calls.push('finalizar');},
 };return{repo,calls};
}
describe('Secuencia de autoridad y recuperación',()=>{
 test('rechaza un JPEG con segmentos correctos pero sin tablas/entropía decodificables',async()=>{
  const bogus = new Uint8Array([255,216,255,219,0,67,...new Array(65).fill(0),255,192,0,11,8,0,1,0,1,1,1,17,0,255,218,0,8,1,1,0,0,63,0,0,255,217]);
  await expect(validarBytes('socio-foto',bogus,'image/jpeg')).rejects.toBeInstanceOf(ArchivoError);
 });
 test('descarte con respuesta perdida se repite sobre el tombstone sin otro registro de negocio',async()=>{
  const {repo,calls}=fakeRepository();let state='pendiente';let first=true;
  repo.reservarDescarte=async()=>{if(state==='asociado')throw new Error('asociado');calls.push('reservar');if(state!=='descartado')state='descartando';};
  repo.finalizarDescarte=async()=>{state='descartado';calls.push('finalizar');if(first){first=false;throw new Error('respuesta perdida');}};
  const service=new ArchivosService(repo,validarBytes);
  await expect(service.descartar(identity,path)).rejects.toThrow('respuesta perdida');
  await service.descartar(identity,path);expect(state).toBe('descartado');expect(calls).toEqual(['reservar','borrar','finalizar','reservar','borrar','finalizar']);
 });

 test('autoriza antes de validar/cargar y genera ruta sin usar nombre del cliente',async()=>{
  const{repo,calls}=fakeRepository();const service=new ArchivosService(repo,async()=>{calls.push('validar');return{tipoMime:'image/png',extension:'png',tamano:1};},()=> '00000000-0000-4000-8000-000000000002');
  expect((await service.subir(identity,new Uint8Array([1]),'image/png')).storagePath).toBe(path);
  expect(calls).toEqual(['autorizar','validar','guardar','registrar']);
 });
 test('rechazo de permiso no alcanza a cargar, error de registro limpia sólo el nuevo objeto',async()=>{
  const a=fakeRepository();a.repo.autorizar=async()=>{throw new Error('denegado');};
  await expect(new ArchivosService(a.repo,validarBytes).subir(identity,png(),'image/png')).rejects.toThrow('denegado');expect(a.calls).toEqual([]);
  const b=fakeRepository();b.repo.registrar=async()=>{throw new Error('BD');};
  await expect(new ArchivosService(b.repo,validarBytes).subir(identity,png(),'image/png')).rejects.toBeInstanceOf(ArchivoError);expect(b.calls).toEqual(['autorizar','guardar','borrar']);
 });
 test('lectura sólo firma la ruta persistida; legacy nunca se guarda como referencia',async()=>{
  const{repo,calls}=fakeRepository();const service=new ArchivosService(repo,validarBytes);
  expect(await service.leer(identity)).toEqual({url:'https://local.test/temporal',storagePath:path,legacy:false});expect(calls).toEqual([`firmar:${path}`]);
  repo.leer=async()=>({path:null,legacy:'https://legacy.test/foto.jpg'});expect((await service.leer(identity)).legacy).toBe(true);
 });
 test('descarte debe reservar antes de borrar; un archivo asociado no se borra',async()=>{
  const{repo,calls}=fakeRepository();repo.reservarDescarte=async()=>{throw new Error('asociado');};
  await expect(new ArchivosService(repo,validarBytes).descartar(identity,path)).rejects.toThrow('asociado');expect(calls).toEqual([]);
 });
});
