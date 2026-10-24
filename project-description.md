# VíaClara

**La multa llega con la prueba, y se paga en un minuto.**

## El problema
Comerse la luz roja casi nunca tiene consecuencia si no hay un fiscal presente. Y cuando hay multa, el conductor no se entera a tiempo, no ve la evidencia y pagarla es un trámite.

## Qué hace VíaClara
1. **Detecta**: un teléfono con la app de VíaClara hace de cámara en el semáforo y graba un clip corto; un detector preentrenado, afinado con datasets abiertos de Kaggle, sigue al vehículo y lee la placa, y una homografía calibrada estima su velocidad y dirección; una regla geométrica confirma que cruzó la línea de pare en rojo.
2. **Notifica**: se crea la multa con evidencia (fotos, hora, intersección) y el propietario recibe un **WhatsApp** con el enlace.
3. **Paga**: desde el teléfono, con **Pago Móvil C2P** (banco, teléfono, cédula y clave C2P). *En la demo el pago es simulado.*
4. **Consulta**: portal público por **cédula** con información limitada (placa enmascarada, sin datos personales).
5. **Alerta**: si una cámara ve un vehículo con multas impagas, el **oficial de tránsito más cercano** recibe una alerta por WhatsApp y en su vista móvil con mapa.

## Confianza primero (track Trust)
- Multa automática solo si la IA y la regla geométrica coinciden con alta confianza; si no, **revisión humana**.
- Evidencia visible en cada multa y flujo de apelación.
- Alertas que muestran dónde se vio el vehículo, nunca datos del dueño.
- Auditoría de cada acción. Demo con **datos 100 % ficticios**.

## Tecnología
React + TypeScript en **Vercel** · Postgres (Supabase) + Prisma · Vercel Blob · **detector de visión afinado** (Python) · **Expo** (app de cámara) · **WhatsApp Cloud API de Meta**.

En producción: cámaras reales con el mismo modelo en el borde, ALPR especializado en placas venezolanas e integración C2P real vía banco o agregador.

## Equipo
team-20 · Platanus Hack 26 Caracas
