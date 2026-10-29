/** Уровни силы бота (без кода движка — чтобы не тянуть его в основной бандл). */
export type BotLevel = 1 | 2 | 3 | 4

export const BOT_LEVELS: Record<BotLevel, { name: string; description: string }> = {
  1: { name: 'Новичок', description: 'Часто ошибается и зевает фигуры.' },
  2: { name: 'Любитель', description: 'Играет разумно, но иногда зевает.' },
  3: { name: 'Клубный', description: 'Крепкий соперник, ошибается редко.' },
  4: { name: 'Мастер', description: 'Играет в полную силу движка.' },
}
