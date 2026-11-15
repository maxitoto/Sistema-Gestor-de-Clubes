"""Utilidad de clonación efímera en memoria de la base de datos local para pruebas de concurrencia."""
from contextlib import contextmanager
from pathlib import Path
import json
import subprocess
import uuid

PROJECT_ID = 'sistema-club-los-andes'
CONTAINER = f'supabase_db_{PROJECT_ID}'
DB_PORT_ESPERADO = '54322'


def verificar_contenedor_db():
    r = Path(__file__).resolve().parents[4]
    inspection = json.loads(
        subprocess.check_output(['docker', 'container', 'inspect', CONTAINER], text=True)
    )[0]
    assert inspection['Name'] == '/' + CONTAINER and inspection['State']['Running']
    assert inspection['Config']['Labels']['com.supabase.cli.project'] == PROJECT_ID
    assert all(
        p['HostPort'] == DB_PORT_ESPERADO
        for p in inspection['NetworkSettings']['Ports']['5432/tcp']
    )
    return r


def ejecutar_sql_admin(sql, database='postgres'):
    p = subprocess.run(
        [
            'docker',
            'exec',
            '-i',
            CONTAINER,
            'psql',
            '-U',
            'postgres',
            '-d',
            database,
            '-X',
            '-Atq',
            '-v',
            'ON_ERROR_STOP=1',
        ],
        input=sql,
        text=True,
        capture_output=True,
    )
    if p.returncode != 0:
        raise RuntimeError(p.stderr[-1800:])
    return p.stdout.strip()


@contextmanager
def base_efimera(prefijo, comentario):
    verificar_contenedor_db()
    sufijo = uuid.uuid4().hex[:8]
    database = f'test_{prefijo}_{sufijo}'
    assert database != 'postgres' and database.startswith(f'test_{prefijo}_')

    dump_proc = subprocess.run(
        ['docker', 'exec', CONTAINER, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc'],
        capture_output=True,
    )
    if dump_proc.returncode != 0:
        raise RuntimeError(dump_proc.stderr.decode(errors='replace')[-1800:])
    dump_bytes = dump_proc.stdout

    toc_proc = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'pg_restore', '-l'],
        input=dump_bytes,
        capture_output=True,
    )
    if toc_proc.returncode != 0:
        raise RuntimeError(toc_proc.stderr.decode(errors='replace')[-1800:])
    toc_lines = toc_proc.stdout.decode('utf-8').splitlines()

    selected = []
    omitted = []
    patrones_excluidos = [
        'EXTENSION - pg_cron',
        'EXTENSION pg_cron',
        'SCHEMA - cron ',
        ' cron ',
        'EXTENSION - pg_net',
        'EXTENSION pg_net',
        'SCHEMA - net ',
        ' net ',
        'EVENT TRIGGER - issue_pg_cron_access',
        'EVENT TRIGGER - issue_pg_net_access',
    ]
    for line in toc_lines:
        skip = not line.startswith(';') and any(x in line for x in patrones_excluidos)
        if skip:
            omitted.append(line)
        else:
            selected.append(line)
    assert omitted, 'El listado TOC debe excluir extensiones de programación y red técnica.'

    comentario_seguro = comentario.replace("'", "''")
    ejecutar_sql_admin(f'CREATE DATABASE {database} TEMPLATE template0;')
    ejecutar_sql_admin(f"COMMENT ON DATABASE {database} IS '{comentario_seguro}';")

    container_toc = f'/tmp/{database}.toc'
    toc_write = subprocess.run(
        ['docker', 'exec', '-i', CONTAINER, 'sh', '-c', f'umask 077; cat > {container_toc}'],
        input=('\n'.join(selected) + '\n').encode('utf-8'),
        capture_output=True,
    )
    if toc_write.returncode != 0:
        ejecutar_sql_admin(f'DROP DATABASE IF EXISTS {database};')
        raise RuntimeError(toc_write.stderr.decode(errors='replace')[-1800:])

    try:
        restore_proc = subprocess.run(
            [
                'docker',
                'exec',
                '-i',
                CONTAINER,
                'pg_restore',
                '-U',
                'supabase_admin',
                '-d',
                database,
                '--exit-on-error',
                f'--use-list={container_toc}',
            ],
            input=dump_bytes,
            capture_output=True,
        )
        if restore_proc.returncode != 0:
            raise RuntimeError(restore_proc.stderr.decode(errors='replace')[-1800:])
    finally:
        subprocess.run(
            ['docker', 'exec', CONTAINER, 'rm', '-f', '--', container_toc],
            capture_output=True,
        )

    assert (
        ejecutar_sql_admin(
            "SELECT count(*) FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');",
            database=database,
        )
        == '0'
    )

    try:
        yield CONTAINER, database, comentario
    finally:
        try:
            ejecutar_sql_admin(
                f"SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '{database}' AND pid <> pg_backend_pid();"
            )
            ejecutar_sql_admin(f'DROP DATABASE IF EXISTS {database};')
        except Exception:
            pass
