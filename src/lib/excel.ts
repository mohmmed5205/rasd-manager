import * as XLSX from 'xlsx'
import { DUPLICATE_POLICY, GROUPS, MAX_COLUMNS, MAX_ROWS } from '../config/rules.ts'
import { detectMapping, normalizeHeader, readIdentifier, summarize, validateMonth } from './analysis.ts'
import type { AnalysisResult, Inspection, Mapping, Slot, SourceCell, SourceRow, SourceTable } from '../types.ts'

export function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  try {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, cellNF: true, cellText: true })
    if (!workbook.SheetNames.length) throw new Error('لا توجد أوراق عمل')
    return workbook
  } catch {
    throw new Error('تعذر قراءة الملف. اختر ملف Excel صالحًا وغير محمي بكلمة مرور (.xlsx أو .xls).')
  }
}

function sheetRange(workbook: XLSX.WorkBook, name: string): XLSX.Range {
  const sheet = workbook.Sheets[name]
  if (!sheet) throw new Error('ورقة العمل غير موجودة.')
  if (!sheet['!ref']) throw new Error('ورقة العمل فارغة؛ اختر ورقة أخرى.')
  const range = XLSX.utils.decode_range(sheet['!ref'])
  if (range.e.r + 1 > MAX_ROWS || range.e.c + 1 > MAX_COLUMNS) {
    throw new Error(`الورقة تتجاوز حد هذه النسخة: ${MAX_ROWS} صف و${MAX_COLUMNS} عمود. احذف التنسيق الممتد إلى صفوف فارغة أو قسّم الملف.`)
  }
  return range
}

function sourceCell(cell: XLSX.CellObject | undefined): SourceCell {
  if (!cell) return { type: 'z', value: null, display: '' }
  if (cell.f && cell.v == null) return { type: 'e', value: null, display: 'صيغة بلا نتيجة محفوظة؛ افتح الملف واحسبه واحفظه في Excel.' }
  const type = cell.t === 'n' || cell.t === 'b' || cell.t === 'e' || cell.t === 'z' ? cell.t : 's'
  const value = cell.v === undefined || cell.v === null ? null
    : typeof cell.v === 'number' || typeof cell.v === 'boolean' || typeof cell.v === 'string' ? cell.v : String(cell.v)
  return { type, value, display: cell.w ?? (value === null ? '' : String(value)), ...(typeof cell.z === 'string' ? { format: cell.z } : {}) }
}

function rowAt(sheet: XLSX.WorkSheet, row: number, lastColumn: number): SourceRow {
  const cells = Array.from({ length: lastColumn + 1 }, (_, column) => sourceCell(sheet[XLSX.utils.encode_cell({ r: row, c: column })] as XLSX.CellObject | undefined))
  return { rowNumber: row + 1, cells }
}

export function inspectWorkbook(workbook: XLSX.WorkBook, filename: string, slot: Slot, sheetName: string, headerRow?: number): Inspection {
  const range = sheetRange(workbook, sheetName)
  const sheet = workbook.Sheets[sheetName]!
  let chosenRow = headerRow
  if (chosenRow === undefined) {
    let bestScore = -1
    chosenRow = range.s.r + 1
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 24); r++) {
      const labels = rowAt(sheet, r, range.e.c).cells.map(cell => cell.display)
      const mapping = detectMapping(labels, slot)
      const score = Object.keys(mapping).length + (mapping.batch === undefined ? 0 : 10)
      if (score > bestScore) { bestScore = score; chosenRow = r + 1 }
    }
  }
  if (!Number.isInteger(chosenRow) || chosenRow < 1 || chosenRow > range.e.r + 1) throw new Error('رقم صف العناوين غير صالح.')
  const rawHeaders = rowAt(sheet, chosenRow - 1, range.e.c).cells.map(cell => cell.display)
  const headers = rawHeaders.map((label, index) => label || `عمود ${XLSX.utils.encode_col(index)}`)
  const normalized = rawHeaders.map(normalizeHeader)
  const duplicateHeaders = [...new Set(rawHeaders.filter((label, index) => label.trim() && normalized.indexOf(normalized[index]!) !== index))]
  let rowCount = 0
  const preview: string[][] = []
  for (let r = chosenRow; r <= range.e.r; r++) {
    const row = rowAt(sheet, r, range.e.c)
    if (!row.cells.some(cell => cell.value !== null && String(cell.value).trim() !== '' || cell.type === 'e')) continue
    rowCount++
    if (preview.length < 3) preview.push(row.cells.map(cell => cell.display))
  }
  return { filename, sheets: workbook.SheetNames, sheetName, headerRow: chosenRow, maxRow: range.e.r + 1,
    rowCount, headers, preview, mapping: detectMapping(rawHeaders, slot), duplicateHeaders }
}

