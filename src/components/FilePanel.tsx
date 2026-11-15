import { useId, useState } from 'react'
import { FIELD_LABELS, RASD_FIELDS, WAREHOUSE_FIELDS } from '../config/rules.ts'
import { validateMapping } from '../lib/analysis.ts'
import type { Inspection, Mapping, Slot } from '../types.ts'
import { Button, colors, Icon, inputStyle, number } from './ui.tsx'

interface Props {
  slot: Slot
  inspection: Inspection | null
  disabled: boolean
  onLoad: (file: File) => void
  onInspect: (sheet: string, headerRow?: number) => void
  onMapping: (mapping: Mapping) => void
}
export function FilePanel({ slot, inspection, disabled, onLoad, onInspect, onMapping }: Props) {
  const id = useId()
  const [dragging, setDragging] = useState(false)
  const isRasd = slot === 'rasd'
  const fields = isRasd ? RASD_FIELDS : WAREHOUSE_FIELDS
  const errors = inspection ? validateMapping(inspection.headers, inspection.mapping, slot) : []
  const label = isRasd ? 'ملف رصد' : 'ملف المستودع'
  return <div style={{ flex: '1 1 300px', minWidth: 0, border: `1px solid ${colors.line}`, borderRadius: 13, padding: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 38, height: 38, borderRadius: 10, background: isRasd ? '#e9f6ee' : '#eaf2fc', color: isRasd ? '#218567' : '#5287b6', display: 'grid', placeItems: 'center' }}><Icon name="file" size={20} /></span><div><h3 style={{ margin: 0, fontSize: 15 }}>{label}</h3><small style={{ color: colors.muted }}>{isRasd ? 'مصدر البيانات الأساسية' : 'مرجع مطابقة الباتشات'}</small></div></div>
      {inspection && <span style={{ fontSize: 11, color: errors.length ? '#a7681f' : '#218567', background: errors.length ? '#fff5e5' : '#edf8f0', padding: '4px 8px', borderRadius: 20 }}>{errors.length ? 'اربط الأعمدة' : 'جاهز'}</span>}
    </div>
    <label htmlFor={id} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file && !disabled) onLoad(file) }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 160, padding: 16, boxSizing: 'border-box', border: `1.5px dashed ${dragging ? '#27886b' : '#ccd9d5'}`, background: dragging ? '#e8f6ee' : '#fafcfb', borderRadius: 10, cursor: disabled ? 'wait' : 'pointer', textAlign: 'center' }}>
      <Icon name={inspection ? 'check' : 'upload'} color="#538a77" size={27} />
      <span style={{ fontSize: 13, fontWeight: 700, maxWidth: '100%', overflowWrap: 'anywhere' }}>{inspection ? inspection.filename : 'اسحب ملف Excel هنا أو اختره'}</span>
      <span style={{ color: colors.muted, fontSize: 11 }}>{inspection ? `${number(inspection.rowCount)} صف بيانات · اضغط لتغيير الملف` : 'XLSX أو XLS · حتى 100 ميجابايت'}</span>
      <input id={id} type="file" accept=".xlsx,.xls" aria-label={`اختيار ${label}`} disabled={disabled} style={{ maxWidth: '100%', fontSize: 12 }} onChange={event => { const file = event.target.files?.[0]; if (file) onLoad(file); event.target.value = '' }} />
    </label>
    {inspection && <div style={{ marginTop: 16 }}>
      <label htmlFor={`${id}-sheet`} style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>ورقة العمل</label>
      <select id={`${id}-sheet`} disabled={disabled} value={inspection.sheetName} style={inputStyle} onChange={event => onInspect(event.target.value)}>{inspection.sheets.map(name => <option key={name}>{name}</option>)}</select>
      <form key={`${inspection.sheetName}-${inspection.headerRow}`} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onInspect(inspection.sheetName, Number(data.get('headerRow'))) }} style={{ display: 'flex', alignItems: 'end', gap: 8, marginTop: 12 }}>
        <div style={{ flex: 1 }}><label htmlFor={`${id}-header`} style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>رقم صف العناوين في Excel</label><input id={`${id}-header`} name="headerRow" type="number" min={1} max={inspection.maxRow} defaultValue={inspection.headerRow} required disabled={disabled} style={inputStyle} /></div><Button secondary type="submit" disabled={disabled} style={{ fontSize: 12, padding: '11px 14px' }}>تطبيق</Button>
      </form>
      <details open={errors.length > 0} style={{ marginTop: 16, fontSize: 13 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, paddingBlock: 8 }}>ربط الأعمدة ومعاينة البيانات</summary>
        {inspection.duplicateHeaders.length > 0 && <p style={{ color: '#9d671e', fontSize: 12 }}>عناوين مكررة: {inspection.duplicateHeaders.join('، ')}. اختر العمود الصحيح حسب حرفه ومعاينته.</p>}
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>{fields.map(field => <label key={field} style={{ fontSize: 12, display: 'grid', gap: 5 }}>
          {FIELD_LABELS[field]}
          <select aria-label={`${label}: ${FIELD_LABELS[field]}`} disabled={disabled} style={inputStyle} value={inspection.mapping[field] ?? ''} onChange={event => { const mapping = { ...inspection.mapping }; if (event.target.value === '') delete mapping[field]; else mapping[field] = Number(event.target.value); onMapping(mapping) }}>
            <option value="">{field === 'gtin' ? 'غير موجود / لا تستخدمه' : 'اختر العمود'}</option>
            {inspection.headers.map((header, index) => <option key={index} value={index}>{columnName(index)} — {header}</option>)}
          </select>
          {inspection.mapping[field] !== undefined && <span style={{ color: colors.muted, overflowWrap: 'anywhere' }}>معاينة: {inspection.preview.map(row => row[inspection.mapping[field]!] || 'فارغ').join(' / ')}</span>}
        </label>)}</div>
        {errors.length > 0 && <ul style={{ paddingInlineStart: 20, color: '#a85a34', lineHeight: 1.8 }}>{errors.map(error => <li key={error}>{error}</li>)}</ul>}
      </details>
    </div>}
  </div>
}

function columnName(index: number): string {
  let result = '', value = index + 1
  while (value > 0) { value--; result = String.fromCharCode(65 + value % 26) + result; value = Math.floor(value / 26) }
  return result
}
