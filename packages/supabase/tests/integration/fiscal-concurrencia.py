"""Pruebas de concurrencia del motor fiscal durable sobre una copia efímera de la base local."""
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
import json
import subprocess
import sys
import time
import uuid

sys.dont_write_bytecode = True
from _db_efimera import base_efimera

project = '00000000-0000-0000-0000-000000000000'


def lit(v):
    return "'" + str(v).replace("'", "''") + "'"


with base_efimera(
    'concurrencia_fiscal',
    'Copia efímera para pruebas de concurrencia fiscal',
) as (container, database, comment):

    def db(sql, expect_error=False):
        p = subprocess.run(
            [
                'docker',
                'exec',
                '-i',
                container,
                'psql',
                '-X',
                '-q',
                '-At',
                '-U',
                'postgres',
                '-d',
                database,
                '-v',
                'ON_ERROR_STOP=1',
            ],
            input=sql,
            capture_output=True,
            text=True,
        )
        if expect_error:
            return p.returncode != 0
        if p.returncode:
            raise RuntimeError(p.stderr[-1800:])
        return p.stdout.strip()

    def row(sql):
        return json.loads(db(sql).splitlines()[-1])

    assert (
        db("SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database();")
        == comment
    )
    backup = row(
        "SELECT coalesce(to_jsonb(c),'null'::jsonb) FROM(SELECT 1)x LEFT JOIN private.fiscal_configuracion c ON c.club_id="
        + lit(project)
        + ';'
    )
    actor = db(
        "SELECT id FROM public.usuarios WHERE rol='admin' AND estado='activo' ORDER BY created_at LIMIT 1;"
    )
    claim = (
        "SELECT set_config('request.jwt.claims',jsonb_build_object('sub',"
        + lit(actor)
        + ",'role','authenticated')::text,true);"
    )
    free = row(
        'SELECT json_agg(n) FROM(SELECT n FROM generate_series(800,980)n WHERE NOT EXISTS(SELECT 1 FROM private.fiscal_series s WHERE s.tipo_comprobante=n) LIMIT 3)x;'
    )
    assert len(free) == 3

    marker = str(uuid.uuid4())[:8]
    socio = str(uuid.uuid4())
    sport = str(uuid.uuid4())
    category = str(uuid.uuid4())
    quotas = [str(uuid.uuid4()) for _ in range(3)]
    executions = [str(uuid.uuid4()) for _ in range(3)]
    checks = []
    running = []
    fixtures = {}
    restored = False

    def check(caso, ok):
        checks.append({'caso': caso, 'correcto': bool(ok)})
        print(('OK: ' if ok else 'FALLO: ') + caso, flush=True)
        if not ok:
            raise AssertionError(caso)

    def worker_sql(operation, seconds):
        application = 'fiscal-durable-' + str(uuid.uuid4())[:8]
        p = subprocess.Popen(
            [
                'docker',
                'exec',
                '-i',
                '-e',
                'PGAPPNAME=' + application,
                container,
                'psql',
                '-X',
                '-q',
                '-At',
                '-U',
                'postgres',
                '-d',
                database,
                '-v',
                'ON_ERROR_STOP=1',
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        p.stdin.write(
            "BEGIN;SET LOCAL statement_timeout='15s';SELECT jsonb_build_object('session',pg_backend_pid(),'result',"
            + operation
            + ');SELECT pg_sleep('
            + str(seconds)
            + ');COMMIT;'
        )
        p.stdin.close()
        p.stdin = None
        running.append(p)
        until = time.monotonic() + 10
        while time.monotonic() < until:
            if (
                db(
                    'SELECT count(*) FROM pg_stat_activity WHERE application_name='
                    + lit(application)
                    + " AND wait_event='PgSleep';"
                )
                == '1'
            ):
                return p
            if p.poll() is not None:
                raise RuntimeError('El trabajador terminó antes de sostener el lock.')
            time.sleep(0.05)
        raise RuntimeError('No se confirmó la sesión concurrente.')

    def iniciar(cbte, mode, execution):
        return 'public.iniciar_ejecucion_fiscal(' + ','.join(map(lit, [cbte, mode, execution])) + ')'

    def finish(p):
        out, err = p.communicate(timeout=20)
        if p.returncode:
            raise RuntimeError(err[-1400:])
        return next(json.loads(x) for x in out.splitlines() if x.startswith('{'))

    try:
        assert db("SELECT to_regprocedure('public.expirar_comprobante_fiscal(uuid)') IS NOT NULL;") == 't'
        setup = 'BEGIN;' + claim
        setup += (
            f"INSERT INTO public.deportes(id,nombre)VALUES('{sport}','Concurrencia fiscal {marker}');"
            f"INSERT INTO public.categorias(id,deporte_id,nombre,arancel_mensual)VALUES('{category}','{sport}','Concurrencia sintética',1000);"
            f"INSERT INTO public.socios(id,dni,nombre,apellido,fecha_nacimiento,acepta_comunicaciones)VALUES('{socio}','99999999','Persona sintética','Concurrencia Fiscal','1990-01-01',false);"
        )
        for i, q in enumerate(quotas):
            setup += f"INSERT INTO public.cuotas(id,socio_id,categoria_id,periodo_mes,periodo_anio,monto)VALUES('{q}','{socio}','{category}',{7 + i},2026,1000);"
        setup += (
            f"INSERT INTO private.fiscal_configuracion(club_id,ambiente,tipo_factura,tipo_nota_credito,concepto,moneda,cotizacion,perfil_importes,usar_periodo_cuota,vencimiento_pago,confirmado)VALUES('{project}','homologacion',{free[0]},{free[2]},1,'PES',1,'{{\"modo\":\"exento\"}}',false,'fecha_comprobante',true)ON CONFLICT(club_id)DO UPDATE SET ambiente=EXCLUDED.ambiente,tipo_factura=EXCLUDED.tipo_factura,tipo_nota_credito=EXCLUDED.tipo_nota_credito,concepto=EXCLUDED.concepto,moneda=EXCLUDED.moneda,cotizacion=EXCLUDED.cotizacion,perfil_importes=EXCLUDED.perfil_importes,usar_periodo_cuota=EXCLUDED.usar_periodo_cuota,vencimiento_pago=EXCLUDED.vencimiento_pago,confirmado=EXCLUDED.confirmado;"
            f"INSERT INTO private.fiscal_receptores(socio_id,doc_tipo,doc_numero,condicion_iva_id,confirmado)VALUES('{socio}',96,'99999999',5,true)ON CONFLICT(socio_id)DO UPDATE SET doc_tipo=EXCLUDED.doc_tipo,doc_numero=EXCLUDED.doc_numero,condicion_iva_id=EXCLUDED.condicion_iva_id,confirmado=EXCLUDED.confirmado;"
        )
        setup += (
            "SELECT jsonb_build_object('cbtes',jsonb_build_array("
            + ','.join(
                'public.cobrar_cuota(' + lit(q) + ',' + lit(actor) + ",'efectivo',NULL)"
                for q in quotas
            )
            + '));COMMIT;'
        )
        values = [
            json.loads(x) for x in db(setup).splitlines() if x.startswith('{') and 'cbtes' in x
        ][-1]
        cbtes = values['cbtes']
        fixtures = {
            'socioId': socio,
            'comprobantes': cbtes,
            'ejecuciones': executions,
            'marker': marker,
            'tiposSinteticos': free,
        }

        initial = str(uuid.uuid4())
        ret = row('SELECT ' + iniciar(cbtes[0], 'inicial', initial) + ';')
        db(
            'SELECT public.confirmar_resultado_fiscal('
            + lit(initial)
            + ','
            + ret['ejecucion']['version']
            + ",'{\"tipo\":\"transitorio\",\"codigos\":[]}');"
        )
        a = worker_sql(iniciar(cbtes[0], 'manual', executions[0]), 3)
        before = time.monotonic()
        b = row(
            "SELECT jsonb_build_object('session',pg_backend_pid(),'result',"
            + iniciar(cbtes[0], 'automatico', str(uuid.uuid4()))
            + ');'
        )
        waited = time.monotonic() - before
        ar = finish(a)
        check(
            'manual y automático simultáneos tienen un adquirente y una sesión espera',
            ar['result']['estado'] == 'adquirida'
            and b['result']['estado'] == 'en_curso'
            and waited > 0.5,
        )
        check('las conexiones son sesiones PostgreSQL diferentes', ar['session'] != b['session'])
        check(
            'manual+auto consumen un solo lugar',
            db('SELECT intentos_reintento FROM public.comprobantes WHERE id=' + lit(cbtes[0]) + ';')
            == '1',
        )

        oldver = ar['result']['ejecucion']['version']
        a = worker_sql(iniciar(cbtes[0], 'conciliacion', executions[0]), 3)
        before = time.monotonic()
        b = row('SELECT ' + iniciar(cbtes[1], 'inicial', executions[1]) + ';')
        waited = time.monotonic() - before
        ar = finish(a)
        check(
            'otra factura de la misma serie espera sin adquirir',
            b['estado'] == 'en_curso' and waited > 0.5,
        )
        check(
            'recuperar ejecución conserva contador y cambia fence',
            ar['result']['ejecucion']['version'] != oldver
            and db(
                'SELECT intentos_reintento FROM public.comprobantes WHERE id=' + lit(cbtes[0]) + ';'
            )
            == '1',
        )
        check(
            'trabajador viejo no marca envío tras recuperación',
            db('SELECT public.marcar_envio_fiscal(' + lit(executions[0]) + ',' + oldver + ');', True),
        )

        db(
            'UPDATE private.fiscal_configuracion SET tipo_factura='
            + str(free[1])
            + ' WHERE club_id='
            + lit(project)
            + ';'
        )
        a = worker_sql(iniciar(cbtes[0], 'conciliacion', executions[0]), 4)
        b = row('SELECT ' + iniciar(cbtes[2], 'inicial', executions[2]) + ';')
        before_a_commit = a.poll() is None
        ar = finish(a)
        check(
            'una serie diferente progresa mientras la primera sigue bloqueada',
            before_a_commit and b['estado'] == 'adquirida',
        )

        ctx = row('SELECT public.leer_contexto_fiscal(' + lit(cbtes[2]) + ');')
        ident = b['ejecucion']['identidad']
        version = b['ejecucion']['version']
        now = datetime.now(ZoneInfo('America/Argentina/Buenos_Aires'))
        fecha = now.strftime('%Y%m%d')
        detalle = {
            'Concepto': 1,
            'DocTipo': 96,
            'DocNro': '99999999',
            'CondicionIVAReceptorId': 5,
            'CbteDesde': '1',
            'CbteHasta': '1',
            'CbteFch': fecha,
            'ImpTotal': ctx['pago']['monto'],
            'ImpTotConc': '0.00',
            'ImpNeto': '0.00',
            'ImpOpEx': ctx['pago']['monto'],
            'ImpTrib': '0.00',
            'ImpIVA': '0.00',
            'MonId': 'PES',
            'MonCotiz': '1.000000',
        }
        receptor = {'nombre': (ctx['socio']['nombre'] + ' ' + ctx['socio']['apellido']).strip()}
        if ctx['socio']['direccion'] and ctx['socio']['direccion'].strip():
            receptor['domicilio'] = ctx['socio']['direccion'].strip()
        snap = {
            'version': 1,
            'identidad': ident,
            'emisor': {'nombre': ctx['club']['nombre'], 'domicilio': ctx['club']['domicilio_fiscal']},
            'receptor': receptor,
            'detalle': detalle,
        }
        db(
            'SELECT public.preparar_solicitud_fiscal('
            + lit(executions[2])
            + ','
            + version
            + ",'1',"
            + lit(json.dumps(snap))
            + '::jsonb);SELECT public.marcar_envio_fiscal('
            + lit(executions[2])
            + ','
            + version
            + ');SELECT public.confirmar_resultado_fiscal('
            + lit(executions[2])
            + ','
            + version
            + ",'{\"tipo\":\"desconocido\",\"codigos\":[]}');UPDATE public.comprobantes SET ventana_regularizacion_iniciada_en=clock_timestamp()-interval '25 hours' WHERE id="
            + lit(cbtes[2])
            + ';SELECT public.expirar_comprobante_fiscal('
            + lit(cbtes[2])
            + ');'
        )
        db(
            'BEGIN;'
            + claim
            + 'SELECT public.anular_pago('
            + lit(ctx['pago']['id'])
            + ",'Concurrencia anulación sintética');SELECT public.cobrar_cuota("
            + lit(quotas[2])
            + ','
            + lit(actor)
            + ",'efectivo',NULL);COMMIT;"
        )
        fixtures['pagoAnuladoId'] = ctx['pago']['id']
        auth = {
            'tipo': 'autorizado',
            'observaciones': [],
            'autorizacion': {
                'identidad': ident,
                'numero': '1',
                'cae': '99999999999999',
                'vencimiento': (now.date() + timedelta(days=10)).isoformat(),
                'fecha': fecha,
                'docTipo': 96,
                'docNro': '99999999',
                'concepto': 1,
                'moneda': 'PES',
                'cotizacion': '1.000000',
                'importeTotal': detalle['ImpTotal'],
                'importeNeto': '0.00',
                'importeNoGravado': '0.00',
                'importeExento': detalle['ImpTotal'],
                'importeIva': '0.00',
                'importeTributos': '0.00',
                'detalle': detalle,
            },
        }
        financiero = (
            "SELECT jsonb_build_object('pagos',(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.id)FROM public.pagos p WHERE cuota_id IN("
            + ','.join(map(lit, quotas))
            + ")),'cuotas',(SELECT jsonb_agg(to_jsonb(q)ORDER BY q.id)FROM public.cuotas q WHERE id IN("
            + ','.join(map(lit, quotas))
            + ')));'
        )
        financial_before = row(financiero)
        operation = (
            'public.resolver_anulacion_fiscal('
            + lit(executions[2])
            + ','
            + version
            + ','
            + lit(json.dumps(auth))
            + '::jsonb,'
            + lit(actor)
            + ')'
        )
        a = worker_sql(operation, 3)
        before = time.monotonic()
        b = row('SELECT ' + operation + ';')
        waited = time.monotonic() - before
        ar = finish(a)
        check(
            'dos resolutores serializan y reconocen la misma autorización',
            waited > 0.5
            and ar['result']['estado'] == 'autorizado'
            and b['estado'] == 'autorizado',
        )
        check(
            'los dos resolutores crean como máximo una NC',
            db(
                'SELECT count(*) FROM public.comprobantes WHERE comprobante_origen_id='
                + lit(cbtes[2])
                + " AND tipo='nota_credito';"
            )
            == '1',
        )
        check(
            'resolución tardía no modifica pago cuotas ni recobro',
            row(financiero) == financial_before,
        )
        check(
            'anulación conserva un único reverso',
            db(
                'SELECT count(*) FROM public.flujo_caja WHERE movimiento_id='
                + lit(ctx['pago']['id'])
                + ' AND es_reverso;'
            )
            == '1',
        )
        check(
            'JWT humano no puede iniciar reintento técnico',
            db('SET ROLE authenticated;SELECT ' + iniciar(cbtes[1], 'manual', str(uuid.uuid4())) + ';', True),
        )
        check(
            'anónimo no selecciona candidatos de worker',
            db('SET ROLE anon;SELECT public.listar_candidatos_fiscales(10);', True),
        )
    finally:
        for p in running:
            if p.poll() is None:
                try:
                    finish(p)
                except Exception:
                    pass
        if fixtures:
            for e in executions:
                db(
                    'DO $$DECLARE x private.fiscal_ejecuciones%ROWTYPE;BEGIN SELECT *INTO x FROM private.fiscal_ejecuciones WHERE id='
                    + lit(e)
                    + ";IF FOUND AND NOT x.posible_envio AND x.estado IN('adquirida','preparada')THEN PERFORM public.confirmar_resultado_fiscal(x.id,x.version,'{\"tipo\":\"transitorio\",\"codigos\":[{\"codigo\":\"FIN_PRUEBA_LOCAL\",\"mensaje\":\"Finalización de prueba sintética sin envío remoto\"}]}');END IF;END;$$;"
                )
        restore = 'BEGIN;DELETE FROM private.fiscal_configuracion WHERE club_id=' + lit(project) + ';'
        if backup is not None:
            restore += (
                'INSERT INTO private.fiscal_configuracion SELECT *FROM jsonb_populate_record(NULL::private.fiscal_configuracion,'
                + lit(json.dumps(backup))
                + '::jsonb);'
            )
        restore += 'DELETE FROM private.fiscal_receptores WHERE socio_id=' + lit(socio) + ';COMMIT;'
        db(restore)
        current = row(
            "SELECT coalesce(to_jsonb(c),'null'::jsonb)FROM(SELECT 1)x LEFT JOIN private.fiscal_configuracion c ON c.club_id="
            + lit(project)
            + ';'
        )
        restored = current == backup
        check('perfil anterior restaurado exactamente y receptor temporal retirado', restored)
        correcto = all(c['correcto'] for c in checks)

print(
    json.dumps(
        {
            'correcto': correcto,
            'checks': len(checks),
            'perfilRestaurado': restored,
            'database': database,
        }
    )
)
assert correcto
