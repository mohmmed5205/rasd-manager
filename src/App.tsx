import { useEffect, useRef, useState } from 'react'
import { DUPLICATE_POLICY, GROUPS } from './config/rules.ts'
import { FilePanel } from './components/FilePanel.tsx'
import { Audit, Results } from './components/Results.tsx'
import { Review } from './components/Review.tsx'
import { Button, colors, Icon, inputStyle, number, panel, SectionTitle } from './components/ui.tsx'
import { useAnalysisWorker } from './hooks/useAnalysisWorker.ts'
import { reportFilename, validateMapping, validateMonth } from './lib/analysis.ts'
import type { AnalysisResult, Inspection, Mapping, Slot, WorkerReply } from './types.ts'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function App() {
  const [sources, setSources] = useState<Record<Slot, Inspection | null>>({ rasd: null, warehouse: null })
  const [month, setMonth] = useState(currentMonth)
  const [filename, setFilename] = useState('')
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, number>>({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const epoch = useRef(0)
  const urls = useRef(new Set<string>())
  const { request, stop } = useAnalysisWorker()
  useEffect(() => () => { for (const url of urls.current) URL.revokeObjectURL(url) }, [])

  const ready = Boolean(sources.rasd && sources.warehouse &&
    !validateMapping(sources.rasd.headers, sources.rasd.mapping, 'rasd').length &&
    !validateMapping(sources.warehouse.headers, sources.warehouse.mapping, 'warehouse').length)

  function invalidate() { setResult(null); setResolutions({}); setDirty(false); setSuccess(''); setError('') }
  async function perform(action: () => Promise<WorkerReply>, onSuccess: (reply: WorkerReply) => void) {
    const generation = epoch.current
    setBusy(true); setError(''); setSuccess(''); setProgress('جارٍ تجهيز المعالجة…')
    try { const reply = await action(); if (epoch.current === generation) onSuccess(reply) }
    catch (caught) { if (epoch.current === generation) setError(caught instanceof Error ? caught.message : 'حدث خطأ أثناء المعالجة.') }
    finally { if (epoch.current === generation) { setBusy(false); setProgress('') } }
  }
  function load(slot: Slot, file: File) {
    invalidate()
    setSources(previous => ({ ...previous, [slot]: null }))
    void perform(() => request({ kind: 'load', slot, file }, setProgress), reply => {
      if (reply.kind === 'inspection') setSources(previous => ({ ...previous, [slot]: reply.data }))
    })
  }
  function inspect(slot: Slot, sheetName: string, headerRow?: number) {
    invalidate()
    void perform(() => request({ kind: 'inspect', slot, sheetName, headerRow }, setProgress), reply => {
      if (reply.kind === 'inspection') setSources(previous => ({ ...previous, [slot]: reply.data }))
    })
  }
  function mapColumns(slot: Slot, mapping: Mapping) {
    invalidate()
    setSources(previous => { const source = previous[slot]; return source ? { ...previous, [slot]: { ...source, mapping } } : previous })
  }
  function analyze() {
    if (!sources.rasd || !sources.warehouse || !ready || busy) return
    const options = {
      rasd: { sheetName: sources.rasd.sheetName, headerRow: sources.rasd.headerRow, mapping: sources.rasd.mapping },
      warehouse: { sheetName: sources.warehouse.sheetName, headerRow: sources.warehouse.headerRow, mapping: sources.warehouse.mapping },
      resolutions,
    }
    setResult(null)
    void perform(() => request({ kind: 'analyze', options }, setProgress), reply => {
      if (reply.kind === 'analysis') { setResult(reply.data); setDirty(false) }
    })
  }
  function download() {
    if (!result || result.blocked || dirty || busy || !validateMonth(month)) return
    void perform(() => request({ kind: 'export', month }, setProgress), reply => {
      if (reply.kind !== 'export') return
      const url = URL.createObjectURL(new Blob([reply.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      urls.current.add(url)
      const link = document.createElement('a')
      link.href = url; link.download = reportFilename(filename, month)
      document.body.appendChild(link); link.click(); link.remove()
      window.setTimeout(() => { URL.revokeObjectURL(url); urls.current.delete(url) }, 60_000)
      setSuccess('تم إنشاء التقرير وبدء تنزيله. يحتوي على المجموعات الخمس كاملة.')
    })
  }
  function reset() {
    epoch.current++; stop(); setBusy(false); setProgress(''); setSources({ rasd: null, warehouse: null }); invalidate()
  }

  return <div dir="rtl" style={{ minHeight: '100vh', color: colors.ink, lineHeight: 1.7, fontFamily: 'Tahoma, Arial, sans-serif' }}>
    <header style={{ background: '#fff', borderBottom: `1px solid ${colors.line}`, padding: '18px clamp(16px, 4vw, 54px)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <a href="#" style={{ display: 'flex', alignItems: 'center', gap: 12, color: colors.ink, textDecoration: 'none' }}><span style={{ width: 43, height: 43, display: 'grid', placeItems: 'center', background: colors.green, color: '#bcebd4', borderRadius: 13 }}><Icon size={25} /></span><div><strong style={{ display: 'block', fontSize: 19 }}>إدارة رصد</strong><span style={{ color: colors.muted, fontSize: 10, letterSpacing: 2 }}>RASD MANAGER</span></div></a>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 15 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#54816b', background: '#eff8f2', padding: '6px 12px', borderRadius: 30, fontSize: 11 }}><Icon name="shield" size={15} />ملفاتك تبقى على جهازك</span><span style={{ fontSize: 11, color: colors.muted }}>تحليل ملفات Excel</span></div>
    </header>
    <div style={{ maxWidth: 1530, marginInline: 'auto', padding: '30px clamp(14px, 3vw, 42px)', display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'flex-start' }}>
      <aside style={{ flex: '1 1 190px', maxWidth: 250, minWidth: 170 }}>
        <p style={{ color: '#9aa6ae', fontSize: 10, letterSpacing: 1, paddingInline: 12, marginBottom: 14 }}>مساحة العمل</p>
        <nav aria-label="أقسام التطبيق" style={{ display: 'grid', gap: 8 }}>{[
          ['#upload', 'upload', 'تحليل جديد'], ['#results', 'chart', 'نتائج التحليل'], ['#audit', 'file', 'جودة البيانات'],
        ].map(([href, icon, label], index) => <a key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderRadius: 10, textDecoration: 'none', fontSize: 13, fontWeight: index === 0 ? 700 : 400, background: index === 0 ? '#e6f1eb' : 'transparent', color: index === 0 ? colors.green : '#77878f' }}><Icon name={icon as 'upload' | 'chart' | 'file'} size={19} />{label}</a>)}</nav>
        <div style={{ marginTop: 40, padding: 18, border: `1px solid #dce8e1`, borderRadius: 13, background: '#edf5ef', fontSize: 12, color: '#5b7867' }}><Icon name="shield" size={22} /><p style={{ fontWeight: 700, marginBottom: 6 }}>معالجة محلية بالكامل</p><p style={{ margin: 0, fontSize: 11, lineHeight: 1.9 }}>نقرأ الملفات داخل متصفحك. لا يتم رفعها أو حفظها على خادم، وتُزال من الذاكرة عند إعادة التهيئة أو إغلاق الصفحة.</p></div>
      </aside>
      <main style={{ flex: '10 1 740px', minWidth: 0, display: 'grid', gap: 22 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 5 }}><div><p style={{ margin: '0 0 6px', fontSize: 11, color: colors.muted }}>مساحة العمل / تحليل الباتشات</p><h1 style={{ margin: 0, fontSize: 'clamp(23px, 3vw, 30px)', fontWeight: 700 }}>من ملفاتك إلى تقرير واضح<span style={{ color: '#399b75' }}>.</span></h1><p style={{ color: colors.muted, margin: '8px 0 0', fontSize: 13 }}>طابق ملف رصد مع المستودع، وراجع الباتشات الموجودة في رصد فقط.</p></div><Button secondary onClick={reset} style={{ fontSize: 12 }}>{busy ? 'إلغاء وإعادة التهيئة' : 'إعادة تهيئة'}</Button></div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {GROUPS.map(group => <div key={group.id} style={{ ...panel, padding: '17px 15px', flex: '1 1 135px', display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ display: 'grid', placeItems: 'center', width: 34, height: 34, borderRadius: 10, color: group.color, background: group.background }}><Icon name="layers" size={18} /></span><div><div style={{ fontSize: 10, color: colors.muted }}>{group.label}</div><strong style={{ display: 'block', fontSize: 23, marginTop: 3 }}>{result ? number(result.groups[group.id].length) : '—'}</strong></div></div>)}
        </div>
        <section id="upload" style={panel}>
          <SectionTitle number="01" title="رفع ملفات الشهر" subtitle="اختر ملف رصد وملف المستودع. المطابقة حسب رقم الباتش فقط، مع تجاهل حالة الأحرف والفراغات الطرفية." />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18 }}>{(['rasd', 'warehouse'] as Slot[]).map(slot => <FilePanel key={slot} slot={slot} inspection={sources[slot]} disabled={busy} onLoad={file => load(slot, file)} onInspect={(sheet, header) => inspect(slot, sheet, header)} onMapping={mapping => mapColumns(slot, mapping)} />)}</div>
        </section>
        <section style={panel}>
          <SectionTitle number="02" title="إعداد التقرير" subtitle="اختر الشهر الذي سيظهر في صفحات التقرير واسم ملف التنزيل." />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'end' }}><label style={{ flex: '1 1 180px', display: 'grid', gap: 7, fontSize: 12 }}>شهر التقرير<input type="month" required value={month} disabled={busy} onChange={event => setMonth(event.target.value)} style={inputStyle} /></label><label style={{ flex: '2 1 240px', display: 'grid', gap: 7, fontSize: 12 }}>اسم الملف<input value={filename} disabled={busy} placeholder={`إدارة-رصد-${month}.xlsx`} onChange={event => setFilename(event.target.value)} style={inputStyle} /></label><Button onClick={analyze} disabled={!ready || busy}><Icon name="chart" size={18} />{result ? 'إعادة التحليل' : 'بدء التحليل'}<Icon name="arrow" size={17} /></Button></div>
          <p style={{ color: colors.muted, fontSize: 11, marginBottom: 0, lineHeight: 1.9 }}>قاعدة الباتشات المكررة: {DUPLICATE_POLICY}</p>
        </section>
        {busy && <div role="status" aria-live="polite" style={{ padding: 18, borderRadius: 12, background: '#e8f3ee', color: colors.green, fontSize: 13 }}>{progress} يمكنك إلغاء العملية باستخدام «إلغاء وإعادة التهيئة».</div>}
        {error && <div role="alert" style={{ border: '1px solid #edcfc5', background: '#fff2ed', color: '#a14830', padding: 18, borderRadius: 12, fontSize: 13, whiteSpace: 'pre-wrap' }}>{error}</div>}
        {result && <>
          <Review key={`review-${result.stats.pending}-${result.stats.classified}`} result={result} resolutions={resolutions} headers={sources.rasd?.headers ?? []} disabled={busy} onChoose={(key, row) => { setResolutions(previous => ({ ...previous, [key]: row })); setDirty(true); setSuccess('') }} onApply={analyze} />
          <Results key={`results-${result.stats.pending}-${result.stats.classified}`} result={result} headers={sources.rasd?.headers ?? []} stale={dirty} />
          <Audit result={result} />
          <section style={{ ...panel, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 20, borderColor: '#cfe3d8', background: '#f5faf7' }}><div><h2 style={{ fontSize: 17, margin: '0 0 5px' }}>تقريرك الشهري في ملف واحد</h2><p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>خمس صفحات مرتبة، بالكميات المعتمدة والصفوف الأصلية. التنزيل يشمل جميع النتائج مهما كان البحث.</p><p style={{ margin: '8px 0 0', fontSize: 11, color: '#74877b' }}>التصدير متاح بعد حسم التكرارات وتصحيح أخطاء البيانات واختيار شهر صالح.</p></div><Button onClick={download} disabled={busy || result.blocked || dirty || !validateMonth(month)}><Icon name="download" size={18} />تنزيل Excel</Button></section>
        </>}
        {!result && !busy && <section style={{ ...panel, textAlign: 'center', padding: '42px 22px', borderStyle: 'dashed', background: 'transparent' }}><span style={{ color: '#9baea6' }}><Icon name="chart" size={34} /></span><h2 style={{ fontSize: 15, marginBottom: 6 }}>نتائجك ستظهر هنا</h2><p style={{ fontSize: 12, color: colors.muted, margin: 0 }}>ارفع الملفين، تأكد من الأعمدة، ثم اضغط «بدء التحليل».</p></section>}
        {success && <p role="status" style={{ margin: 0, padding: 14, color: '#267655', fontSize: 13, background: '#eaf7ef', borderRadius: 10 }}>{success}</p>}
        <footer style={{ color: '#9ba7ae', fontSize: 10, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, padding: '4px 2px 15px' }}><span>إدارة رصد · تنظيم الباتشات والتقارير الشهرية</span><span>الملفات الأصلية لا تتغير</span></footer>
      </main>
    </div>
  </div>
}
