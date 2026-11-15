import { ALIASES, FIELD_LABELS, GROUPS, INJECTION_TERMS, RASD_FIELDS, WAREHOUSE_FIELDS } from '../config/rules.ts'
import type { AnalysisResult, Batch, Conflict, Exclusion, Field, GroupId, Issue, Mapping, ParsedRow, Quantities, Slot, SourceCell, SourceRow, SourceTable } from '../types.ts'

export const normalizeBatch = (value: string): string => value.trim().toUpperCase()
export const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/[\s_]+/g, ' ')

export function detectMapping(headers: string[], slot: Slot): Mapping {
  const fields = slot === 'rasd' ? RASD_FIELDS : WAREHOUSE_FIELDS
  const mapping: Mapping = {}
  for (const field of fields) {
    const aliases = ALIASES[field].map(normalizeHeader)
    const matches = headers.flatMap((name, index) => aliases.includes(normalizeHeader(name)) ? [index] : [])
    if (matches.length === 1) mapping[field] = matches[0]
  }
  return mapping
}

export function validateMapping(headers: string[], mapping: Mapping, slot: Slot): string[] {
  const fields = slot === 'rasd' ? RASD_FIELDS : WAREHOUSE_FIELDS
  const errors: string[] = []
  const used = new Set<number>()
  for (const field of fields) {
    const index = mapping[field]
    if (field === 'gtin' && index === undefined) continue
    if (index === undefined || !Number.isInteger(index) || index < 0 || index >= headers.length) {
      errors.push(`اختر عمود «${FIELD_LABELS[field]}» في ملف ${slot === 'rasd' ? 'رصد' : 'المستودع'}.`)
      continue
    }
    if (used.has(index)) errors.push(`العمود «${headers[index]}» مربوط بأكثر من حقل.`)
    used.add(index)
  }
  return errors
}

export function readIdentifier(cell: SourceCell | undefined): string {
  if (cell?.type === 'e') throw new Error(cell.display || 'خطأ في خلية المعرّف')
  if (!cell || cell.value === null || cell.type === 'z') return ''
  if (cell.type === 's') return String(cell.value)
  if (cell.type !== 'n' || typeof cell.value !== 'number' || !Number.isSafeInteger(cell.value) || cell.value < 0) {
    throw new Error('معرّف غير نصي أو رقم فقد دقته. صحح الخلية من المصدر؛ لن نخمن المعرّف.')
  }
  // A displayed zero-pad is meaningful. Scientific notation is not an identifier.
  if (/^\d+$/.test(cell.display.trim())) return cell.display.trim()
  return String(cell.value)
}

