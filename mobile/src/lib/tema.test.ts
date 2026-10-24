import { describe, expect, it } from 'vitest';

import { esquemaDe, temaClaro, temaOscuro } from '../theme';

describe('tema', () => {
  it('resuelve el esquema según el modo y el sistema', () => {
    expect(esquemaDe('claro', 'dark')).toBe('claro');
    expect(esquemaDe('oscuro', 'light')).toBe('oscuro');
    expect(esquemaDe('sistema', 'dark')).toBe('oscuro');
    expect(esquemaDe('sistema', 'light')).toBe('claro');
    expect(esquemaDe('sistema', null)).toBe('claro');
    expect(esquemaDe('sistema', undefined)).toBe('claro');
  });

  it('el tema oscuro tiene exactamente las mismas claves que el claro', () => {
    expect(Object.keys(temaOscuro).sort()).toEqual(Object.keys(temaClaro).sort());
  });
});
