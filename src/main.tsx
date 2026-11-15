import { Component, StrictMode } from 'react'
import type { ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (this.state.failed) return <main dir="rtl" style={{ padding: 32, fontFamily: 'Tahoma, Arial, sans-serif' }}><h1>تعذر عرض التطبيق</h1><p>أعد تحميل الصفحة وارفع الملفين مجددًا. ملفاتك الأصلية لم تتغير.</p><button onClick={() => location.reload()} style={{ padding: 12, cursor: 'pointer' }}>إعادة تحميل</button></main>
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><App /></ErrorBoundary></StrictMode>)
