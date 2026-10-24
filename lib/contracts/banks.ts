// Lista de EJEMPLO de bancos para Pago Móvil C2P (docs/04 §5). Vive en contratos porque la usan
// el formulario (src/pages/Pagar.tsx) y la validación del servidor (api/payments). El pago es SIMULADO.
export interface ExampleBank {
  code: string;
  name: string;
}

export const EXAMPLE_BANKS: readonly ExampleBank[] = [
  { code: "0102", name: "Banco de Venezuela" },
  { code: "0104", name: "Venezolano de Crédito" },
  { code: "0105", name: "Mercantil" },
  { code: "0108", name: "Provincial" },
  { code: "0114", name: "Bancaribe" },
  { code: "0115", name: "Exterior" },
  { code: "0134", name: "Banesco" },
  { code: "0151", name: "BFC Banco Fondo Común" },
  { code: "0163", name: "Banco del Tesoro" },
  { code: "0171", name: "Banco Activo" },
  { code: "0172", name: "Bancamiga" },
  { code: "0174", name: "Banplus" },
  { code: "0175", name: "Banco Digital de los Trabajadores" },
  { code: "0191", name: "BNC Nacional de Crédito" },
];

export function isExampleBank(code: string): boolean {
  return EXAMPLE_BANKS.some((bank) => bank.code === code);
}
