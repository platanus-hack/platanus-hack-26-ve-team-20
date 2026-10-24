# SmartTraffic · app móvil (Expo)

App Expo (SDK 58, Expo Router, TypeScript estricto) con tres modos: ciudadano, policía y cámara (operador). Diseño: "Dirección C · Cuentas". Todo es demo: datos ficticios y pagos simulados (`src/demo/`).

```bash
npm install
npx expo start          # Expo Go en el teléfono
npx expo start --web    # simular en el navegador
npm test                # lógica de la capa demo (vitest)
npm run typecheck
```

Proyecto independiente con npm: no forma parte del workspace pnpm de la raíz.

## Rutas (`src/app`)
- `/` selector de modo y acceso "Modo cámara (operador)" (clave de 6+ caracteres).
- `(ciudadano)/ciudadano/…` login, registro, código, cuenta creada, pestañas (inicio, multas, vehículos, perfil), `multa/[id]`, pago, comprobante.
- `(policia)/policia/…` login (correo o Google simulado), código de institución, registro, pestañas (alertas, consultar, perfil).
- `/camara` modo cámara horizontal.

## Datos de demo
- Ciudadano `V-99000001`, cualquier contraseña de 8+ caracteres (`clave-mal` falla). Registro: código `123456` válido, `000000` inválido; cédula `12345678` = ya registrada.
- Clave C2P: `000000` clave inválida, `111111` fondos insuficientes, cualquier otra de 6–8 dígitos se aprueba (`SIM-########`).
- Policía `oficial.a@example.com` / `demo1234`. Código de institución `TRANSITO-DEMO`. La alerta `XY987ZT` llega 2 s después de abrir Alertas.
- Cámara: código `CAM-001`. Una URL de API sin `http(s)://` en Ajustes simula "sin conexión" para probar el reintento.

`EXPO_PUBLIC_API_BASE_URL` (en `mobile/.env`) fija la URL de la API por defecto del modo cámara.
