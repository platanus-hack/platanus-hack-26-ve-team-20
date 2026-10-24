# VíaClara

Multas de tránsito automáticas, con evidencia y pagables desde el teléfono. Proyecto de **team-20** en Platanus Hack 26: Caracas. Track: Trust.

<img src="./project-logo.png" alt="VíaClara logo" width="200" />

## Qué hace
- Detecta cruces en luz roja desde fotogramas de cámaras de semáforo (detector preentrenado con ajuste fino en datasets de Kaggle + tracking + homografía por cámara; un teléfono con app Expo graba el clip).
- Lee la placa, crea la multa con evidencia y avisa al propietario por WhatsApp (WhatsApp Cloud API de Meta).
- Pago con Pago Móvil C2P (**simulado** en la demo, sin dinero real).
- Portal público de consulta por cédula con datos limitados.
- Alerta al oficial más cercano cuando se ve un vehículo con multas impagas.
- Revisión humana para casos dudosos y auditoría de todas las acciones.

Todos los datos de la demo son ficticios.

## Demo
https://<pendiente>.vercel.app

## Stack
React + Vite (TypeScript) y Vercel Functions en Vercel · Tailwind + shadcn/ui · Supabase (Postgres) + Prisma · Vercel Blob · detector de visión afinado (Python) · Expo · WhatsApp Cloud API (Meta).

## Correr localmente
```bash
pnpm install
cp .env.example .env.local   # completar claves
pnpm prisma migrate dev
pnpm prisma db seed
pnpm dev
```

## Documentación
- `AGENTS.md`: reglas, estructura y variables de entorno.
- `docs/00-indice.md`: PRD, arquitectura, modelo de datos, API, UI, QA/demo, plan y privacidad.

## Deploy
Vercel no puede conectarse al repo de la organización: el código se replica a un repo personal (doble `push` en `origin`) y Vercel despliega desde ahí.

## Equipo
- Jonathan Pizzurro ([@totan23](https://github.com/totan23))
- Edward Pizzurro ([@edwardpizzu](https://github.com/edwardpizzu))
- Cristian Fazio ([@cristianf4zio](https://github.com/cristianf4zio))
- Daniel Morillo ([@daniel-morillo](https://github.com/daniel-morillo))
