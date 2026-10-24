// Validación del formulario de Pago Móvil C2P (docs/05 §3.4) con mensajes en español.
// Las reglas son las de C2PRequestSchema (lib/contracts/requests.ts); el pedido final pasa por ese schema.
import { C2PRequestSchema, isExampleBank, type C2PRequest } from '@contracts'

export interface C2PFormValues {
  bankCode: string
  phone: string
  cedulaPrefix: 'V' | 'E'
  cedulaNumber: string
  c2pKey: string
}

export type C2PFormErrors = Partial<Record<keyof C2PFormValues, string>>

export const EMPTY_FORM: C2PFormValues = { bankCode: '', phone: '', cedulaPrefix: 'V', cedulaNumber: '', c2pKey: '' }

const onlyDigits = (value: string) => value.replace(/[\s.-]/g, '')

export function validateC2PForm(v: C2PFormValues): C2PFormErrors {
  const errors: C2PFormErrors = {}
  if (!v.bankCode) errors.bankCode = 'Seleccione su banco.'
  else if (!isExampleBank(v.bankCode)) errors.bankCode = 'Seleccione un banco de la lista.'

  const phone = onlyDigits(v.phone)
  if (!phone) errors.phone = 'Ingrese el teléfono afiliado a Pago Móvil.'
  else if (!/^04(12|14|16|24|26)\d{7}$/.test(phone)) errors.phone = 'Use un celular venezolano de 11 dígitos, p. ej. 04121234567.'

  const cedula = onlyDigits(v.cedulaNumber)
  if (!cedula) errors.cedulaNumber = 'Ingrese su número de cédula.'
  else if (!/^\d{5,9}$/.test(cedula)) errors.cedulaNumber = 'La cédula debe tener entre 5 y 9 dígitos.'

  if (!v.c2pKey) errors.c2pKey = 'Ingrese la clave C2P que generó en su banco.'
  else if (!/^\d{6,8}$/.test(v.c2pKey)) errors.c2pKey = 'La clave C2P tiene entre 6 y 8 dígitos.'
  return errors
}

export function toC2PRequest(v: C2PFormValues, fineToken: string, idempotencyKey: string): C2PRequest {
  return C2PRequestSchema.parse({
    fineToken,
    payerBankCode: v.bankCode,
    payerPhone: onlyDigits(v.phone),
    payerCedula: `${v.cedulaPrefix}${onlyDigits(v.cedulaNumber)}`,
    c2pKey: v.c2pKey,
    idempotencyKey,
  })
}

const REJECTION_MESSAGES: Record<string, string> = {
  INVALID_KEY: 'La clave C2P no es válida o ya se usó. Genere una nueva en la app de su banco e intente otra vez.',
  INSUFFICIENT_FUNDS: 'La cuenta asociada no tiene fondos suficientes.',
}

export function rejectionMessage(failureCode: string): string {
  return REJECTION_MESSAGES[failureCode] ?? 'El banco rechazó el pago. Verifique los datos e intente otra vez.'
}
