--=================================================================================
-- 1. CONFIGURACIÓN DEL CLUB
--=================================================================================
INSERT INTO public.club (id, nombre, cuit, domicilio_fiscal, email_contacto, punto_venta)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'Club Los Andes',
    '30-71234567-1',          
    'Av. San Martín 123',
    'contacto@clublosandes.com',
    1
) ON CONFLICT (id) DO NOTHING;

--=================================================================================
-- 2. SOCIOS 
--=================================================================================
INSERT INTO public.socios (id, dni, nombre, apellido, fecha_nacimiento, email, telefono, estado, fecha_baja) 
VALUES 
('a1111111-1111-1111-1111-111111111111', '29111222', 'Lionel', 'Messi', '1987-06-24', 'lio@clublosandes.com', '1122334455', 'activo', NULL),
('a2222222-2222-2222-2222-222222222222', '25333444', 'Emanuel', 'Ginóbili', '1977-07-28', 'manu@clublosandes.com', '1133445566', 'activo', NULL),
('a3333333-3333-3333-3333-333333333333', '18555666', 'Gabriela', 'Sabatini', '1970-05-16', 'gaby@clublosandes.com', '1144556677', 'inactivo', '2024-01-15'),
('a4444444-4444-4444-4444-444444444444', '40111222', 'Facundo', 'Campazzo', '1991-03-23', 'facu@clublosandes.com', '1155667788', 'activo', NULL),
('a5555555-5555-5555-5555-555555555555', '35222111', 'Paula', 'Pareto', '1986-01-16', 'peque@clublosandes.com', '1166778899', 'activo', NULL)
ON CONFLICT (dni) DO NOTHING;

--=================================================================================
-- 3. DEPORTES
--=================================================================================
INSERT INTO public.deportes (id, nombre, descripcion) VALUES
('d1111111-1111-1111-1111-111111111111', 'Fútbol', 'Fútbol 11 y Fútbol 5'),
('d2222222-2222-2222-2222-222222222222', 'Básquet', 'Categorías formativas y primera'),
('d3333333-3333-3333-3333-333333333333', 'Tenis', 'Canchas de polvo de ladrillo'),
('d4444444-4444-4444-4444-444444444444', 'Judo', 'Tatami profesional')
ON CONFLICT (nombre) DO NOTHING;

