import { Fragment, useState } from 'react'
import { GROUPS } from '../config/rules.ts'
import { normalizeBatch, summarize } from '../lib/analysis.ts'
import type { AnalysisResult, Batch, Exclusion, GroupId, SourceRow } from '../types.ts'
import { Button, cellStyle, colors, Icon, inputStyle, number, Pager, panel, SectionTitle } from './ui.tsx'

export function Results({ result, headers, stale }: { result: AnalysisResult; headers: string[]; stale: boolean }) {
  const [group, setGroup] = useState<GroupId>('injections')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<string | null>(null)
  const rows = result.groups[group]
  const filtered = rows.filter(row => normalizeBatch(row.batch).includes(normalizeBatch(query)))
  const summary = summarize(rows)
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 25)))
  const activeGroup = GROUPS.find(entry => entry.id === group)!
  return <section id="results" style={{ ...panel, opacity: stale ? 0.65 : 1 }} aria-label="نتائج التحليل">
    <SectionTitle number="03" title="نتائج التحليل" subtitle={stale ? 'تغير اختيار الصف المعتمد. أعد التحليل لتحديث هذه النتائج.' : 'كل باتش يظهر مرة واحدة. المجاميع تشمل المجموعة كاملة قبل البحث.'} />
    <div role="tablist" aria-label="مجموعات الباتشات" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderBottom: `1px solid ${colors.line}`, paddingBottom: 18 }}>
      {GROUPS.map(entry => <button key={entry.id} id={`tab-${entry.id}`} role="tab" aria-controls="batch-results" aria-selected={group === entry.id} onClick={() => { setGroup(entry.id); setPage(1); setExpanded(null) }} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', border: `1px solid ${group === entry.id ? entry.color : colors.line}`, borderRadius: 9, color: group === entry.id ? entry.color : colors.muted, background: group === entry.id ? entry.background : '#fff', font: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', minHeight: 44 }}>{entry.label}<span style={{ borderRadius: 6, padding: '1px 6px', background: group === entry.id ? '#ffffffaa' : '#f3f6f7' }}>{number(result.groups[entry.id].length)}</span></button>)}
    </div>
    <div id="batch-results" role="tabpanel" aria-labelledby={`tab-${group}`}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBlock: 22 }}>
        {[['الباتشات', summary.count], ['مجموع Active', summary.active], ['الإرسال المعلّق', summary.sent], ['الاستقبال المعلّق', summary.received]].map(([label, value]) => <div key={label} style={{ flex: '1 1 130px', borderInlineStart: `3px solid ${activeGroup.background}`, paddingInlineStart: 12 }}><div style={{ color: colors.muted, fontSize: 12 }}>{label}</div><strong style={{ display: 'block', fontSize: 23, marginTop: 7, fontVariantNumeric: 'tabular-nums' }}>{number(Number(value))}</strong></div>)}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ color: colors.muted, fontSize: 12, margin: 0 }}>{activeGroup.description}</p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '100%', width: 290 }}><Icon name="search" color={colors.muted} size={19} /><input aria-label="البحث عن باتش" placeholder="ابحث برقم الباتش…" value={query} onChange={event => { setQuery(event.target.value); setPage(1) }} style={inputStyle} /></label>
      </div>
      <div style={{ overflowX: 'auto', border: `1px solid ${colors.line}`, borderRadius: 10 }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}><thead style={{ background: '#f8fafb', color: '#76838e' }}><tr>{['الباتش الأصلي', 'المنتج', 'GTIN', 'Quantity', 'Active', 'إرسال معلّق', 'استقبال معلّق', 'كمية الترتيب ↓', 'الصفوف الأصلية'].map(header => <th scope="col" key={header} style={{ ...cellStyle, fontSize: 11, fontWeight: 500 }}>{header}</th>)}</tr></thead>
          <tbody>{filtered.slice((currentPage - 1) * 25, currentPage * 25).map(row => <Fragment key={row.key}><tr><td style={{ ...cellStyle, fontWeight: 700, color: colors.green }}><span dir="ltr" style={{ whiteSpace: 'pre-wrap' }}>{row.batch}</span></td><td style={{ ...cellStyle, whiteSpace: 'normal', minWidth: 170, maxWidth: 280 }}>{row.product || '—'}</td><td dir="ltr" style={cellStyle}>{row.gtin || '—'}</td>{[row.quantity, row.active, row.sent, row.received, row.sortQuantity].map((value, index) => <td key={index} style={{ ...cellStyle, fontVariantNumeric: 'tabular-nums', fontWeight: index === 4 ? 700 : 400 }}>{number(value)}</td>)}<td style={cellStyle}><Button secondary onClick={() => setExpanded(expanded === row.key ? null : row.key)} aria-expanded={expanded === row.key} style={{ fontSize: 11, padding: '5px 10px', minHeight: 36 }}>{row.originalCount} · {expanded === row.key ? 'إخفاء' : 'عرض'}</Button></td></tr>
            {expanded === row.key && <tr><td colSpan={9} style={{ padding: 20, background: '#f8fbfa' }}><OriginalRows batch={row} headers={headers} /></td></tr>}
          </Fragment>)}</tbody>
        </table>
        {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '45px 16px', color: colors.muted }}><Icon name="layers" size={30} /><p style={{ fontSize: 13 }}>{query ? 'لا يوجد باتش مطابق داخل هذه المجموعة.' : 'لا توجد باتشات في هذه المجموعة.'}</p></div>}
      </div>
      <Pager page={currentPage} total={filtered.length} pageSize={25} onChange={setPage} />
    </div>
  </section>
}

