-- CREA UN CLUB DE PRUEBA
INSERT INTO club (id, nombre, cuit, domicilio_fiscal, email_contacto, punto_venta, logo_url)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  'Club Atlético Los Andes',
  '30-12345678-9',
  'Av. Santa Fe 1234, CABA',
  'contacto@clublosandes.com',
  1,
  'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=128'
)
ON CONFLICT (id) DO UPDATE SET 
  nombre = EXCLUDED.nombre,
  cuit = EXCLUDED.cuit,
  domicilio_fiscal = EXCLUDED.domicilio_fiscal,
  email_contacto = EXCLUDED.email_contacto;

-- Socios iniciales de prueba (respetando la regla de fecha_baja)
INSERT INTO socios (dni, nombre, apellido, fecha_nacimiento, email, estado, fecha_baja) VALUES
('29111222', 'Lionel', 'Messi', '1987-06-24', 'lio@clublosandes.com', 'activo', NULL),
('25333444', 'Emanuel', 'Ginóbili', '1977-07-28', 'manu@clublosandes.com', 'activo', NULL),
('18555666', 'Gabriela', 'Sabatini', '1970-05-16', 'gaby@clublosandes.com', 'inactivo', '2025-12-31');

-- Deportes iniciales
INSERT INTO deportes (id, nombre, descripcion, estado) VALUES
('11111111-1111-1111-1111-111111111111', 'Fútbol', 'Fútbol infantil, juvenil y senior', 'activo'),
('22222222-2222-2222-2222-222222222222', 'Básquetbol', 'Escuelita y formativas', 'activo'),
('33333333-3333-3333-3333-333333333333', 'Tenis', 'Clases individuales y grupales', 'activo');

-- Categorías iniciales
INSERT INTO categorias (deporte_id, nombre, arancel_mensual, edad_min, edad_max, estado) VALUES
('11111111-1111-1111-1111-111111111111', 'Sub-13', 15000.00, 10, 13, 'activo'),
('11111111-1111-1111-1111-111111111111', 'Primera División', 20000.00, 18, 99, 'activo'),
('22222222-2222-2222-2222-222222222222', 'Mini Básquet', 12000.00, 6, 12, 'activo'),
('33333333-3333-3333-3333-333333333333', 'Adultos General', 25000.00, 18, 99, 'activo');

-- CREA UN USUARIO ADMIN DE PRUEBA
DO $$
DECLARE
    v_user_id UUID := '4f2dbe40-2841-44bd-b730-0479364b1049'::uuid;
BEGIN
    -- 1. Insertar en auth.users con todos los campos de texto requeridos por GoTrue
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
        '', '', '', '', '', '', '', '' -- Strings vacíos para evitar error Scan NULL en GoTrue
    );

    -- 2. Insertar en public.usuarios con rol 'admin'
    INSERT INTO public.usuarios (id, nombre, apellido, email, rol, estado)
    VALUES (v_user_id, 'Administrador', 'Principal', 'admin@clublosandes.com', 'admin', 'activo')
    ON CONFLICT (id) DO UPDATE SET rol = 'admin';
    END IF;
END $$;