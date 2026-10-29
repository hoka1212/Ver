import { describe, expect, it } from 'vitest'
import { isDue, markStudied, practiceOrder, reviewLine } from './srs'

const NOW = 1_800_000_000_000
const HOUR = 3600_000

describe('интервальное повторение', () => {
  it('безошибочный первый проход назначает повтор не раньше чем через сутки', () => {
    const p = reviewLine(undefined, 0, NOW)
    expect(p.level).toBe(2)
    expect(p.due - NOW).toBe(20 * HOUR)
    expect(isDue(p, NOW)).toBe(false)
  })

  it('ошибки понижают уровень и возвращают линию в очередь', () => {
    const good = reviewLine(reviewLine(undefined, 0, NOW), 0, NOW)
    expect(good.level).toBe(3)
    expect(reviewLine(good, 1, NOW).level).toBe(2)
    const bad = reviewLine(good, 3, NOW)
    expect(bad.level).toBe(1)
    expect(isDue(bad, NOW)).toBe(true)
  })

  it('изучение с подсказками отмечает линию, но не продвигает уровень', () => {
    expect(markStudied(undefined, NOW).level).toBe(1)
    const advanced = reviewLine(reviewLine(undefined, 0, NOW), 0, NOW)
    expect(markStudied(advanced, NOW).level).toBe(advanced.level)
  })

  it('порядок тренировки: просроченные, затем новые, затем остальные', () => {
    const lines = [{ key: 'a' }, { key: 'b' }, { key: 'c' }]
    const progress = {
      a: reviewLine(undefined, 0, NOW), // ещё не пора
      c: reviewLine(undefined, 3, NOW - HOUR), // просрочена
    }
    expect(practiceOrder(lines, progress, NOW).map((l) => l.key)).toEqual(['c', 'b', 'a'])
  })
})