export function extractTable(workbook: XLSX.WorkBook, filename: string, sheetName: string, headerRow: number): SourceTable {
  const range = sheetRange(workbook, sheetName)
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > range.e.r + 1) throw new Error('حدد صف عناوين صالحًا.')
  const sheet = workbook.Sheets[sheetName]!
  const headers = rowAt(sheet, headerRow - 1, range.e.c).cells.map((cell, index) => cell.display || `عمود ${XLSX.utils.encode_col(index)}`)
  const rows: SourceRow[] = []
  for (let r = headerRow; r <= range.e.r; r++) {
    const row = rowAt(sheet, r, range.e.c)
    if (row.cells.some(cell => cell.value !== null && String(cell.value).trim() !== '' || cell.type === 'e')) rows.push(row)
  }
  if (!rows.length) throw new Error(`لا توجد صفوف بيانات في «${filename}» بعد صف العناوين.`)
  return { filename, sheetName, headers, rows, date1904: Boolean(workbook.Workbook?.WBProps?.date1904) }
}

function exportCell(cell: SourceCell, identifier: boolean): XLSX.CellObject {
  if (identifier) return { t: 's', v: readIdentifier(cell), z: '@' }
  if (cell.type === 'e') return { t: 's', v: cell.display }
  if (cell.value === null) return { t: 'z' }
  return { t: cell.type === 'z' ? 's' : cell.type, v: cell.value, ...(cell.format ? { z: cell.format } : {}) }
}

