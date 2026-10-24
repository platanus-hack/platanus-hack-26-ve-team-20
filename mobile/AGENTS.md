App Expo (SDK 58, Expo Router, TypeScript estricto). Proyecto independiente con npm propio: no es parte del workspace pnpm de la raíz ni importa código de ella.

## Comandos

```bash
npm install
npx expo start         # dev server (Expo Go)
npx expo start --web   # navegador
npx tsc --noEmit       # typecheck
npm test               # vitest (capa demo)
```

Para añadir dependencias usa `npx expo install <paquete>` (versiones compatibles con el SDK).

## Reglas

- Las APIs de Expo cambian en cada SDK: consulta https://docs.expo.dev/versions/v58.0.0/ antes de usar una.
- Rutas en `src/app/` (cada archivo es una pantalla); el resto fuera de `src/app/`.
- Todo es demo (`src/demo/`): datos ficticios y pagos simulados.
