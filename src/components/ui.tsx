import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'

export const colors = { ink: '#20333f', muted: '#74838c', green: '#164e46', mint: '#dff5ea', line: '#e5ebee', white: '#fff', canvas: '#f6f8fa' }
export const panel: CSSProperties = { background: colors.white, border: `1px solid ${colors.line}`, borderRadius: 18, padding: 'clamp(16px, 3vw, 28px)', minWidth: 0 }
export const inputStyle: CSSProperties = { boxSizing: 'border-box', width: '100%', padding: '11px 13px', border: `1px solid #cbd6dc`, borderRadius: 9, background: '#fff', color: colors.ink, font: 'inherit', fontSize: 14, minHeight: 44 }
export const cellStyle: CSSProperties = { padding: '15px 16px', borderBottom: `1px solid ${colors.line}`, textAlign: 'right', whiteSpace: 'nowrap', fontSize: 13 }
export const number = (value: number): string => new Intl.NumberFormat('en-US', { maximumFractionDigits: 10 }).format(value)

export function Icon({ name = 'layers', size = 22, color = 'currentColor' }: { name?: 'layers' | 'upload' | 'file' | 'download' | 'search' | 'check' | 'shield' | 'arrow' | 'chart'; size?: number; color?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    layers: <><path d="m3 7 9-5 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5M3 17l9 5 9-5" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
    file: <><path d="M14 2H5v20h14V7l-5-5Z" /><path d="M14 2v6h5M8 13h8M8 17h5" /></>,
    download: <><path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    shield: <><path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z" /><path d="m8 12 3 3 5-6" /></>,
    arrow: <path d="M20 12H4m6-6-6 6 6 6" />,
    chart: <><path d="M4 3v18h17M9 17v-6M14 17V6M19 17V9" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>{paths[name]}</svg>
}

export function Button({ children, secondary = false, style, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { secondary?: boolean }) {
  return <button {...props} disabled={disabled} style={{ font: 'inherit', fontSize: 14, fontWeight: 700, padding: '11px 18px', minHeight: 44, borderRadius: 10, border: `1px solid ${secondary ? '#d4dfe4' : colors.green}`, background: secondary ? '#fff' : colors.green, color: secondary ? colors.ink : '#fff', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 9, ...style }}>{children}</button>
}

export function SectionTitle({ number: step, title, subtitle }: { number?: string; title: string; subtitle?: string }) {
  return <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 22 }}>
    {step && <span style={{ display: 'grid', placeItems: 'center', width: 33, height: 33, borderRadius: 10, background: '#eff5f2', color: colors.green, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{step}</span>}
    <div><h2 style={{ fontSize: 18, margin: '0 0 5px', fontWeight: 700 }}>{title}</h2>{subtitle && <p style={{ margin: 0, fontSize: 13, color: colors.muted, lineHeight: 1.8 }}>{subtitle}</p>}</div>
  </div>
}

export function Pager({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 16, color: colors.muted, fontSize: 12 }}>
    <span>{total ? `${number((page - 1) * pageSize + 1)}–${number(Math.min(page * pageSize, total))} من ${number(total)}` : 'لا توجد نتائج'}</span>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Button secondary disabled={page <= 1} onClick={() => onChange(page - 1)} style={{ minHeight: 36, padding: '5px 12px', fontSize: 12 }}>السابق</Button><span>{page} / {pages}</span><Button secondary disabled={page >= pages} onClick={() => onChange(page + 1)} style={{ minHeight: 36, padding: '5px 12px', fontSize: 12 }}>التالي</Button></div>
  </div>
}
