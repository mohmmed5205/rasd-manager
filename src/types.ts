export type Slot = 'rasd' | 'warehouse'
export type Field = 'batch' | 'product' | 'quantity' | 'active' | 'sent' | 'received' | 'gtin'
export type Mapping = Partial<Record<Field, number>>
export type GroupId = 'injections' | 'sent' | 'received' | 'both' | 'active'
export type CellValue = string | number | boolean | null
export interface SourceCell {
  value: CellValue
  type: 's' | 'n' | 'b' | 'e' | 'z'
  display: string
  format?: string
}
export interface SourceRow { rowNumber: number; cells: SourceCell[] }
export interface SourceTable {
  filename: string
  sheetName: string
  headers: string[]
  rows: SourceRow[]
  date1904: boolean
}
export interface Inspection {
  filename: string
  sheets: string[]
  sheetName: string
  headerRow: number
  maxRow: number
  rowCount: number
  headers: string[]
  preview: string[][]
  mapping: Mapping
  duplicateHeaders: string[]
}
export interface Quantities { quantity: number; active: number; sent: number; received: number }
export interface ParsedRow extends Quantities {
  key: string
  batch: string
  product: string
  gtin: string
  source: SourceRow
}
export interface Issue { source: Slot; row: number; reason: string; batch: string }
export interface Conflict { key: string; batch: string; rows: ParsedRow[] }
export interface Batch extends Quantities {
  key: string
  batch: string
  product: string
  gtin: string
  originalCount: number
  originals: SourceRow[]
  selectedRow: number
  selectionReason: string
  injectionMatch: string
  group: GroupId
  sortQuantity: number
}
export interface Exclusion { key: string; batch: string; reason: string; rows: number[] }
export interface Statistics {
  rasdRows: number; warehouseRows: number
  rasdUnique: number; warehouseUnique: number
  matched: number; warehouseOnly: number; candidates: number
  zero: number; unclassified: number; pending: number; invalid: number; classified: number
  invalidRasdRows: number; invalidWarehouseRows: number
}
export interface AnalysisResult {
  groups: Record<GroupId, Batch[]>
  conflicts: Conflict[]
  issues: Issue[]
  warnings: string[]
  zero: Exclusion[]
  unclassified: Exclusion[]
  invalid: Exclusion[]
  stats: Statistics
  blocked: boolean
}
export interface SourceSelection { sheetName: string; headerRow: number; mapping: Mapping }
export interface AnalysisOptions {
  rasd: SourceSelection
  warehouse: SourceSelection
  resolutions: Record<string, number>
}
export type WorkerRequest =
  | { id: number; kind: 'load'; slot: Slot; file: File }
  | { id: number; kind: 'inspect'; slot: Slot; sheetName: string; headerRow?: number }
  | { id: number; kind: 'analyze'; options: AnalysisOptions }
  | { id: number; kind: 'export'; month: string }
export type WorkerReply =
  | { id: number; kind: 'inspection'; slot: Slot; data: Inspection }
  | { id: number; kind: 'analysis'; data: AnalysisResult }
  | { id: number; kind: 'export'; data: ArrayBuffer }
  | { id: number; kind: 'progress'; message: string }
  | { id: number; kind: 'error'; message: string }
