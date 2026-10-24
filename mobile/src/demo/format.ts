// Formatos de la app: montos "Bs. 1.250,00" y horas 24 h en America/Caracas.
// Sin Intl para que el resultado sea igual en Hermes, web y tests.

export function bs(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const entero = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const dec = (abs % 100).toString().padStart(2, '0');
  return `${neg ? '-' : ''}Bs. ${entero},${dec}`;
}

// Caracas es UTC-4 todo el año (sin horario de verano).
const CARACAS_OFFSET_MS = -4 * 60 * 60 * 1000;

function enCaracas(d: Date): Date {
  return new Date(d.getTime() + CARACAS_OFFSET_MS);
}

const dos = (n: number) => n.toString().padStart(2, '0');

export function horaCaracas(d: Date): string {
  const c = enCaracas(d);
  return `${dos(c.getUTCHours())}:${dos(c.getUTCMinutes())}`;
}

export function fechaCaracas(d: Date): string {
  const c = enCaracas(d);
  return `${dos(c.getUTCDate())}/${dos(c.getUTCMonth() + 1)}/${c.getUTCFullYear()}`;
}

// "0,91" para la confianza del modelo.
export function decimal(n: number, digitos = 2): string {
  return n.toFixed(digitos).replace('.', ',');
}
