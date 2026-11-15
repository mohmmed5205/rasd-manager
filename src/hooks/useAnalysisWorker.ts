import { useCallback, useEffect, useRef } from 'react'
import type { WorkerReply, WorkerRequest } from '../types.ts'

type RequestPayload = WorkerRequest extends infer T ? T extends WorkerRequest ? Omit<T, 'id'> : never : never
interface Pending { resolve: (reply: WorkerReply) => void; reject: (error: Error) => void; progress: (message: string) => void }

export function useAnalysisWorker() {
  const worker = useRef<Worker | null>(null)
  const pending = useRef(new Map<number, Pending>())
  const nextId = useRef(0)
  const stop = useCallback(() => {
    worker.current?.terminate()
    worker.current = null
    for (const request of pending.current.values()) request.reject(new Error('أُلغيت العملية. أعد رفع الملفين للبدء مجددًا.'))
    pending.current.clear()
  }, [])
  useEffect(() => stop, [stop])
  const request = useCallback((payload: RequestPayload, progress: (message: string) => void = () => {}): Promise<WorkerReply> => {
    if (!worker.current) {
      const instance = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' })
      worker.current = instance
      instance.onmessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data, job = pending.current.get(reply.id)
        if (!job) return
        if (reply.kind === 'progress') { job.progress(reply.message); return }
        pending.current.delete(reply.id)
        if (reply.kind === 'error') job.reject(new Error(reply.message))
        else job.resolve(reply)
      }
      instance.onerror = event => {
        event.preventDefault()
        for (const job of pending.current.values()) job.reject(new Error('تعذر تشغيل المعالجة. أعد تهيئة الصفحة وارفع الملفين.'))
        pending.current.clear()
        instance.terminate()
        worker.current = null
      }
      instance.onmessageerror = () => {
        for (const job of pending.current.values()) job.reject(new Error('تعذر نقل بيانات المعالجة. أعد التهيئة وارفع الملفين مجددًا.'))
        pending.current.clear()
        instance.terminate()
        worker.current = null
      }
    }
    return new Promise((resolve, reject) => {
      const id = ++nextId.current
      pending.current.set(id, { resolve, reject, progress })
      try { worker.current!.postMessage({ ...payload, id }) }
      catch (error) { pending.current.delete(id); reject(error instanceof Error ? error : new Error('تعذر بدء المعالجة.')) }
    })
  }, [])
  return { request, stop }
}
