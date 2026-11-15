import { MAX_FILE_BYTES } from '../config/rules.ts'
import { analyzeTables } from '../lib/analysis.ts'
import { exportReport, extractTable, inspectWorkbook, readWorkbook } from '../lib/excel.ts'
import type { AnalysisResult, Mapping, Slot, SourceTable, WorkerReply, WorkerRequest } from '../types.ts'

const files = new Map<Slot, { filename: string; workbook: ReturnType<typeof readWorkbook> }>()
let last: { result: AnalysisResult; table: SourceTable; mapping: Mapping } | null = null
const post = (reply: WorkerReply, transfer: Transferable[] = []): void => self.postMessage(reply, { transfer })

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  const progress = (message: string): void => post({ id: request.id, kind: 'progress', message })
  try {
    if (request.kind !== 'export') last = null
    if (request.kind === 'load') {
      if (!/\.(xlsx|xls)$/i.test(request.file.name)) throw new Error('اختر ملفًا بامتداد .xlsx أو .xls.')
      if (request.file.size > MAX_FILE_BYTES) throw new Error('حجم الملف يتجاوز 100 ميجابايت. قسّم الملف قبل رفعه.')
      if (request.file.size === 0) throw new Error('الملف فارغ.')
      files.delete(request.slot)
      progress('قراءة ملف Excel محليًا…')
      const workbook = readWorkbook(await request.file.arrayBuffer())
      const name = workbook.SheetNames.find(sheetName => Boolean(workbook.Sheets[sheetName]?.['!ref']))
      if (!name) throw new Error('جميع أوراق العمل فارغة.')
      files.set(request.slot, { filename: request.file.name, workbook })
      const inspection = inspectWorkbook(workbook, request.file.name, request.slot, name)
      post({ id: request.id, kind: 'inspection', slot: request.slot, data: inspection })
    } else if (request.kind === 'inspect') {
      const file = files.get(request.slot)
      if (!file) throw new Error('ارفع الملف أولًا.')
      progress('قراءة العناوين ومعاينة البيانات…')
      post({ id: request.id, kind: 'inspection', slot: request.slot, data: inspectWorkbook(file.workbook, file.filename, request.slot, request.sheetName, request.headerRow) })
    } else if (request.kind === 'analyze') {
      const rasd = files.get('rasd'), warehouse = files.get('warehouse')
      if (!rasd || !warehouse) throw new Error('ارفع ملف رصد وملف المستودع أولًا.')
      progress('التحقق من البيانات والمطابقة والتصنيف…')
      const r = request.options.rasd, w = request.options.warehouse
      const table = extractTable(rasd.workbook, rasd.filename, r.sheetName, r.headerRow)
      const other = extractTable(warehouse.workbook, warehouse.filename, w.sheetName, w.headerRow)
      const result = analyzeTables(table, other, r.mapping, w.mapping, request.options.resolutions)
      last = { result, table, mapping: r.mapping }
      post({ id: request.id, kind: 'analysis', data: result })
    } else {
      if (!last) throw new Error('أعد التحليل قبل تنزيل التقرير.')
      progress('إنشاء صفحات التقرير الخمس…')
      const data = exportReport(last.result, last.table, last.mapping, request.month)
      post({ id: request.id, kind: 'export', data }, [data])
    }
  } catch (error) {
    post({ id: request.id, kind: 'error', message: error instanceof Error ? error.message : 'حدث خطأ غير متوقع أثناء المعالجة.' })
  }
}
