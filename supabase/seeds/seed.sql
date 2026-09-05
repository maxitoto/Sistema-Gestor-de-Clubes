--=================================================================================
-- 1. CONFIGURACIÓN DEL CLUB
--=================================================================================
INSERT INTO public.club (id, nombre, cuit, domicilio_fiscal, email_contacto, punto_venta)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'Club Los Andes',
    '30-12345678-9',
    'Av. San Martín 123',
    'contacto@clublosandes.com',
    1
) ON CONFLICT (id) DO NOTHING;

--=================================================================================
-- 2. SOCIOS 
-- Usamos IDs predefinidos (empezando con 'a') para poder relacionarlos abajo
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
-- IDs predefinidos (empezando con 'd')
--=================================================================================
INSERT INTO public.deportes (id, nombre, descripcion) VALUES
('d1111111-1111-1111-1111-111111111111', 'Fútbol', 'Fútbol 11 y Fútbol 5'),
('d2222222-2222-2222-2222-222222222222', 'Básquet', 'Categorías formativas y primera'),
('d3333333-3333-3333-3333-333333333333', 'Tenis', 'Canchas de polvo de ladrillo'),
('d4444444-4444-4444-4444-444444444444', 'Judo', 'Tatami profesional')
ON CONFLICT (nombre) DO NOTHING;

--=================================================================================
-- 4. CATEGORÍAS
-- IDs predefinidos (empezando con 'c')
--=================================================================================
INSERT INTO public.categorias (id, deporte_id, nombre, arancel_mensual, edad_min, edad_max) VALUES
('c1111111-1111-1111-1111-111111111111', 'd1111111-1111-1111-1111-111111111111', 'Mayores Libre', 15000.00, 18, 99),
('c2222222-2222-2222-2222-222222222222', 'd2222222-2222-2222-2222-222222222222', 'Primera División', 12000.00, 18, 99),
('c3333333-3333-3333-3333-333333333333', 'd3333333-3333-3333-3333-333333333333', 'Escuela Adultos', 20000.00, 18, 99),
('c4444444-4444-4444-4444-444444444444', 'd4444444-4444-4444-4444-444444444444', 'Competencia', 10000.00, 15, 45)
ON CONFLICT (deporte_id, nombre) DO NOTHING;

--=================================================================================
-- 5. INSCRIPCIONES
-- Conectamos a los socios (a...) con las categorías (c...)
--=================================================================================
INSERT INTO public.inscripciones (socio_id, categoria_id, estado, fecha_alta) VALUES
('a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'activa', '2024-01-15'),
('a2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'activa', '2024-02-01'),
('a3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'inactiva', '2023-10-10'),
('a4444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', 'activa', '2024-03-05'),
('a5555555-5555-5555-5555-555555555555', 'c4444444-4444-4444-4444-444444444444', 'activa', '2024-01-20')
ON CONFLICT DO NOTHING;

--=================================================================================
-- 6. CUOTAS GENERADAS (Algunas pagadas, otras pendientes)
-- IDs predefinidos cambiados a 'e' para ser válidos en hexadecimal
--=================================================================================
INSERT INTO public.cuotas (id, socio_id, categoria_id, periodo_mes, periodo_anio, monto, estado) VALUES
('e1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 7, 2026, 15000.00, 'pagada'), 
('e1111112-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 8, 2026, 15000.00, 'pendiente'), 
('e2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 8, 2026, 12000.00, 'pendiente')  
ON CONFLICT DO NOTHING;

--=================================================================================
-- 7. CATEGORÍAS DE GASTO
-- IDs predefinidos cambiados a 'f' para ser válidos en hexadecimal
--=================================================================================
INSERT INTO public.categorias_gasto (id, nombre, descripcion) VALUES
('f1111111-1111-1111-1111-111111111111', 'Mantenimiento', 'Arreglos de canchas e instalaciones'),
('f2222222-2222-2222-2222-222222222222', 'Servicios', 'Luz, Agua, Gas, Internet'),
('f3333333-3333-3333-3333-333333333333', 'Sueldos', 'Pago a profesores y personal')
ON CONFLICT (nombre) DO NOTHING;

-- CREAR USUARIO ADMIN DE PRUEBA
DO $$
DECLARE
    v_user_id UUID := '4f2dbe40-2841-44bd-b730-0479364b1049'::uuid;
BEGIN
    -- 1. Crear en Supabase Auth con contraseña segura (cumple reglas de 8 caracteres, mayúsculas y números)
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

    -- 2. Vincular en public.usuarios con rol 'admin'
    INSERT INTO public.usuarios (id, nombre, apellido, email, rol, estado)
    VALUES (v_user_id, 'Administrador', 'Principal', 'admin@clublosandes.com', 'admin', 'activo')
    ON CONFLICT (id) DO UPDATE SET rol = 'admin';
    END IF;
END $$;