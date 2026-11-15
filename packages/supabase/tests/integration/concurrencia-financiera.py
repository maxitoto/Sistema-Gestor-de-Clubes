"""Pruebas de concurrencia financiera y cortes de conexión sobre una copia efímera de la base local."""
import json
import subprocess
import sys
import time
import uuid

sys.dont_write_bytecode = True
from _db_efimera import base_efimera


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


with base_efimera(
    'concurrencia_financiera',
    'Copia efímera para pruebas de concurrencia financiera',
) as (CONTAINER, DATABASE, COMMENT):

    def command(application=None):
        args = ['docker', 'exec', '-i']
        if application:
            args += ['-e', 'PGAPPNAME=' + application]
        return args + [
            CONTAINER,
            'psql',
            '-U',
            'postgres',
            '-d',
            DATABASE,
            '-X',
            '-Atq',
            '-v',
            'ON_ERROR_STOP=1',
        ]

    def db(sql):
        p = subprocess.run(command(), input=sql, text=True, capture_output=True)
        if p.returncode:
            raise RuntimeError(p.stderr[-1800:])
        return p.stdout.strip()

    def obj(sql):
        return json.loads(db(sql).splitlines()[-1])

    assert (
        db(
            "SELECT current_database()||'|'||coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname=current_database();"
        )
        == DATABASE + '|' + COMMENT
    )
    assert int(db('SELECT count(*) FROM supabase_migrations.schema_migrations;')) >= 1
    assert (
        db("SELECT current_setting('cron.database_name',true) IS DISTINCT FROM current_database();")
        == 't'
    ), 'La copia no debe ser la base del planificador cron'

    marker = 'FIN' + uuid.uuid4().hex[:10]
    checks, races, cuts, active = [], [], [], []
    fixture = {'marker': marker, 'database': DATABASE}
    completed = False

    def check(name, condition, expected=None, observed=None):
        item = {'caso': name, 'correcto': bool(condition)}
        if expected is not None:
            item['esperado'] = expected
        if observed is not None:
            item['observado'] = observed
        checks.append(item)
        print(('OK ' if condition else 'FALLO ') + name, flush=True)
        if not condition:
            raise AssertionError(name)

    actor = db(
        "SELECT id FROM public.usuarios WHERE rol='admin' AND estado='activo' ORDER BY created_at,id LIMIT 1;"
    )
    assert actor
    claims = json.dumps({'sub': actor, 'role': 'authenticated'})
    claim = (
        "SET LOCAL ROLE authenticated;DO $actor$ BEGIN PERFORM set_config('request.jwt.claims',"
        + lit(claims)
        + ',true); END $actor$;'
    )

    def sql_context(human=True):
        return (
            "BEGIN;SET LOCAL statement_timeout='45s';SET LOCAL lock_timeout='15s';"
            + (claim if human else '')
        )

    def human_scalar(operation):
        lines = db(sql_context() + 'SELECT ' + operation + ';COMMIT;').splitlines()
        return lines[-1] if lines else ''

    def human_obj(operation):
        return json.loads(human_scalar(operation))

    def start(operation, phase='before_commit', human=True, sleep=3):
        app = 'test-fin-' + uuid.uuid4().hex[:14]
        result = "SELECT jsonb_build_object('pid',pg_backend_pid(),'result'," + operation + ');'
        tail = (
            'SELECT pg_sleep(' + str(sleep) + ');COMMIT;'
            if phase == 'before_commit'
            else 'COMMIT;SELECT pg_sleep(' + str(sleep) + ');'
        )
        p = subprocess.Popen(
            command(app),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        p.stdin.write(sql_context(human) + result + tail)
        p.stdin.close()
        p.stdin = None
        handle = {'process': p, 'app': app, 'pid': None, 'phase': phase}
        active.append(handle)
        return handle

    def activity(handle):
        return obj(
            "SELECT coalesce(jsonb_agg(jsonb_build_object('pid',pid,'wait',wait_event,'blockers',pg_blocking_pids(pid))),'[]'::jsonb) FROM pg_stat_activity WHERE datname="
            + lit(DATABASE)
            + ' AND application_name='
            + lit(handle['app'])
            + ';'
        )

    def wait_sleep(handle):
        until = time.monotonic() + 12
        while time.monotonic() < until:
            rows = activity(handle)
            if rows and rows[0]['wait'] == 'PgSleep':
                handle['pid'] = rows[0]['pid']
                return
            if handle['process'].poll() is not None:
                finish(handle)
                raise RuntimeError('Conexión terminó antes de la barrera PgSleep')
            time.sleep(0.025)
        raise RuntimeError('No se confirmó barrera PgSleep')

    def finish(handle, expected_error=None, discard=False):
        out, err = handle['process'].communicate(timeout=50)
        if expected_error is not None:
            assert handle['process'].returncode != 0 and expected_error in err, err[-1000:]
            return {'errorControlado': expected_error}
        if handle['process'].returncode:
            raise RuntimeError(err[-1800:])
        if discard:
            return None
        return next(json.loads(line) for line in out.splitlines() if line.startswith('{'))

    def race(name, first_operation, second_operation, error=None, first_human=True, second_human=True):
        a = start(first_operation, human=first_human, sleep=3)
        wait_sleep(a)
        b = start(second_operation, human=second_human, sleep=0)
        until = time.monotonic() + 2
        blocked = None
        while time.monotonic() < until:
            rows = activity(b)
            if rows and a['pid'] in rows[0]['blockers']:
                b['pid'] = rows[0]['pid']
                blocked = rows[0]
                break
            if b['process'].poll() is not None:
                break
            time.sleep(0.025)
        ar = finish(a)
        br = finish(b, expected_error=error)
        check(
            name + ': dos sesiones se solapan y B bloquea por A',
            blocked is not None and b['pid'] != a['pid'],
            'pg_blocking_pids(B) contiene A',
            {
                'pidA': a['pid'],
                'pidB': b['pid'],
                'bloqueadoresB': blocked['blockers'] if blocked else [],
            },
        )
        races.append(
            {
                'caso': name,
                'pidA': a['pid'],
                'pidB': b['pid'],
                'bloqueadoresB': blocked['blockers'],
                'resultadoA': ar['result'],
                'resultadoB': br.get('result', br),
            }
        )
        return ar['result'], br.get('result', br)

    def disconnect(name, operation, phase='before_commit', human=True):
        handle = start(operation, phase=phase, human=human, sleep=35)
        wait_sleep(handle)
        killed = db(
            'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE pid='
            + str(handle['pid'])
            + ' AND datname='
            + lit(DATABASE)
            + ' AND application_name='
            + lit(handle['app'])
            + " AND wait_event='PgSleep';"
        )
        assert killed == 't'
        handle['process'].communicate(timeout=8)
        assert handle['process'].returncode != 0
        cuts.append(
            {
                'caso': name,
                'fase': phase,
                'pid': handle['pid'],
                'respuestaDescartada': True,
                'conexionTerminada': True,
            }
        )

    def enrollment(socio, category):
        return 'public.confirmar_inscripcion(' + lit(socio) + ',' + lit(category) + ')'

    def charge(quota):
        return 'public.cobrar_cuota(' + lit(quota) + ',' + lit(actor) + ",'efectivo',NULL)"

    def quota_state(quota):
        return obj(
            "SELECT jsonb_build_object('cuota',q.estado,'pagos',(SELECT count(*) FROM public.pagos p WHERE p.cuota_id=q.id),'vigentes',(SELECT count(*) FROM public.pagos p WHERE p.cuota_id=q.id AND p.estado='completado'),'comprobantes',(SELECT count(*) FROM public.comprobantes c JOIN public.pagos p ON p.id=c.pago_id WHERE p.cuota_id=q.id)) FROM public.cuotas q WHERE q.id="
            + lit(quota)
            + ';'
        )

    try:
        sport, category, expense_category = [str(uuid.uuid4()) for _ in range(3)]
        members = {
            name: str(uuid.uuid4())
            for name in ['inscripcion', 'antes', 'despues', 'job', 'cobro', 'corte_cobro']
        }
        fixture.update(
            deporte=sport,
            categoria=category,
            categoriaGasto=expense_category,
            socios=members,
        )
        setup = sql_context(False)
        setup += 'INSERT INTO public.deportes(id,nombre)VALUES(' + lit(sport) + ',' + lit(marker) + ');'
        setup += (
            'INSERT INTO public.categorias(id,deporte_id,nombre,arancel_mensual)VALUES('
            + lit(category)
            + ','
            + lit(sport)
            + ",'Concurrencia financiera',12000);"
        )
        setup += (
            'INSERT INTO public.categorias_gasto(id,nombre)VALUES('
            + lit(expense_category)
            + ','
            + lit(marker)
            + ');'
        )
        base_dni = 91000000 + (int(uuid.uuid4().hex[:5], 16) % 7000000)
        for index, (name, member) in enumerate(members.items()):
            dni_val = str(base_dni + index)
            setup += (
                'INSERT INTO public.socios(id,numero_socio,dni,nombre,apellido,fecha_nacimiento,acepta_comunicaciones)VALUES('
                + lit(member)
                + ','
                + str(-900000000 - int(uuid.uuid4().hex[:6], 16))
                + ','
                + lit(dni_val)
                + ','
                + lit(name)
                + ','
                + lit(marker)
                + ",'1990-01-01',false);"
            )
        setup += 'COMMIT;'
        db(setup)

        operation = enrollment(members['inscripcion'], category)
        er, _ = race(
            'inscripción simultánea', operation, operation, error='ya se encuentra inscripto'
        )
        quota = er['cuota_id']
        enrollment_id = er['inscripcion_id']
        counts = obj(
            "SELECT jsonb_build_object('activas',(SELECT count(*)FROM public.inscripciones WHERE socio_id="
            + lit(members['inscripcion'])
            + " AND estado='activa'),'cuotas',(SELECT count(*)FROM public.cuotas WHERE socio_id="
            + lit(members['inscripcion'])
            + "),'monto',(SELECT monto FROM public.cuotas WHERE id="
            + lit(quota)
            + "),'esperado',public.cuota_proporcional((clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date,extract(month FROM clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::integer,extract(year FROM clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::integer,12000));"
        )
        check(
            'inscripción única, cuota única y prorrateo del día del club',
            counts['activas'] == counts['cuotas'] == 1 and counts['monto'] == counts['esperado'],
            {'activas': 1, 'cuotas': 1},
            counts,
        )
        before_quota = obj('SELECT to_jsonb(q) FROM public.cuotas q WHERE id=' + lit(quota) + ';')
        human_scalar('public.baja_inscripcion(' + lit(enrollment_id) + ')')
        rr, _ = race(
            'reinscripción simultánea', operation, operation, error='ya se encuentra inscripto'
        )
        check(
            'reinscripción conserva cuota e importe existentes',
            rr['cuota_id'] == quota
            and rr['cuota_creada'] is False
            and obj('SELECT to_jsonb(q)FROM public.cuotas q WHERE id=' + lit(quota) + ';')
            == before_quota,
        )
        check(
            'reinscripción conserva una histórica y una activa',
            db(
                "SELECT count(*)::text||'|'||count(*)FILTER(WHERE estado='activa')::text FROM public.inscripciones WHERE socio_id="
                + lit(members['inscripcion'])
                + ';'
            )
            == '2|1',
        )

        disconnect('inscripción cortada antes de commit', enrollment(members['antes'], category))
        check(
            'antes de commit no persiste inscripción ni cuota',
            db(
                'SELECT (SELECT count(*)FROM public.inscripciones WHERE socio_id='
                + lit(members['antes'])
                + ")::text||'|'||(SELECT count(*)FROM public.cuotas WHERE socio_id="
                + lit(members['antes'])
                + ')::text;'
            )
            == '0|0',
        )
        disconnect(
            'inscripción confirmada con respuesta descartada',
            enrollment(members['despues'], category),
            phase='after_commit',
        )
        recovered = obj(
            "SELECT jsonb_build_object('activas',(SELECT count(*)FROM public.inscripciones WHERE socio_id="
            + lit(members['despues'])
            + " AND estado='activa'),'cuotas',(SELECT count(*)FROM public.cuotas WHERE socio_id="
            + lit(members['despues'])
            + '));'
        )
        check(
            'después de commit se recupera inscripción por socio/categoría sin repetir alta',
            recovered == {'activas': 1, 'cuotas': 1},
            {'activas': 1, 'cuotas': 1},
            recovered,
        )

        period = obj(
            "SELECT jsonb_build_object('mes',extract(month FROM clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::integer,'anio',extract(year FROM clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::integer);"
        )
        fixture['periodo'] = period
        db(
            "UPDATE public.cuota_job_logs SET estado='fallido' WHERE estado='exitoso' AND periodo_mes="
            + str(period['mes'])
            + ' AND periodo_anio='
            + str(period['anio'])
            + '; INSERT INTO public.inscripciones(socio_id,categoria_id,fecha_alta,estado)VALUES('
            + lit(members['job'])
            + ','
            + lit(category)
            + ",(date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')-interval '1 day')::date,'activa');"
        )
        generated, repeated = race(
            'generador técnico/manual mismo mes',
            'public.generar_cuotas_mes_actual()',
            'public.generar_cuotas_mes_manual()',
            first_human=False,
        )
        fixture['jobId'] = generated['job_id']
        check(
            'job simultáneo converge al mismo éxito y contadores',
            generated['resultado'] == 'generado'
            and repeated['resultado'] == 'ya_ejecutado'
            and generated['job_id'] == repeated['job_id']
            and generated['cuotas_generadas'] == repeated['cuotas_generadas']
            and generated['cuotas_omitidas'] == repeated['cuotas_omitidas'],
        )
        job_before = obj(
            "SELECT jsonb_build_object('cuotas',(SELECT count(*)FROM public.cuotas),'jobs',(SELECT count(*)FROM public.cuota_job_logs),'reportes',(SELECT count(*)FROM private.correo_intenciones WHERE evento='reporte_mensual' AND job_id="
            + lit(generated['job_id'])
            + '));'
        )
        replay = human_obj('public.generar_cuotas_mes_manual()')
        job_after = obj(
            "SELECT jsonb_build_object('cuotas',(SELECT count(*)FROM public.cuotas),'jobs',(SELECT count(*)FROM public.cuota_job_logs),'reportes',(SELECT count(*)FROM private.correo_intenciones WHERE evento='reporte_mensual' AND job_id="
            + lit(generated['job_id'])
            + '));'
        )
        check(
            'repetir job exitoso no añade cuotas, log ni reporte',
            replay == repeated and job_before == job_after,
            job_before,
            job_after,
        )
        check(
            'un único job exitoso del período',
            db(
                "SELECT count(*)FROM public.cuota_job_logs WHERE estado='exitoso' AND periodo_mes="
                + str(period['mes'])
                + ' AND periodo_anio='
                + str(period['anio'])
                + ';'
            )
            == '1',
        )
        check(
            'inscripción anterior recibe arancel completo 12000',
            db(
                'SELECT monto FROM public.cuotas WHERE socio_id='
                + lit(members['job'])
                + ' AND periodo_mes='
                + str(period['mes'])
                + ' AND periodo_anio='
                + str(period['anio'])
                + ';'
            )
            == '12000.00',
        )

        quotas = {name: str(uuid.uuid4()) for name in ['carrera', 'corte']}
        fixture['cuotasCobro'] = quotas
        for name, q in quotas.items():
            member = members['cobro' if name == 'carrera' else 'corte_cobro']
            db(
                'INSERT INTO public.cuotas(id,socio_id,categoria_id,periodo_mes,periodo_anio,monto)VALUES('
                + lit(q)
                + ','
                + lit(member)
                + ','
                + lit(category)
                + ',1,2041,1000);'
            )
        paid, _ = race(
            'cobro simultáneo misma cuota',
            charge(quotas['carrera']),
            charge(quotas['carrera']),
            error='Cuota ya pagada',
        )
        fixture['comprobanteCobro'] = paid
        state = quota_state(quotas['carrera'])
        check(
            'un pago vigente, un comprobante y cuota pagada',
            state == {'cuota': 'pagada', 'pagos': 1, 'vigentes': 1, 'comprobantes': 1},
            {'cuota': 'pagada', 'pagos': 1, 'vigentes': 1, 'comprobantes': 1},
            state,
        )
        disconnect('cobro cortado antes de commit', charge(quotas['corte']))
        state = quota_state(quotas['corte'])
        check(
            'corte precommit conserva pendiente sin pago/comprobante',
            state == {'cuota': 'pendiente', 'pagos': 0, 'vigentes': 0, 'comprobantes': 0},
            {'cuota': 'pendiente', 'pagos': 0, 'vigentes': 0, 'comprobantes': 0},
            state,
        )
        disconnect(
            'cobro confirmado con respuesta descartada',
            charge(quotas['corte']),
            phase='after_commit',
        )
        state = quota_state(quotas['corte'])
        check(
            'cobro postcommit se recupera por cuota sin repetir cobro',
            state == {'cuota': 'pagada', 'pagos': 1, 'vigentes': 1, 'comprobantes': 1},
            {'cuota': 'pagada', 'pagos': 1, 'vigentes': 1, 'comprobantes': 1},
            state,
        )
        recovered_payment = obj(
            "SELECT jsonb_build_object('pago',p.id,'comprobante',c.id)FROM public.pagos p JOIN public.comprobantes c ON c.pago_id=p.id AND c.tipo='factura' WHERE p.cuota_id="
            + lit(quotas['corte'])
            + " AND p.estado='completado';"
        )
        fixture['cobroRecuperado'] = recovered_payment

        db("UPDATE public.comprobantes SET estado_fiscal='fallido' WHERE id=" + lit(paid) + ';')
        payment = db('SELECT pago_id FROM public.comprobantes WHERE id=' + lit(paid) + ';')
        ann = (
            'public.anular_pago('
            + lit(payment)
            + ",'Concurrencia financiera sin envío fiscal')"
        )
        race('anulación simultánea mismo pago', ann, ann, error='ya fue anulado')
        state = quota_state(quotas['carrera'])
        check(
            'anulación deja deuda una vez y ningún pago vigente',
            state == {'cuota': 'pendiente', 'pagos': 1, 'vigentes': 0, 'comprobantes': 1},
            {'cuota': 'pendiente', 'pagos': 1, 'vigentes': 0, 'comprobantes': 1},
            state,
        )
        check(
            'anulación genera un solo reverso por 1000',
            db(
                "SELECT count(*)::text||'|'||sum(monto)::text FROM public.flujo_caja WHERE movimiento_id="
                + lit(payment)
                + ' AND es_reverso;'
            )
            == '1|1000.00',
        )
        original = obj(
            "SELECT jsonb_build_object('pago',to_jsonb(p),'comprobante',to_jsonb(c))FROM public.pagos p JOIN public.comprobantes c ON c.pago_id=p.id AND c.tipo='factura' WHERE p.id="
            + lit(payment)
            + ';'
        )
        recharged = human_scalar(charge(quotas['carrera']))
        fixture['comprobanteRecobro'] = recharged
        check(
            'recobro crea comprobante nuevo y un solo pago vigente',
            recharged != paid
            and quota_state(quotas['carrera'])
            == {'cuota': 'pagada', 'pagos': 2, 'vigentes': 1, 'comprobantes': 2},
        )
        check(
            'recobro no altera pago ni comprobante anulados',
            obj(
                "SELECT jsonb_build_object('pago',to_jsonb(p),'comprobante',to_jsonb(c))FROM public.pagos p JOIN public.comprobantes c ON c.pago_id=p.id AND c.tipo='factura' WHERE p.id="
                + lit(payment)
                + ';'
            )
            == original,
        )
        ledger = obj(
            "SELECT jsonb_build_object('ingresos',coalesce(sum(f.monto)FILTER(WHERE f.tipo_movimiento='ingreso'),0),'egresos',coalesce(sum(f.monto)FILTER(WHERE f.tipo_movimiento='egreso'),0),'movimientos',count(*)) FROM public.flujo_caja f JOIN public.pagos p ON p.id=f.movimiento_id WHERE p.cuota_id="
            + lit(quotas['carrera'])
            + ';'
        )
        check(
            'libro mayor concilia cobro 1000 - reverso 1000 + recobro 1000',
            ledger == {'ingresos': 2000, 'egresos': 1000, 'movimientos': 3},
            {'ingresos': 2000, 'egresos': 1000, 'movimientos': 3},
            ledger,
        )

        request = str(uuid.uuid4())
        business_date = db(
            "SELECT (date_trunc('month',clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')-interval '1 day')::date;"
        )
        data = {
            'categoria_id': expense_category,
            'fecha': business_date,
            'concepto': marker + ' gasto',
            'monto': 200,
            'metodo_pago': 'efectivo',
            'referencia_banco': None,
            'descripcion': 'Datos sintéticos en copia efímera de concurrencia',
        }
        expense_op = (
            'public.registrar_gasto_idempotente('
            + lit(request)
            + ','
            + lit(json.dumps(data))
            + '::jsonb)'
        )
        expense, expense_again = race('alta gasto misma identidad', expense_op, expense_op)
        fixture['gasto'] = expense
        fixture['solicitudGasto'] = request
        check(
            'dos altas convergen al mismo gasto y reserva',
            expense == expense_again
            and db('SELECT count(*)FROM private.gasto_altas WHERE solicitud=' + lit(request) + ';')
            == '1',
        )
        original_expense = obj('SELECT to_jsonb(g) FROM public.gastos g WHERE id=' + lit(expense) + ';')
        check(
            'gasto conserva actor, fecha de negocio e importe',
            original_expense['usuario_id'] == actor
            and original_expense['fecha'] == business_date
            and original_expense['monto'] == 200,
        )
        ann_expense = (
            'public.anular_gasto(' + lit(expense) + ",'Anulación simultánea de gasto')"
        )
        race('anulación simultánea mismo gasto', ann_expense, ann_expense, error='ya fue anulado')
        after_expense = obj('SELECT to_jsonb(g) FROM public.gastos g WHERE id=' + lit(expense) + ';')
        check(
            'anular gasto conserva autor/fecha/importe originales',
            all(
                after_expense[k] == original_expense[k]
                for k in ['id', 'usuario_id', 'fecha', 'monto', 'created_at', 'concepto']
            ),
        )
        exp_ledger = obj(
            "SELECT jsonb_build_object('movimientos',count(*),'reversos',count(*)FILTER(WHERE es_reverso),'neto',sum(CASE WHEN tipo_movimiento='ingreso'THEN monto ELSE -monto END),'fechaReversoClub',max((fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)FILTER(WHERE es_reverso),'fechaOriginalClub',max((fecha AT TIME ZONE 'America/Argentina/Buenos_Aires')::date)FILTER(WHERE NOT es_reverso))FROM public.flujo_caja WHERE movimiento_id="
            + lit(expense)
            + ';'
        )
        today = db(
            "SELECT (clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date;"
        )
        check(
            'gasto 200 y un reverso 200 netean 0 por sus fechas respectivas',
            exp_ledger
            == {
                'movimientos': 2,
                'reversos': 1,
                'neto': 0,
                'fechaReversoClub': today,
                'fechaOriginalClub': business_date,
            },
            {
                'movimientos': 2,
                'reversos': 1,
                'neto': 0,
                'fechaReversoClub': today,
                'fechaOriginalClub': business_date,
            },
            exp_ledger,
        )
        cut_request = str(uuid.uuid4())
        cut_op = (
            'public.registrar_gasto_idempotente('
            + lit(cut_request)
            + ','
            + lit(json.dumps(data))
            + '::jsonb)'
        )
        disconnect('gasto cortado antes de commit', cut_op)
        check(
            'gasto precommit no deja identidad reservada',
            human_scalar('public.consultar_alta_gasto(' + lit(cut_request) + ')') == '',
        )
        disconnect(
            'gasto confirmado con respuesta descartada', cut_op, phase='after_commit'
        )
        recovered_expense = human_scalar(
            'public.consultar_alta_gasto(' + lit(cut_request) + ')'
        )
        fixture['gastoRecuperado'] = recovered_expense
        fixture['solicitudGastoRecuperado'] = cut_request
        check(
            'gasto postcommit se recupera por solicitud sin repetir alta',
            bool(recovered_expense)
            and db(
                'SELECT count(*)FROM private.gasto_altas WHERE solicitud='
                + lit(cut_request)
                + ';'
            )
            == '1',
        )
        check(
            'sin cuotas duplicadas en las fixtures propias',
            db(
                'SELECT count(*)FROM(SELECT socio_id,categoria_id,periodo_mes,periodo_anio FROM public.cuotas WHERE socio_id IN('
                + ','.join(map(lit, members.values()))
                + ')GROUP BY 1,2,3,4 HAVING count(*)>1)x;'
            )
            == '0',
        )
        completed = True
    finally:
        for handle in active:
            if handle['process'].poll() is None:
                rows = activity(handle)
                if rows:
                    db(
                        'SELECT pg_terminate_backend(pid)FROM pg_stat_activity WHERE pid='
                        + str(rows[0]['pid'])
                        + ' AND datname='
                        + lit(DATABASE)
                        + ' AND application_name='
                        + lit(handle['app'])
                        + ';'
                    )
                try:
                    handle['process'].communicate(timeout=5)
                except subprocess.TimeoutExpired:
                    pass
        remaining = int(
            db(
                "SELECT count(*)FROM pg_stat_activity WHERE datname=current_database() AND application_name LIKE 'test-fin-%';"
            )
        )
        correcto = completed and remaining == 0 and all(c['correcto'] for c in checks)

print(
    json.dumps(
        {
            'correcto': correcto,
            'checks': len(checks),
            'carreras': len(races),
            'cortes': len(cuts),
            'database': DATABASE,
        }
    )
)
assert correcto