--=================================================================================
-- 4. CATEGORÍAS
--=================================================================================
INSERT INTO public.categorias (id, deporte_id, nombre, arancel_mensual, edad_min, edad_max) VALUES
('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'Mayores Libre', 15000.00, 18, 99),
('c2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'Primera División', 12000.00, 18, 99),
('c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'Escuela Adultos', 20000.00, 18, 99),
('c4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'Competencia', 10000.00, 15, 45)
ON CONFLICT (deporte_id, nombre) DO NOTHING;

--=================================================================================
-- 5. INSCRIPCIONES
--=================================================================================
INSERT INTO public.inscripciones (socio_id, categoria_id, estado, fecha_alta, fecha_baja) VALUES
('a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'activa',   '2024-01-15', NULL),
('a2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'activa',   '2024-02-01', NULL),
('a3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'inactiva', '2023-10-10', '2024-01-15'),
('a4444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', 'activa',   '2024-03-05', NULL),
('a5555555-5555-5555-5555-555555555555', 'c4444444-4444-4444-4444-444444444444', 'activa',   '2024-01-20', NULL)
ON CONFLICT DO NOTHING;

--=================================================================================
-- 6. CUOTAS GENERADAS
--=================================================================================
INSERT INTO public.cuotas (id, socio_id, categoria_id, periodo_mes, periodo_anio, monto, estado, created_at) VALUES
('e4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', 6, 2026, 12000.00, 'pendiente', NOW() - interval '40 days'),
('e5555555-5555-5555-5555-555555555555', 'a5555555-5555-5555-5555-555555555555', 'c4444444-4444-4444-4444-444444444444', 7, 2026, 10000.00, 'pendiente', NOW() - interval '3 days'),
('e5555556-5555-5555-5555-555555555556', 'a5555555-5555-5555-5555-555555555555', 'c4444444-4444-4444-4444-444444444444', 8, 2026, 10000.00, 'pendiente', NOW() - interval '2 days')
ON CONFLICT DO NOTHING;

-- socio INACTIVO con deuda antigua: debe computar deudor y moroso
INSERT INTO public.cuotas (id, socio_id, categoria_id, periodo_mes, periodo_anio, monto, estado, created_at)
VALUES ('e3333333-3333-3333-3333-333333333333',
        'a3333333-3333-3333-3333-333333333333',
        'c3333333-3333-3333-3333-333333333333',
        5, 2026, 20000.00, 'pendiente', NOW() - interval '45 days')
ON CONFLICT DO NOTHING;

--=================================================================================
-- 7. CATEGORÍAS DE GASTO
--=================================================================================
INSERT INTO public.categorias_gasto (id, nombre, descripcion) VALUES
('f1111111-1111-1111-1111-111111111111', 'Mantenimiento', 'Arreglos de canchas e instalaciones'),
('f2222222-2222-2222-2222-222222222222', 'Servicios', 'Luz, Agua, Gas, Internet'),
('f3333333-3333-3333-3333-333333333333', 'Sueldos', 'Pago a profesores y personal')
ON CONFLICT (nombre) DO NOTHING;

--=================================================================================
-- 8. USUARIO ADMIN DE PRUEBA (DEBE IR ANTES DEL FIXTURE DE COMPROBANTE FALLIDO)
--=================================================================================
DO $$
DECLARE
    v_user_id UUID := '4f2dbe40-2841-44bd-b730-0479364b1049'::uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@clublosandes.com') THEN
    INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new,
        email_change, email_change_token_current, phone_change,
        phone_change_token, reauthentication_token
    ) VALUES (
        '00000000-0000-0000-0000-000000000000',
        v_user_id,
        'authenticated',
        'authenticated',
        'admin@clublosandes.com',
        crypt('Pass1234', gen_salt('bf')),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{"nombre":"Administrador","apellido":"Principal"}',
        NOW(),
        NOW(),
        '', '', '', '', '', '', '', ''
    );

    INSERT INTO public.usuarios (id, nombre, apellido, email, rol, estado)
    VALUES (v_user_id, 'Administrador', 'Principal', 'admin@clublosandes.com', 'admin', 'activo')
    ON CONFLICT (id) DO UPDATE SET rol = 'admin';
    END IF;
END $$;

--=================================================================================
-- 9. FIXTURE DE COMPROBANTE FALLIDO (prueba de /monitoreo/reabrir)
-- DEBE IR DESPUÉS DEL BLOQUE DEL ADMIN: pagos.usuario_id FK a public.usuarios
--=================================================================================
INSERT INTO public.cuotas (id, socio_id, categoria_id, periodo_mes, periodo_anio, monto, estado)
VALUES ('e9999999-9999-9999-9999-999999999999',
        'a1111111-1111-1111-1111-111111111111',
        'c1111111-1111-1111-1111-111111111111', 9, 2026, 15000.00, 'pagada')
ON CONFLICT DO NOTHING;

INSERT INTO public.pagos (id, cuota_id, usuario_id, monto, medio_pago, estado)
VALUES ('b9999999-9999-9999-9999-999999999999',
        'e9999999-9999-9999-9999-999999999999',
        '4f2dbe40-2841-44bd-b730-0479364b1049', 15000.00, 'efectivo', 'completado')
ON CONFLICT DO NOTHING;

INSERT INTO public.comprobantes (id, pago_id, tipo, punto_venta, estado_fiscal,
                                 intentos_reintento, proximo_reintento_en,
                                 detalle_error_fiscal, ventana_regularizacion_iniciada_en)
VALUES ('c9999999-9999-9999-9999-999999999999',
        'b9999999-9999-9999-9999-999999999999', 'factura', 1, 'fallido', 6, NULL,
        'Error de configuracion (fixture de prueba)',
        NOW() - interval '30 hours')
ON CONFLICT DO NOTHING;