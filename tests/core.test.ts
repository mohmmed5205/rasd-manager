import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeTables, classifyBatch, detectInjection, detectMapping, normalizeBatch, parseQuantity, readIdentifier, reportFilename, summarize, validateMapping, validateMonth } from '../src/lib/analysis.ts'
import { cell, mapping, table, warehouseMapping } from './fixtures.ts'
import type { CellValue } from '../src/types.ts'

const analyze = (rows: CellValue[][], other: CellValue[][] = [], resolutions: Record<string, number> = {}) => analyzeTables(table(rows), table(other, true), mapping, warehouseMapping, resolutions)

test('trim and case normalization only; internal spaces and zeros remain meaningful', () => {
  assert.equal(normalizeBatch('  ab-001  '), 'AB-001')
  assert.notEqual(normalizeBatch('AB 001'), normalizeBatch('AB001'))
  assert.notEqual(normalizeBatch('001'), normalizeBatch('1'))
})
test('match independent of order, warehouse duplicates count once', () => {
  const result = analyze([[' a ', 'Tablet', 0, 1, 0, 0], ['b', 'Tablet', 0, 4, 0, 0]], [['A'], ['a'], ['c']])
  assert.equal(result.stats.matched, 1)
  assert.equal(result.stats.warehouseUnique, 2)
  assert.equal(result.stats.warehouseOnly, 1)
  assert.deepEqual(result.groups.active.map(row => row.key), ['B'])
})
test('identical operational quantities count once; original descriptions are retained', () => {
  const result = analyze([['b', 'Tablet A', 5, 10, 0, 0, '001'], [' B ', 'Tablet B', 5, 10, 0, 0, '001']])
  assert.equal(result.groups.active[0]!.originalCount, 2)
  assert.equal(result.groups.active[0]!.originals.length, 2)
  assert.equal(summarize(result.groups.active).active, 10)
})
test('different quantities require explicit selection; no automatic maximum or sum', () => {
  const rows = [['b', 'Tablet', 0, 10, 0, 0], ['b', 'Tablet', 0, 20, 0, 0]]
  const result = analyze(rows)
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.stats.classified, 0)
  assert.equal(result.blocked, true)
  const resolved = analyze(rows, [], { B: 2 })
  assert.equal(resolved.blocked, false)
  assert.equal(resolved.groups.active[0]!.active, 10)
  assert.equal(resolved.groups.active[0]!.selectedRow, 2)
})
test('invalid or stale resolution cannot silently choose a row', () => {
  const result = analyze([['x', 'Tab', 0, 2, 0, 0], ['x', 'Tab', 0, 8, 0, 0]], [], { X: 900 })
  assert.equal(result.conflicts.length, 1)
})
test('all four quantities zero excluded before injection priority', () => {
  const result = analyze([['x', 'Vial', 0, 0, 0, 0]])
  assert.equal(result.stats.zero, 1)
  assert.equal(result.groups.injections.length, 0)
})
test('injection priority overrides sent; all source product names inspected', () => {
  const result = analyze([['x', 'Tablet', 0, 0, 9, 0], ['x', 'Medicine INJ.', 0, 0, 9, 0]])
  assert.equal(result.groups.injections.length, 1)
  assert.equal(result.groups.sent.length, 0)
  assert.match(result.groups.injections[0]!.injectionMatch, /inj/i)
})
test('injection boundaries and Arabic labels', () => {
  assert.ok(detectInjection(['أمبولات للحقن']))
  assert.ok(detectInjection(['Medicine / SYRINGE 5ml']))
  assert.equal(detectInjection(['Injustice tablets']), '')
  assert.equal(detectInjection(['Ampoulette']), '')
})
test('each non-injection operational state maps to exactly one group', () => {
  const result = analyze([
    ['s', 'Tab', 0, 0, 2, 0], ['r', 'Tab', 0, 0, 0, 3],
    ['b', 'Tab', 0, 10, 4, 5], ['a', 'Tab', 0, 6, 0, 0],
  ])
  assert.equal(result.groups.sent.length, 1)
  assert.equal(result.groups.received.length, 1)
  assert.equal(result.groups.both.length, 1)
  assert.equal(result.groups.active.length, 1)
  assert.equal(result.groups.both[0]!.sortQuantity, 9)
})
test('Quantity-only and unmatched negative states remain explained', () => {
  const result = analyze([['q', 'Tab', 9, 0, 0, 0], ['n', 'Tab', 0, 0, -2, 0]])
  assert.equal(result.stats.unclassified, 2)
  assert.ok(result.warnings.some(warning => warning.includes('سالبة')))
})
test('negative injection quantities use literal maximum; nonzero remains included', () => {
  const result = analyze([['x', 'Vial', -9, -2, -3, -4]])
  assert.equal(result.groups.injections[0]!.sortQuantity, -2)
})
test('sort descending then normalized key lexically; stable under row shuffle', () => {
  const rows = [['z', 'Tab', 0, 9, 0, 0], ['a', 'Tab', 0, 9, 0, 0], ['c', 'Tab', 0, 12, 0, 0]]
  assert.deepEqual(analyze(rows).groups.active.map(row => row.key), ['C', 'A', 'Z'])
  assert.deepEqual(analyze([...rows].reverse()).groups.active.map(row => row.key), ['C', 'A', 'Z'])
})
test('injection rank uses maximum of four columns', () => {
  const result = analyze([['x', 'Vial', 99, 2, 3, 4]])
  assert.equal(result.groups.injections[0]!.sortQuantity, 99)
})
test('blanks are zero, valid text quantities converted including Arabic digits', () => {
  assert.equal(parseQuantity(undefined), 0)
  assert.equal(parseQuantity(cell(null)), 0)
  assert.equal(parseQuantity(cell('  ')), 0)
  assert.equal(parseQuantity(cell('1,234.5')), 1234.5)
  assert.equal(parseQuantity(cell('١٬٢٣٤٫٥')), 1234.5)
  assert.equal(parseQuantity(cell('−3')), -3)
  assert.equal(parseQuantity(cell('.5')), 0.5)
})
test('invalid quantities are not changed into zero', () => {
  for (const value of ['pending', '1,5', '1 234', 'NaN', '12mg', true, Infinity]) assert.throws(() => parseQuantity(cell(value)))
  assert.throws(() => parseQuantity({ type: 'e', value: null, display: 'صيغة بلا نتيجة' }))
})
test('one invalid row blocks the whole batch; other batches still visible', () => {
  const result = analyze([['x', 'Tab', 0, 4, 0, 0], ['x', 'Tab', 0, 'bad', 0, 0], ['y', 'Tab', 0, 3, 0, 0]])
  assert.equal(result.stats.invalid, 1)
  assert.equal(result.groups.active.length, 1)
  assert.equal(result.issues[0]!.row, 3)
  assert.equal(result.blocked, true)
})
test('invalid warehouse batch prevents export because matches are uncertain', () => {
  const result = analyze([['x', 'Tab', 0, 4, 0, 0]], [[null]])
  assert.equal(result.stats.invalidWarehouseRows, 1)
  assert.equal(result.blocked, true)
})
test('blank batch rows are counted as rows, not one shared batch', () => {
  const result = analyze([['', 'Tab', 0, 4, 0, 0], [' ', 'Tab', 0, 2, 0, 0]])
  assert.equal(result.stats.invalidRasdRows, 2)
  assert.equal(result.stats.rasdUnique, 0)
})
test('identifier text remains exact; zero-padded numeric format honored', () => {
  assert.equal(readIdentifier(cell(' 00123 ')), ' 00123 ')
  assert.equal(readIdentifier({ type: 'n', value: 123, display: '00123', format: '00000' }), '00123')
  assert.equal(readIdentifier({ type: 'n', value: 123000, display: '1.23E+05' }), '123000')
  assert.throws(() => readIdentifier(cell(9007199254740992)))
  assert.throws(() => readIdentifier(cell(1.2)))
})
test('GTIN with zeros retained; unsafe GTIN blocks export', () => {
  const good = analyze([['x', 'Tab', 0, 4, 0, 0, '00000123456789']])
  assert.equal(good.groups.active[0]!.gtin, '00000123456789')
  const bad = analyze([['x', 'Tab', 0, 4, 0, 0, 9007199254740992]])
  assert.equal(bad.blocked, true)
})
test('header normalization, ambiguous aliases and manual mapping validation', () => {
  assert.equal(detectMapping([' BN ', 'Active', 'Quantity  sent  pending'], 'rasd').batch, 0)
  assert.equal(detectMapping(['BN', 'bn'], 'rasd').batch, undefined)
  assert.ok(validateMapping(['BN'], {}, 'rasd').length > 0)
  assert.ok(validateMapping(['BN'], { batch: 0, product: 0 }, 'rasd').some(message => message.includes('أكثر')))
})
test('candidate reconciliation accounts for every unique batch', () => {
  const result = analyze([
    ['z', 'Tab', 0, 0, 0, 0], ['q', 'Tab', 3, 0, 0, 0],
    ['a', 'Tab', 0, 4, 0, 0], ['c', 'Tab', 0, 1, 0, 0], ['c', 'Tab', 0, 2, 0, 0],
    ['i', 'Tab', 0, 'bad', 0, 0], ['m', 'Tab', 0, 3, 0, 0],
  ], [['m']])
  const s = result.stats
  assert.equal(s.candidates, s.classified + s.zero + s.unclassified + s.pending + s.invalid)
  assert.equal(s.candidates, 5)
  assert.equal(s.matched, 1)
})
test('safe quantity totals; all-zero classification never becomes injection', () => {
  assert.equal(classifyBatch({ quantity: 0, active: 0, sent: 0, received: 0 }, true), null)
  assert.throws(() => analyze([['a', 'Tab', 0, Number.MAX_SAFE_INTEGER, 0, 0], ['b', 'Tab', 0, 1, 0, 0]]))
})
test('month and filename are validated independently of analysis', () => {
  assert.equal(validateMonth('2026-09'), true)
  assert.equal(validateMonth('2026-13'), false)
  assert.equal(reportFilename('month/report.xlsx', '2026-09'), 'month-report.xlsx')
  assert.equal(reportFilename('', '2026-09'), 'إدارة-رصد-2026-09.xlsx')
})
test('6000 rows complete without quadratic joins or duplicate summation', () => {
  const rows = Array.from({ length: 6000 }, (_, i) => [`B-${i}`, 'Tablet', 0, i + 1, 0, 0])
  const result = analyze(rows, Array.from({ length: 3000 }, (_, i) => [`b-${i}`]))
  assert.equal(result.stats.matched, 3000)
  assert.equal(result.groups.active.length, 3000)
  assert.equal(result.groups.active[0]!.active, 6000)
})