function westernDigits(text: string): string {
  return text.replace(/[٠-٩]/g, value => String(value.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, value => String(value.charCodeAt(0) - 0x06f0))
}

export function parseQuantity(cell: SourceCell | undefined): number {
  if (cell?.type === 'e') throw new Error(cell.display || 'خطأ في خلية الكمية')
  if (!cell || cell.value === null || cell.type === 'z') return 0
  if (cell.type === 'b') throw new Error('قيمة كمية غير صالحة')
  if (typeof cell.value === 'number') {
    if (!Number.isFinite(cell.value) || Math.abs(cell.value) > Number.MAX_SAFE_INTEGER) throw new Error('كمية خارج نطاق الدقة الآمن')
    return cell.value
  }
  let text = westernDigits(String(cell.value)).trim()
  if (!text) return 0
  text = text.replace(/−/g, '-').replace(/٫/g, '.').replace(/٬/g, ',')
  // Decimal separator: dot / Arabic decimal separator. Comma is thousands only.
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\.\d+)$/.test(text)) {
    throw new Error(`كمية غير مفهومة: «${String(cell.value)}». استخدم النقطة للعشري والفاصلة للآلاف.`)
  }
  const number = Number(text.replace(/,/g, ''))
  if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) throw new Error('كمية خارج نطاق الدقة الآمن')
  return number
}

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const injectionPatterns = INJECTION_TERMS.map(term => ({ term, pattern: new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped(term)}(?=$|[^\\p{L}\\p{N}])`, 'iu') }))
export function detectInjection(names: string[]): string {
  for (const name of [...names].sort()) {
    const match = injectionPatterns.find(entry => entry.pattern.test(name))
    if (match) return `${match.term}: ${name}`
  }
  return ''
}
export function classifyBatch(q: Quantities, injection: boolean): GroupId | null {
  if (Object.values(q).every(value => value === 0)) return null
  if (injection) return 'injections'
  if (q.sent > 0 && q.received === 0) return 'sent'
  if (q.received > 0 && q.sent === 0) return 'received'
  if (q.sent > 0 && q.received > 0) return 'both'
  if (q.sent === 0 && q.received === 0 && q.active > 0) return 'active'
  return null
}
export function sortQuantity(q: Quantities, group: GroupId): number {
  switch (group) {
    case 'injections': return Math.max(q.quantity, q.active, q.sent, q.received)
    case 'sent': return q.sent
    case 'received': return q.received
    case 'both': return q.sent + q.received
    case 'active': return q.active
  }
}
export const compareKeys = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0
export const sortBatches = (batches: Batch[]): Batch[] => [...batches].sort((a, b) => b.sortQuantity - a.sortQuantity || compareKeys(a.key, b.key))

function safeSum(values: number[]): number {
  let sum = 0
  let compensation = 0
  for (const value of values) {
    const corrected = value - compensation
    const next = sum + corrected
    compensation = (next - sum) - corrected
    sum = next
    if (!Number.isFinite(sum) || Math.abs(sum) > Number.MAX_SAFE_INTEGER) throw new Error('مجموع الكميات يتجاوز نطاق الدقة الآمن.')
  }
  return sum
}
export function summarize(batches: Batch[]): Quantities & { count: number } {
  return {
    count: batches.length,
    quantity: safeSum(batches.map(row => row.quantity)), active: safeSum(batches.map(row => row.active)),
    sent: safeSum(batches.map(row => row.sent)), received: safeSum(batches.map(row => row.received)),
  }
}

function cellAt(row: SourceRow, mapping: Mapping, field: Field): SourceCell | undefined {
  const index = mapping[field]
  return index === undefined ? undefined : row.cells[index]
}
function displayAt(row: SourceRow, mapping: Mapping, field: Field): string {
  return cellAt(row, mapping, field)?.display ?? ''
}

export function analyzeTables(rasd: SourceTable, warehouse: SourceTable, rasdMapping: Mapping, warehouseMapping: Mapping, resolutions: Record<string, number> = {}): AnalysisResult {
  const mappingErrors = [...validateMapping(rasd.headers, rasdMapping, 'rasd'), ...validateMapping(warehouse.headers, warehouseMapping, 'warehouse')]
  if (mappingErrors.length) throw new Error(mappingErrors.join('\n'))
  const issues: Issue[] = []
  const warningSet = new Set<string>()
  const warehouses = new Set<string>()
  let invalidWarehouseRows = 0
  for (const row of warehouse.rows) {
    try {
      const cell = cellAt(row, warehouseMapping, 'batch')
      const batch = readIdentifier(cell)
      if (!normalizeBatch(batch)) throw new Error('رقم الباتش فارغ')
      if (cell?.type === 'n') warningSet.add('بعض معرّفات المستودع مخزنة كأرقام. حُفظ التنسيق الظاهر عند توفره؛ لا يمكن استرجاع أصفار أو دقة فقدها المصدر.')
      warehouses.add(normalizeBatch(batch))
    } catch (error) {
      invalidWarehouseRows++
      issues.push({ source: 'warehouse', row: row.rowNumber, batch: displayAt(row, warehouseMapping, 'batch'), reason: error instanceof Error ? error.message : 'معرّف غير صالح' })
    }
  }
  const buckets = new Map<string, { batch: string; rows: SourceRow[] }>()
  let invalidRasdRows = 0
  for (const row of rasd.rows) {
    try {
      const cell = cellAt(row, rasdMapping, 'batch')
      const batch = readIdentifier(cell)
      const key = normalizeBatch(batch)
      if (!key) throw new Error('رقم الباتش فارغ')
      if (cell?.type === 'n') warningSet.add('بعض معرّفات رصد مخزنة كأرقام. حُفظ التنسيق الظاهر عند توفره؛ لا يمكن استرجاع أصفار أو دقة فقدها المصدر.')
      const bucket = buckets.get(key)
      if (bucket) bucket.rows.push(row)
      else buckets.set(key, { batch, rows: [row] })
    } catch (error) {
      invalidRasdRows++
      issues.push({ source: 'rasd', row: row.rowNumber, batch: displayAt(row, rasdMapping, 'batch'), reason: error instanceof Error ? error.message : 'معرّف غير صالح' })
    }
  }
  const groups: Record<GroupId, Batch[]> = { injections: [], sent: [], received: [], both: [], active: [] }
  const conflicts: Conflict[] = []
  const zero: Exclusion[] = [], unclassified: Exclusion[] = [], invalid: Exclusion[] = []
  let matched = 0, candidates = 0
  for (const [key, bucket] of buckets) {
    if (warehouses.has(key)) { matched++; continue }
    candidates++
    const rows: ParsedRow[] = []
    let hasInvalid = false
    for (const source of bucket.rows) {
      try {
        const batch = readIdentifier(cellAt(source, rasdMapping, 'batch'))
        const gtinCell = cellAt(source, rasdMapping, 'gtin')
        const gtin = readIdentifier(gtinCell)
        if (gtinCell?.type === 'n') warningSet.add('بعض قيم GTIN مخزنة كأرقام. راجع المصدر للتأكد من عدم فقد الأصفار.')
        const quantities = Object.fromEntries((['quantity', 'active', 'sent', 'received'] as const).map(field => {
          try { return [field, parseQuantity(cellAt(source, rasdMapping, field))] }
          catch (error) { throw new Error(`${FIELD_LABELS[field]}: ${error instanceof Error ? error.message : 'كمية غير صالحة'}`) }
        })) as unknown as Quantities
        if (Object.values(quantities).some(value => value < 0)) warningSet.add('توجد كميات سالبة؛ احتُفظ بها وطُبقت شروط التصنيف كما هي.')
        rows.push({ ...quantities, key, batch, gtin, product: displayAt(source, rasdMapping, 'product'), source })
      } catch (error) {
        hasInvalid = true
        issues.push({ source: 'rasd', row: source.rowNumber, batch: bucket.batch, reason: error instanceof Error ? error.message : 'صف غير صالح' })
      }
    }
    const exclusion = (reason: string): Exclusion => ({ key, batch: bucket.batch, reason, rows: bucket.rows.map(row => row.rowNumber) })
    if (hasInvalid) { invalid.push(exclusion('قيم غير صالحة في أحد صفوف الباتش؛ صحح المصدر وأعد رفعه.')); continue }
    const first = rows[0]!
    const differs = rows.some(row => row.quantity !== first.quantity || row.active !== first.active || row.sent !== first.sent || row.received !== first.received)
    const chosen = differs ? rows.find(row => row.source.rowNumber === resolutions[key]) : first
    if (!chosen) { conflicts.push({ key, batch: bucket.batch, rows }); continue }
    const q: Quantities = { quantity: chosen.quantity, active: chosen.active, sent: chosen.sent, received: chosen.received }
    if (Object.values(q).every(value => value === 0)) { zero.push(exclusion('جميع الكميات التشغيلية الأربع صفر.')); continue }
    const injectionMatch = detectInjection(rows.map(row => row.product))
    const group = classifyBatch(q, Boolean(injectionMatch))
    if (!group) { unclassified.push(exclusion('للباتش كميات، لكنها لا تستوفي شروط أي مجموعة.')); continue }
    const rank = sortQuantity(q, group)
    if (!Number.isFinite(rank) || Math.abs(rank) > Number.MAX_SAFE_INTEGER) throw new Error('كمية الترتيب تتجاوز نطاق الدقة الآمن.')
    groups[group].push({ ...q, key, batch: chosen.batch, product: chosen.product, gtin: chosen.gtin,
      originalCount: rows.length, originals: rows.map(row => row.source), selectedRow: chosen.source.rowNumber,
      selectionReason: differs ? 'اختيار المستخدم لصف معتمد' : 'كميات متطابقة؛ احتساب مرة واحدة',
      injectionMatch, group, sortQuantity: rank })
  }
  for (const { id } of GROUPS) { groups[id] = sortBatches(groups[id]); summarize(groups[id]) }
  const classified = Object.values(groups).reduce((total, list) => total + list.length, 0)
  const stats = {
    rasdRows: rasd.rows.length, warehouseRows: warehouse.rows.length,
    rasdUnique: buckets.size, warehouseUnique: warehouses.size,
    matched, warehouseOnly: [...warehouses].filter(key => !buckets.has(key)).length, candidates,
    zero: zero.length, unclassified: unclassified.length, pending: conflicts.length, invalid: invalid.length, classified,
    invalidRasdRows, invalidWarehouseRows,
  }
  if (candidates !== classified + zero.length + unclassified.length + conflicts.length + invalid.length) throw new Error('فشل تحقق اكتمال تصنيف الباتشات.')
  return { groups, conflicts, issues, warnings: [...warningSet], zero, unclassified, invalid, stats,
    blocked: issues.length > 0 || conflicts.length > 0 }
}

export function validateMonth(month: string): boolean { return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) }
export function reportFilename(input: string, month: string): string {
  const cleaned = input.replace(/\.xlsx$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim().slice(0, 140)
  return `${cleaned || `إدارة-رصد-${month}`}.xlsx`
}
