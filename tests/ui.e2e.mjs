// All fixture rows in this test are synthetic and are never shipped in reports.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { chromium } from 'playwright'
import * as XLSX from 'xlsx'

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
const failures = []
page.on('pageerror', error => failures.push(error.message))
const headers = ['BN', 'Product Name', 'Quantity', 'Active', 'Quantity sent pending', 'Quantity Receive Pending', 'GTIN']
const fixture = (name, rows) => {
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), 'Data')
  return { name, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' })) }
}
const rasd = fixture('synthetic-rasd.xlsx', [headers,
  ['DUP', 'Tablet', 0, 10, 0, 0, '0001'], ['dup ', 'Tablet', 0, 20, 0, 0, '0001'],
  ['INJ', 'Medicine Injection', 9, 0, 8, 0, '0002'],
  ['S', 'Tablet', 0, 0, 3, 0, '0003'], ['R', 'Tablet', 0, 0, 0, 4, '0004'],
  ['B', 'Tablet', 0, 0, 5, 6, '0005'], ['A', 'Tablet', 0, 7, 0, 0, '0006'],
  ['Z', 'Vial', 0, 0, 0, 0, '0007'], ['Q', 'Tablet', 2, 0, 0, 0, '0008'],
  [' M ', 'Tablet', 0, 500, 0, 0, '0009'],
])
const warehouse = fixture('synthetic-warehouse.xlsx', [['Batch No'], ['m'], [' M ']])
try {
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:4173', { waitUntil: 'networkidle' })
  await page.getByRole('heading', { level: 1 }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'بدء التحليل' }).isDisabled(), true)
  await page.getByLabel('اختيار ملف رصد', { exact: true }).setInputFiles(rasd)
  await page.getByText('synthetic-rasd.xlsx', { exact: true }).waitFor()
  await page.getByLabel('اختيار ملف المستودع', { exact: true }).setInputFiles(warehouse)
  await page.getByText('synthetic-warehouse.xlsx', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'بدء التحليل' }).click()
  await page.getByRole('heading', { name: 'مراجعة البيانات قبل التصدير' }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'تنزيل Excel' }).isDisabled(), true)
  await page.getByRole('radio', { name: 'اعتماد الصف 2 للباتش DUP', exact: true }).check()
  await page.getByRole('button', { name: 'تطبيق الاختيارات وإعادة التحليل' }).click()
  await page.getByRole('button', { name: 'تنزيل Excel' }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('تنزيل Excel') && !button.disabled))
  await page.getByRole('tab', { name: /Active فقط/ }).click()
  await page.getByRole('textbox', { name: 'البحث عن باتش' }).fill(' dup ')
  assert.equal(await page.locator('#batch-results tbody tr').count(), 1)
  await page.getByRole('button', { name: /2 · عرض/ }).click()
  await page.getByText('الصف المعتمد:', { exact: false }).waitFor()
  await page.getByLabel('شهر التقرير', { exact: true }).fill('2026-09')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'تنزيل Excel' }).click()
  const download = await downloadPromise
  assert.match(download.suggestedFilename(), /2026-09/)
  const bytes = await fs.readFile(await download.path())
  const report = XLSX.read(bytes, { type: 'buffer' })
  assert.equal(report.SheetNames.length, 5)
  const active = XLSX.utils.sheet_to_json(report.Sheets['Active فقط'], { header: 1 })
  const mainIndex = active.findIndex(row => row[0] === 'رقم الباتش الأصلي')
  assert.equal(active[mainIndex + 1][0], 'DUP')
  assert.equal(active[mainIndex + 1][4], 10)
  assert.equal(active[mainIndex + 2][0], 'A') // Search must not filter exported rows.
  assert.equal(active[mainIndex + 1][2], '0001')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'إعادة تهيئة', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: 'بدء التحليل' }).isDisabled(), true)
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true)
  await page.getByLabel('اختيار ملف رصد', { exact: true }).setInputFiles(fixture('manual.xlsx', [['custom batch', ...headers.slice(1)], ['001', 'Tab', 0, 1, 0, 0, '001']]))
  await page.getByText('manual.xlsx', { exact: true }).waitFor()
  await page.getByLabel('ملف رصد: رقم الباتش', { exact: true }).selectOption('0')
  await page.getByLabel('اختيار ملف المستودع', { exact: true }).setInputFiles(warehouse)
  await page.getByText('synthetic-warehouse.xlsx', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'بدء التحليل' }).click()
  await page.getByRole('heading', { name: 'نتائج التحليل', exact: true }).waitFor()
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.includes('تنزيل Excel') && !button.disabled))
  assert.deepEqual(failures, [])
  console.log('UI PASS: upload, worker, duplicate review, search, full Excel export, mobile, reset, manual mapping; no page errors.')
} finally { await browser.close() }
