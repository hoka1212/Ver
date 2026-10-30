import type { BotReply, BotRequest } from './bot'

interface Pending {
  req: BotRequest
  resolve: (r: BotReply) => void
  reject: (e: unknown) => void
  timer: number
}

let worker: Worker | null | undefined
let nextId = 1
const pending = new Map<number, Pending>()

/** Если поток недоступен (старый браузер, песочница), считаем в основном потоке. */
async function runLocally(req: BotRequest): Promise<BotReply> {
  const { runBot } = await import('./bot')
  // Даём интерфейсу дорисоваться перед расчётом.
  await new Promise((r) => setTimeout(r, 30))
  return runBot(req)
}

function fallBack() {
  worker?.terminate()
  worker = null
  for (const [id, p] of pending) {
    pending.delete(id)
    window.clearTimeout(p.timer)
    runLocally(p.req).then(p.resolve, p.reject)
  }
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  try {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; res?: BotReply; error?: string }>) => {
      const p = pending.get(e.data.id)
      if (!p) return
      pending.delete(e.data.id)
      window.clearTimeout(p.timer)
      if (e.data.res) p.resolve(e.data.res)
      else p.reject(new Error(e.data.error ?? 'Ошибка движка'))
    }
    worker.onerror = (e) => {
      e.preventDefault()
      fallBack()
    }
  } catch {
    worker = null
  }
  return worker
}

/** Запрос к движку бота. */
export function askBot(req: BotRequest): Promise<BotReply> {
  const w = getWorker()
  if (!w) return runLocally(req)
  return new Promise((resolve, reject) => {
    const id = nextId++
    // Поток не ответил (например, не загрузился) — переходим на расчёт в основном потоке.
    const timer = window.setTimeout(fallBack, 15_000)
    pending.set(id, { req, resolve, reject, timer })
    w.postMessage({ id, req })
  })
}