function OriginalRows({ batch, headers }: { batch: Batch; headers: string[] }) {
  const [page, setPage] = useState(1)
  return <div style={{ maxWidth: '100%' }}>
    <p style={{ marginTop: 0, fontSize: 12 }}>الصف المعتمد: <strong>{batch.selectedRow}</strong> — {batch.selectionReason}. {batch.injectionMatch && `مطابقة الحقن: ${batch.injectionMatch}`}</p>
    <SourceRows headers={headers} rows={batch.originals.slice((page - 1) * 10, page * 10)} selected={batch.selectedRow} />
    <Pager page={page} total={batch.originals.length} pageSize={10} onChange={setPage} />
  </div>
}

export function SourceRows({ headers, rows, selected }: { headers: string[]; rows: SourceRow[]; selected?: number }) {
  return <div style={{ overflowX: 'auto', maxWidth: '100%' }}><table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}><thead><tr><th style={cellStyle}>صف Excel</th>{headers.map((header, index) => <th key={index} style={cellStyle}>{header}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.rowNumber} style={{ background: row.rowNumber === selected ? '#edf7f1' : '#fff' }}><td style={cellStyle}>{row.rowNumber}{row.rowNumber === selected && ' ✓'}</td>{row.cells.map((cell, index) => <td key={index} style={cellStyle}>{cell.display || '—'}</td>)}</tr>)}</tbody></table></div>
}

export function Audit({ result }: { result: AnalysisResult }) {
  const [page, setPage] = useState(1)
  const entries: Exclusion[] = [...result.invalid, ...result.unclassified, ...result.zero]
  const s = result.stats
  return <section id="audit" style={panel}>
    <SectionTitle title="الاستبعادات وجودة البيانات" subtitle="لا تختفي الباتشات دون سبب. أعداد الصفوف منفصلة عن أعداد الباتشات." />
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>{[
      ['موجود في المستودع', s.matched], ['صفر الكميات الأربع', s.zero], ['له كميات وغير مصنف', s.unclassified], ['تكرارات معلقة', s.pending], ['باتشات بها أخطاء', s.invalid],
    ].map(([label, value]) => <div key={label} style={{ flex: '1 1 145px', padding: 14, border: `1px solid ${colors.line}`, borderRadius: 10 }}><span style={{ fontSize: 11, color: colors.muted }}>{label}</span><strong style={{ display: 'block', fontSize: 22, marginTop: 6 }}>{number(Number(value))}</strong></div>)}</div>
    <p style={{ background: '#f1f7f4', padding: 12, borderRadius: 8, fontSize: 12, lineHeight: 1.9 }}>تحقق الاكتمال: {number(s.candidates)} باتش في رصد فقط = {number(s.classified)} مصنف + {number(s.zero)} صفر الكميات + {number(s.unclassified)} غير مصنف + {number(s.pending)} معلق + {number(s.invalid)} به أخطاء.</p>
    <p style={{ fontSize: 12, color: colors.muted, lineHeight: 1.9 }}>صفوف رصد: {number(s.rasdRows)} · باتشات فريدة صالحة: {number(s.rasdUnique)} · صفوف معرّفات غير صالحة: {number(s.invalidRasdRows)}<br />صفوف المستودع: {number(s.warehouseRows)} · باتشات فريدة صالحة: {number(s.warehouseUnique)} · صفوف معرّفات غير صالحة: {number(s.invalidWarehouseRows)} · باتشات في المستودع فقط: {number(s.warehouseOnly)}</p>
    {result.warnings.map(warning => <p key={warning} style={{ fontSize: 12, padding: 12, background: '#fff9ec', color: '#956321', borderRadius: 8 }}>{warning}</p>)}
    {entries.length > 0 && <details><summary style={{ cursor: 'pointer', fontSize: 13, padding: '10px 0' }}>تفاصيل الباتشات المستبعدة وغير المصنفة ({number(entries.length)})</summary><div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr>{['الباتش', 'سبب الاستبعاد', 'صفوف Excel'].map(label => <th key={label} style={cellStyle}>{label}</th>)}</tr></thead><tbody>{entries.slice((page - 1) * 20, page * 20).map(entry => <tr key={entry.key}><td dir="ltr" style={cellStyle}>{entry.batch}</td><td style={{ ...cellStyle, whiteSpace: 'normal' }}>{entry.reason}</td><td style={cellStyle}>{entry.rows.join(', ')}</td></tr>)}</tbody></table></div><Pager total={entries.length} page={page} pageSize={20} onChange={setPage} /></details>}
  </section>
}
