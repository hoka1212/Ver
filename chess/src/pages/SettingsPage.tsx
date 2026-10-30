import { useRef, useState } from 'react'
import { DownloadIcon, TrashIcon, UploadIcon } from '../components/icons'
import { Button, Card, ConfirmButton, PageHeader, Segmented, Toggle } from '../components/ui'
import { useStore } from '../lib/storage'
import {
  activityStore,
  ALL_STORES,
  BOARD_THEMES,
  botGameStore,
  botStatsStore,
  coordStore,
  progressStore,
  repertoireStore,
  settingsStore,
  type BoardTheme,
  type Settings,
} from '../store'

export function SettingsPage() {
  const settings = useStore(settingsStore)
  const set = (patch: Partial<Settings>) => settingsStore.set((s) => ({ ...s, ...patch }))
  const fileRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)

  const exportBackup = () => {
    const data = Object.fromEntries(ALL_STORES.map((s) => [s.key, s.get()]))
    const blob = new Blob([JSON.stringify({ app: 'chess-trainer', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chess-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      if (parsed?.app !== 'chess-trainer' || typeof parsed.data !== 'object') throw new Error('format')
      for (const store of ALL_STORES) {
        if (store.key in parsed.data) (store.set as (v: unknown) => void)(parsed.data[store.key])
      }
      setMessage('Данные восстановлены из резервной копии.')
    } catch {
      setMessage('Не удалось прочитать файл: это не резервная копия тренажёра.')
    }
  }

  const resetProgress = () => {
    progressStore.reset()
    coordStore.set((d) => ({ ...d, sessions: [], best: {}, squares: {} }))
    activityStore.reset()
    botStatsStore.reset()
    botGameStore.reset()
    setMessage('Прогресс сброшен.')
  }

  const deleteRepertoire = () => {
    const ids = new Set(repertoireStore.get().map((c) => c.id))
    repertoireStore.reset()
    progressStore.set((p) => Object.fromEntries(Object.entries(p).filter(([k]) => !ids.has(k.split('/')[0]))))
    setMessage('Собственные курсы удалены.')
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Настройки" />

      <Card>
        <h2 className="mb-3 font-semibold">Доска</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(BOARD_THEMES) as BoardTheme[]).map((key) => {
            const t = BOARD_THEMES[key]
            const active = settings.boardTheme === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => set({ boardTheme: key })}
                className={`rounded-xl border p-2 text-left transition ${active ? 'border-accent bg-surface-2' : 'border-line hover:bg-surface-2'}`}
              >
                <div className="grid aspect-square grid-cols-4 overflow-hidden rounded-md">
                  {Array.from({ length: 16 }, (_, i) => (
                    <div key={i} style={{ backgroundColor: (Math.floor(i / 4) + i) % 2 ? t.dark : t.light }} />
                  ))}
                </div>
                <div className={`mt-1.5 text-sm font-medium ${active ? 'text-accent' : 'text-muted'}`}>{t.name}</div>
              </button>
            )
          })}
        </div>
        <div className="mt-4 space-y-2">
          <Toggle checked={settings.showNotation} onChange={(showNotation) => set({ showNotation })} label="Подписи клеток (a–h, 1–8) на доске дебютов" />
          <Toggle checked={settings.animations} onChange={(animations) => set({ animations })} label="Анимация ходов" />
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="mb-3 font-semibold">Дебютный тренажёр</h2>
        <div className="mb-3">
          <div className="mb-1.5 text-sm text-muted">Скорость ответа компьютера</div>
          <Segmented<number>
            value={settings.opponentDelay}
            onChange={(opponentDelay) => set({ opponentDelay })}
            options={[
              { value: 150, label: 'Быстро' },
              { value: 450, label: 'Обычно' },
              { value: 900, label: 'Медленно' },
            ]}
          />
        </div>
        <Toggle checked={settings.showComments} onChange={(showComments) => set({ showComments })} label="Показывать комментарии к ходам" />
      </Card>

      <Card className="mt-4">
        <h2 className="mb-1 font-semibold">Данные</h2>
        <p className="mb-3 text-sm text-muted">
          Прогресс, рекорды и ваш репертуар хранятся в localStorage этого браузера. Сделайте резервную копию, чтобы перенести их на другое
          устройство.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportBackup}>
            <DownloadIcon size={16} /> Скачать резервную копию
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <UploadIcon size={16} /> Восстановить
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importBackup(f)
              e.target.value = ''
            }}
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          <ConfirmButton variant="danger" onConfirm={resetProgress} confirmLabel="Сбросить весь прогресс?">
            <TrashIcon size={16} /> Сбросить прогресс
          </ConfirmButton>
          <ConfirmButton variant="danger" onConfirm={deleteRepertoire} confirmLabel="Удалить все мои курсы?">
            <TrashIcon size={16} /> Удалить мои курсы
          </ConfirmButton>
        </div>
        <p className="mt-2 text-xs text-faint">Сброс прогресса не трогает ваши курсы. Опасные действия подтверждаются повторным нажатием.</p>
        {message && <p className="mt-3 text-sm text-accent">{message}</p>}
      </Card>
    </div>
  )
}
