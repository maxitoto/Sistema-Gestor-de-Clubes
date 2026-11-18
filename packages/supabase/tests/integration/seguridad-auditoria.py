from pathlib import Path
import json, re, subprocess, sys

sys.dont_write_bytecode = True
r = Path(__file__).resolve().parents[4]
backend = r / 'packages/supabase'
checks = []


def record(caso, correcto, **evidencia):
    checks.append({'caso': caso, 'correcto': bool(correcto), 'evidencia': evidencia})
    print(('OK: ' if correcto else 'FALLO: ') + caso, flush=True)


container = 'supabase_db_sistema-club-los-andes'
c = json.loads(subprocess.check_output(['docker', 'container', 'inspect', container], text=True))[0]
assert (
    c['Name'] == '/' + container
    and c['State']['Running']
    and c['Config']['Labels']['com.supabase.cli.project'] == 'sistema-club-los-andes'
)
assert all(p['HostPort'] == '54322' for p in c['NetworkSettings']['Ports']['5432/tcp'])

query = """SELECT jsonb_agg(jsonb_build_object('rol',r.rol,'tabla',t.tabla,'select',has_table_privilege(r.rol,t.tabla,'SELECT'),'update',has_table_privilege(r.rol,t.tabla,'UPDATE'))) FROM (VALUES('anon'),('authenticated'))r(rol) CROSS JOIN (VALUES('private.fiscal_configuracion'),('private.archivos_cargas'),('private.usuarios_operaciones'),('private.wsaa_tickets'))t(tabla);
SELECT jsonb_agg(jsonb_build_object('rol',r.rol,'funcion',f.nombre,'execute',has_function_privilege(r.rol,f.nombre,'EXECUTE')))FROM(VALUES('anon'),('authenticated'))r(rol)CROSS JOIN(VALUES('public.archivo_registrar_validado(text,uuid,uuid,text,text,bigint)'),('public.reservar_correos(text)'),('public.acceso_limitar(text,text,text)'))f(nombre);"""

p = subprocess.run(
    ['docker', 'exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1', '-Atq'],
    input=query,
    text=True,
    capture_output=True,
)
assert p.returncode == 0, p.stderr[:800]
metadata = [json.loads(line) for line in p.stdout.splitlines() if line.strip()]
for row in metadata[0]:
    record(
        f"{row['rol']}: tabla privada {row['tabla']} sin lectura/escritura",
        not row['select'] and not row['update'],
    )
for row in metadata[1]:
    record(
        f"{row['rol']}: RPC técnica {row['funcion'].split('(')[0]} no ejecutable",
        not row['execute'],
    )


def env(path):
    out = {}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            k, v = line.split('=', 1)
            out[k.strip()] = v.strip().strip('"').strip("'")
    return out


variables = env(backend / 'functions/.env')
protected = [
    v
    for k, v in variables.items()
    if len(v) >= 16 and any(t in k for t in ['SECRET', 'SERVICE_ROLE', 'PASSWORD', 'MASTER_KEY'])
]
files = [
    p
    for p in (r / 'packages/frontend/dist').rglob('*')
    if p.is_file() and p.suffix in ['.js', '.map', '.html']
]
assert files, 'Falta compilación de frontend en dist/'
text = '\n'.join(p.read_text() for p in files)

record(
    'Bundle y sourcemap no contienen valores técnicos privados vigentes',
    all(v not in text for v in protected),
    archivos=len(files),
    valoresContrastados=len(protected),
)
record(
    'Bundle y sourcemap sin material PEM privado/certificado',
    not re.search(r'-----BEGIN (?:[A-Z ]*PRIVATE KEY|CERTIFICATE)-----', text),
)
record(
    'Artefacto compilado apunta al puerto API local configurado',
    set(re.findall(r'127\.0\.0\.1:\d+', text)) == {'127.0.0.1:54321'},
)
record(
    'Auth mantiene expiración de enlaces en 15 minutos',
    'otp_expiry = 900' in (backend / 'config.toml').read_text(),
)

correcto = all(c['correcto'] for c in checks)
print(
    json.dumps(
        {
            'checks': len(checks),
            'correcto': correcto,
            'failed': [c['caso'] for c in checks if not c['correcto']],
        }
    )
)
assert correcto
