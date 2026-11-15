import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { analyzeTables } from '../src/lib/analysis.ts'
import { buildReport, exportReport, extractTable, inspectWorkbook, readWorkbook } from '../src/lib/excel.ts'
import { headers, mapping, table, warehouseMapping } from './fixtures.ts'

const workbookOf = (rows: (string | number | null)[][]): XLSX.WorkBook => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Data')
  return workbook
}

test('read XLSX, detect header row after a title and preserve text identifiers', () => {
  const workbook = workbookOf([['Report title'], [], headers, ['001', 'Tab', 0, 4, 0, 0, '000123']])
  const parsed = readWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  const inspection = inspectWorkbook(parsed, 'test.xlsx', 'rasd', 'Data')
  assert.equal(inspection.headerRow, 3)
  assert.equal(inspection.rowCount, 1)
  assert.equal(inspection.mapping.batch, 0)
  const extracted = extractTable(parsed, 'test.xlsx', 'Data', 3)
  assert.equal(extracted.rows[0]!.cells[0]!.value, '001')
  assert.equal(extracted.rows[0]!.rowNumber, 4)
})
test('duplicate headers need manual selection; empty and invalid sheets fail clearly', () => {
  const workbook = workbookOf([['BN', 'BN'], ['a', 'b']])
  const inspection = inspectWorkbook(workbook, 'test.xlsx', 'rasd', 'Data', 1)
  assert.equal(inspection.mapping.batch, undefined)
  assert.deepEqual(inspection.duplicateHeaders, ['BN'])
  assert.throws(() => inspectWorkbook(workbook, 'test.xlsx', 'rasd', 'Missing'))
  assert.throws(() => inspectWorkbook(workbook, 'test.xlsx', 'rasd', 'Data', 99))
})
test('export five pages even when empty and reject blocked analysis or month', () => {
  const source = table([['x', 'Tab', 0, 0, 0, 0]])
  const result = analyzeTables(source, table([], true), mapping, warehouseMapping)
  const report = buildReport(result, source, mapping, '2026-09')
  assert.deepEqual(report.SheetNames, ['منتجات الحقن', 'مرسل فقط', 'مستلم فقط', 'إرسال واستقبال', 'Active فقط'])
  assert.throws(() => buildReport(result, source, mapping, '2026-99'))
  assert.throws(() => buildReport({ ...result, blocked: true }, source, mapping, '2026-09'))
})
test('roundtrip keeps BN and GTIN text, approved quantities numeric and detail rows separate', () => {
  const source = table([[' 001 ', 'Tab', 0, 7, 0, 0, '000123'], ['001', 'Tab B', 0, 7, 0, 0, '000123']])
  const before = JSON.stringify(source)
  const result = analyzeTables(source, table([], true), mapping, warehouseMapping)
  const parsed = readWorkbook(exportReport(result, source, mapping, '2026-09'))
  const sheet = parsed.Sheets['Active فقط']!
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true })
  const headerIndex = grid.findIndex(row => row[0] === 'رقم الباتش الأصلي')
  const row = headerIndex + 1
  assert.equal(sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]!.t, 's')
  assert.equal(sheet[XLSX.utils.encode_cell({ r: row, c: 0 })]!.v, ' 001 ')
  assert.equal(sheet[XLSX.utils.encode_cell({ r: row, c: 2 })]!.v, '000123')
  assert.equal(sheet[XLSX.utils.encode_cell({ r: row, c: 4 })]!.t, 'n')
  assert.equal(sheet[XLSX.utils.encode_cell({ r: row, c: 4 })]!.v, 7)
  assert.equal(grid[row]![8], 2)
  const detailIndex = grid.findIndex(entry => entry[0] === 'مفتاح الباتش')
  assert.equal(grid[detailIndex + 1]![1], 2)
  assert.equal(grid[detailIndex + 2]![1], 3)
  assert.equal(JSON.stringify(source), before)
})
test('original numeric Excel dates and 1904 date system survive report roundtrip', () => {
  const workbook = workbookOf([[...headers, 'Expiry Date'], ['x', 'Tab', 0, 3, 0, 0, '0001', 45000]])
  workbook.Workbook = { WBProps: { date1904: true } }
  workbook.Sheets.Data!['H2']!.z = 'yyyy-mm-dd'
  const original = readWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  const source = extractTable(original, 'test.xlsx', 'Data', 1)
  assert.equal(source.date1904, true)
  const result = analyzeTables(source, table([], true), mapping, warehouseMapping)
  const parsed = readWorkbook(exportReport(result, source, mapping, '2026-09'))
  assert.equal(parsed.Workbook?.WBProps?.date1904, true)
  const sheet = parsed.Sheets['Active فقط']!
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true })
  const detailIndex = grid.findIndex(entry => entry[0] === 'مفتاح الباتش')
  const date = sheet[XLSX.utils.encode_cell({ r: detailIndex + 1, c: 10 })]!
  assert.equal(date.t, 'n')
  assert.equal(date.v, 45000)
  assert.equal(date.z, 'yyyy-mm-dd')
})
test('numeric zero-pad in source identifiers becomes text without losing leading zeros', () => {
  const workbook = workbookOf([headers, [21, 'Tab', 0, 3, 0, 0, '001']])
  workbook.Sheets.Data!['A2']!.z = '000000'
  const parsed = readWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  const source = extractTable(parsed, 'test.xlsx', 'Data', 1)
  const result = analyzeTables(source, table([], true), mapping, warehouseMapping)
  assert.equal(result.groups.active[0]!.batch, '000021')
  const report = buildReport(result, source, mapping, '2026-09')
  assert.ok(report.SheetNames.includes('Active فقط'))
})
test('formulas without cached results never silently become zero', () => {
  const workbook = workbookOf([headers, ['x', 'Tab', 0, 1, 0, 0, '001']])
  workbook.Sheets.Data!['E2'] = { t: 'n', f: '1+2' }
  const source = extractTable(workbook, 'test.xlsx', 'Data', 1)
  const result = analyzeTables(source, table([], true), mapping, warehouseMapping)
  assert.equal(result.blocked, true)
  assert.ok(result.issues.some(issue => issue.reason.includes('صيغة')))
})
test('legacy XLS is supported', () => {
  const workbook = workbookOf([headers, ['x', 'Tab', 0, 1, 0, 0, '001']])
  const parsed = readWorkbook(XLSX.write(workbook, { type: 'array', bookType: 'xls' }) as ArrayBuffer)
  assert.equal(extractTable(parsed, 'test.xls', 'Data', 1).rows.length, 1)
})
