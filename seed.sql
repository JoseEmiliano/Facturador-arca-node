-- Asegurar empresa por defecto
INSERT INTO empresas (id, razon_social, cuit, condicion_iva, plan, limite_mensual)
VALUES (1, 'Maxi Kiosco 24hs El Trébol S.R.L.', '30712345678', 'Responsable Inscripto', 'PyME', 1000)
ON CONFLICT (id) DO NOTHING;

-- Asegurar punto de venta
INSERT INTO puntos_venta (id, empresa_id, numero, nombre)
VALUES (1, 1, 1, 'Caja Principal - Local 1')
ON CONFLICT (id) DO NOTHING;

-- Asegurar usuario con el correo correcto (contraseña 'admin123' hasheada)
INSERT INTO usuarios (id, empresa_id, email, password_hash, nombre, rol, punto_venta_id)
VALUES (1, 1, 'demo@gestioncloud.com.ar', '$2a$10$X7vQ4z2F5kK8W3xY1zZ9ue8V3xY1zZ9ue8V3xY1zZ9ue8V3xY1zZ9u', 'Administrador Propietario', 'propietario', 1)
ON CONFLICT (id) DO UPDATE 
SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash;

-- Insertar productos de prueba
INSERT INTO productos (id, empresa_id, codigo, nombre, precio, stock, stock_minimo, tipo)
VALUES 
(1, 1, '77912345', 'Coca Cola 2.5L descartable', 2500.00, 45, 10, 'unidad'),
(2, 1, '77998765', 'Alfajor Triple Chocolate', 800.00, 120, 20, 'unidad'),
(3, 1, '77911122', 'Cinta Scotch Transparente', 1500.00, 15, 5, 'unidad'),
(4, 1, '77933344', 'Papas Fritas Lays 90g', 1800.00, 30, 8, 'unidad')
ON CONFLICT (id) DO NOTHING;
