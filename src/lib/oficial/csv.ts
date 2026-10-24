// CSV del historial del oficial, generado en el navegador. Separador `;` y coma decimal (Excel en es-VE),
// UTF-8 con BOM para que Excel respete los acentos. La cédula va enmascarada, como en la tabla (docs/08).
import { diaCaracas, formatFecha, formatHora } from '../format.ts'
import { ESTADO, TIPO } from '../etiquetas.ts'
import type { MultaOficial } from './demo.ts'

/**
 * Una celda: neutraliza la inyección de fórmulas (Excel/Sheets ejecutan lo que empieza con = + - @ tab o CR)
 * anteponiendo `'`, y siempre va entre comillas con las comillas internas duplicadas.
 */
export function celdaCsv(valor: string): string {
  const v = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return `"${v.replace(/"/g, '""')}"`
}

const COLUMNAS = ['Fecha y hora', 'Tipo', 'Placa', 'Cédula', 'Intersección', 'Monto (Bs.)', 'Estado']

export function multasCsv(multas: MultaOficial[]): string {
  const filas = multas.map((m) => [
    `${formatFecha(m.occurredAt)} ${formatHora(m.occurredAt)}`,
    TIPO[m.type],
    m.plate,
    m.cedulaMasked ?? '',
    m.intersection,
    (m.amountCents / 100).toFixed(2).replace('.', ','),
    ESTADO[m.status],
  ])
  return [COLUMNAS, ...filas].map((f) => f.map(celdaCsv).join(';')).join('\r\n')
}

export function descargarCsv(multas: MultaOficial[]) {
  const url = URL.createObjectURL(new Blob(['﻿', multasCsv(multas)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `multas-${diaCaracas(new Date())}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
