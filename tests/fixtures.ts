import type { CellValue, Mapping, SourceCell, SourceTable } from '../src/types.ts'

export const headers = ['BN', 'Product Name', 'Quantity', 'Active', 'Quantity sent pending', 'Quantity Receive Pending', 'GTIN']
export const mapping: Mapping = { batch: 0, product: 1, quantity: 2, active: 3, sent: 4, received: 5, gtin: 6 }
export const warehouseMapping: Mapping = { batch: 0 }
export const cell = (value: CellValue): SourceCell => ({ value, type: value === null ? 'z' : typeof value === 'number' ? 'n' : typeof value === 'boolean' ? 'b' : 's', display: value === null ? '' : String(value) })
export function table(rows: CellValue[][], warehouse = false): SourceTable {
  return { filename: warehouse ? 'warehouse-test.xlsx' : 'rasd-test.xlsx', sheetName: 'Data', date1904: false,
    headers: warehouse ? ['Batch No'] : headers, rows: rows.map((row, index) => ({ rowNumber: index + 2, cells: row.map(cell) })) }
}