export function buildReport(result: AnalysisResult, table: SourceTable, mapping: Mapping, month: string): XLSX.WorkBook {
  if (!validateMonth(month)) throw new Error('اختر شهر التقرير بصيغة سنة-شهر.')
  if (result.blocked) throw new Error('عالج أخطاء البيانات وتعارضات التكرار قبل التصدير.')
  const workbook = XLSX.utils.book_new()
  workbook.Workbook = { WBProps: { date1904: table.date1904 }, Views: [{ RTL: true }] }
  workbook.Props = { Title: `إدارة رصد ${month}`, Subject: 'باتشات موجودة في رصد فقط', Author: 'إدارة رصد' }
  const s = result.stats
  const audit: (string | number)[][] = [
    ['شهر التقرير', month, 'المصدر', table.filename, 'الورقة', table.sheetName],
    ['سياسة التكرار', DUPLICATE_POLICY],
    ['موجود في رصد فقط', s.candidates, 'مصنف', s.classified, 'صفر الكميات', s.zero],
    ['له كميات وغير مصنف', s.unclassified, 'تعارضات معلقة', s.pending, 'باتشات غير صالحة', s.invalid],
    ['صفوف رصد غير صالحة المعرّف', s.invalidRasdRows, 'صفوف مستودع غير صالحة', s.invalidWarehouseRows],
    ['المطابقة', 'رقم الباتش فقط بعد حذف الفراغات الطرفية وتوحيد حالة الأحرف'],
    ['الفرز', 'كمية الترتيب تنازليًا ثم مفتاح الباتش تصاعديًا كنص. البحث في الواجهة لا يغيّر التقرير.'],
    ['تحقق الاكتمال', `${s.candidates} = ${s.classified} + ${s.zero} + ${s.unclassified} + ${s.pending} + ${s.invalid}`],
  ]
  const mainHeaders = ['رقم الباتش الأصلي', 'اسم المنتج', 'GTIN', 'Quantity المعتمدة', 'Active المعتمدة', 'الإرسال المعلق المعتمد', 'الاستقبال المعلق المعتمد', 'كمية الترتيب', 'عدد الصفوف الأصلية', 'صف Excel المعتمد', 'سبب الاعتماد', 'مطابقة الحقن', ...table.headers.map(header => `رصد: ${header}`)]
  const identifierIndices = new Set([mapping.batch, mapping.gtin].filter((value): value is number => value !== undefined))
  for (const group of GROUPS) {
    const batches = result.groups[group.id]
    const totals = summarize(batches)
    const rows: (string | number)[][] = [
      [`إدارة رصد — ${group.label}`], ...audit,
      ['عدد الباتشات', totals.count, 'مجموع Active', totals.active, 'مجموع الإرسال', totals.sent, 'مجموع الاستقبال', totals.received],
      ['الكميات المعتمدة — صف واحد لكل باتش؛ تفاصيل الصفوف الأصلية أدناه لا تدخل في المجاميع'],
      mainHeaders,
    ]
    const mainHeaderIndex = rows.length - 1
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    let cursor = rows.length
    for (const batch of batches) {
      const values: (string | number | XLSX.CellObject)[] = [
        { t: 's', v: batch.batch, z: '@' }, batch.product, { t: 's', v: batch.gtin, z: '@' },
        batch.quantity, batch.active, batch.sent, batch.received, batch.sortQuantity,
        batch.originalCount, batch.selectedRow, batch.selectionReason, batch.injectionMatch,
      ]
      const original = batch.originals.find(row => row.rowNumber === batch.selectedRow)!
      values.push(...original.cells.map((cell, index) => exportCell(cell, identifierIndices.has(index))))
      XLSX.utils.sheet_add_aoa(sheet, [values], { origin: { r: cursor++, c: 0 } })
    }
    sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ r: mainHeaderIndex, c: 0 }, { r: Math.max(cursor - 1, mainHeaderIndex), c: mainHeaders.length - 1 }) }
    // SheetJS CE does not reliably export frozen panes; do not claim otherwise.
    cursor += 2
    XLSX.utils.sheet_add_aoa(sheet, [
      ['تفاصيل رصد الأصلية — لا تجمع هذا الجدول مع الكميات المعتمدة أعلاه'],
      ['مفتاح الباتش', 'رقم صف Excel', 'الصف المعتمد؟', ...table.headers],
    ], { origin: { r: cursor, c: 0 } })
    cursor += 2
    for (const batch of batches) {
      for (const original of batch.originals) {
        const values: (string | number | XLSX.CellObject)[] = [batch.key, original.rowNumber, original.rowNumber === batch.selectedRow ? 'نعم' : 'لا', ...original.cells.map((cell, index) => exportCell(cell, identifierIndices.has(index)))]
        XLSX.utils.sheet_add_aoa(sheet, [values], { origin: { r: cursor++, c: 0 } })
      }
    }
    if (group.id === 'injections') {
      cursor += 2
      XLSX.utils.sheet_add_aoa(sheet, [['الباتشات المستبعدة وغير المصنفة'], ['رقم الباتش', 'السبب', 'صفوف المصدر']], { origin: { r: cursor, c: 0 } })
      cursor += 2
      for (const entry of [...result.zero, ...result.unclassified]) {
        XLSX.utils.sheet_add_aoa(sheet, [[entry.batch, entry.reason, entry.rows.join(', ')]], { origin: { r: cursor++, c: 0 } })
      }
      for (const warning of result.warnings) XLSX.utils.sheet_add_aoa(sheet, [['تنبيه', warning]], { origin: { r: cursor++, c: 0 } })
    }
    if (cursor > 1_048_576) throw new Error('تفاصيل إحدى المجموعات تتجاوز حد صفوف Excel.')
    sheet['!cols'] = mainHeaders.map((_, index) => ({ wch: index === 1 ? 38 : index === 10 || index === 11 ? 36 : 22 }))
    XLSX.utils.book_append_sheet(workbook, sheet, group.label)
  }
  return workbook
}

export function exportReport(result: AnalysisResult, table: SourceTable, mapping: Mapping, month: string): ArrayBuffer {
  return XLSX.write(buildReport(result, table, mapping, month), { bookType: 'xlsx', type: 'array', compression: true }) as ArrayBuffer
}
