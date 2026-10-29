import { runBot, type BotRequest } from './bot'

// Движок думает в отдельном потоке, чтобы интерфейс не подвисал.
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; req: BotRequest }>) => void) | null
  postMessage: (msg: unknown) => void
}

ctx.onmessage = (e) => {
  const { id, req } = e.data
  try {
    ctx.postMessage({ id, res: runBot(req) })
  } catch (err) {
    ctx.postMessage({ id, error: String(err) })
  }
}
