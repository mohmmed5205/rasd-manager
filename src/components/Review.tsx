import { useState } from 'react'
import type { AnalysisResult, Conflict } from '../types.ts'
import { SourceRows } from './Results.tsx'
import { Button, cellStyle, colors, number, Pager, panel, SectionTitle } from './ui.tsx'

export function Review({ result, resolutions, onChoose, onApply, disabled, headers }: {
  result: AnalysisResult; resolutions: Record<string, number>; onChoose: (key: string, row: number) => void
  onApply: () => void; disabled: boolean; headers: string[]
}) {
  const [page, setPage] = useState(1)
  const [issuePage, setIssuePage] = useState(1)
  if (!result.conflicts.length && !result.issues.length) return null
  return <section style={{ ...panel, borderColor: '#eadac2' }} id="review">
    <SectionTitle title="مراجعة البيانات قبل التصدير" subtitle="النتائج مؤقتة حتى معالجة أخطاء المصدر واعتماد كميات الباتشات المكررة." />
    {result.issues.length > 0 && <div style={{ marginBottom: 24 }}>
      <p style={{ fontSize: 13, color: '#a45d3d' }}>يوجد {number(result.issues.length)} خطأ. صحح الخلايا التالية في نسخة من الملف وأعد رفعها. أخطاء معرّفات المستودع تمنع الوثوق بنتيجة المطابقة.</p>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['المصدر', 'صف Excel', 'الباتش', 'المشكلة'].map(label => <th key={label} style={cellStyle}>{label}</th>)}</tr></thead><tbody>{result.issues.slice((issuePage - 1) * 20, issuePage * 20).map((issue, index) => <tr key={index}><td style={cellStyle}>{issue.source === 'rasd' ? 'رصد' : 'المستودع'}</td><td style={cellStyle}>{issue.row}</td><td dir="ltr" style={cellStyle}>{issue.batch || 'فارغ'}</td><td style={{ ...cellStyle, whiteSpace: 'normal', minWidth: 210 }}>{issue.reason}</td></tr>)}</tbody></table></div>
      <Pager total={result.issues.length} page={issuePage} pageSize={20} onChange={setIssuePage} />
    </div>}
    {result.conflicts.length > 0 && <>
      <p style={{ fontSize: 13 }}>اختر صفًا معتمدًا لكل باتش. لن نستخدم الجمع أو أكبر كمية تلقائيًا.</p>
      {result.conflicts.slice((page - 1) * 5, page * 5).map(conflict => <ConflictCard key={conflict.key} conflict={conflict} selected={resolutions[conflict.key]} onChoose={row => onChoose(conflict.key, row)} disabled={disabled} headers={headers} />)}
      <Pager total={result.conflicts.length} page={page} pageSize={5} onChange={setPage} />
      <Button onClick={onApply} disabled={disabled} style={{ marginTop: 16 }}>تطبيق الاختيارات وإعادة التحليل</Button>
    </>}
  </section>
}

function ConflictCard({ conflict, selected, onChoose, disabled, headers }: { conflict: Conflict; selected?: number; onChoose: (row: number) => void; disabled: boolean; headers: string[] }) {
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(false)
  return <fieldset style={{ border: `1px solid ${colors.line}`, borderRadius: 10, margin: '20px 0 0', padding: 14, minWidth: 0 }}>
    <legend style={{ fontSize: 13, fontWeight: 700, paddingInline: 8 }}><span dir="ltr">{conflict.batch}</span> — {number(conflict.rows.length)} صفوف مختلفة الكميات</legend>
    <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['اعتماد', 'صف Excel', 'المنتج', 'GTIN', 'Quantity', 'Active', 'إرسال', 'استقبال'].map(label => <th key={label} style={cellStyle}>{label}</th>)}</tr></thead><tbody>{conflict.rows.slice((page - 1) * 10, page * 10).map(row => <tr key={row.source.rowNumber} style={{ background: selected === row.source.rowNumber ? '#edf7f1' : '#fff' }}><td style={cellStyle}><input type="radio" name={`conflict-${conflict.key}`} aria-label={`اعتماد الصف ${row.source.rowNumber} للباتش ${conflict.batch}`} checked={selected === row.source.rowNumber} disabled={disabled} onChange={() => onChoose(row.source.rowNumber)} style={{ width: 20, height: 20, accentColor: colors.green }} /></td><td style={cellStyle}>{row.source.rowNumber}</td><td style={cellStyle}>{row.product}</td><td style={cellStyle}>{row.gtin}</td>{[row.quantity, row.active, row.sent, row.received].map((value, index) => <td key={index} style={cellStyle}>{number(value)}</td>)}</tr>)}</tbody></table></div>
    <Pager total={conflict.rows.length} page={page} pageSize={10} onChange={setPage} />
    <Button secondary onClick={() => setExpanded(!expanded)} aria-expanded={expanded} style={{ fontSize: 11, marginTop: 12, padding: '6px 12px', minHeight: 36 }}>{expanded ? 'إخفاء' : 'عرض'} بيانات الصفوف الأصلية في هذه الصفحة</Button>
    {expanded && <SourceRows headers={headers} selected={selected} rows={conflict.rows.slice((page - 1) * 10, page * 10).map(row => row.source)} />}
  </fieldset>
}
