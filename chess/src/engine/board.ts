/**
 * Позиция для движка: доска 0x88, генерация ходов, ход/отмена хода,
 * хэш Зобриста и инкрементальная оценка по таблицам PeSTO.
 */

export const WHITE = 0
export const BLACK = 1
export const PAWN = 1
export const KNIGHT = 2
export const BISHOP = 3
export const ROOK = 4
export const QUEEN = 5
export const KING = 6

// Ход упакован в число: from | to << 7 | превращение << 14 | флаги.
export const FLAG_CAPTURE = 1 << 17
export const FLAG_EP = 1 << 18
export const FLAG_CASTLE = 1 << 19
export const FLAG_DOUBLE = 1 << 20

export const moveFrom = (m: number) => m & 0x7f
export const moveTo = (m: number) => (m >> 7) & 0x7f
export const movePromo = (m: number) => (m >> 14) & 7

const encode = (from: number, to: number, promo = 0, flags = 0) => from | (to << 7) | (promo << 14) | flags
const piece = (color: number, type: number) => (color << 3) | type

const MAX_HISTORY = 4096

const KNIGHT_OFFSETS = [33, 31, 18, 14, -33, -31, -18, -14]
const KING_OFFSETS = [1, -1, 16, -16, 15, 17, -15, -17]
const BISHOP_DIRS = [15, 17, -15, -17]
const ROOK_DIRS = [1, -1, 16, -16]

// ---------- Хэш Зобриста ----------

let seed = 0x2545f491
function rand32() {
  seed ^= seed << 13
  seed ^= seed >>> 17
  seed ^= seed << 5
  return seed | 0
}
const Z_PIECE_LO = new Int32Array(16 * 128).map(() => rand32())
const Z_PIECE_HI = new Int32Array(16 * 128).map(() => rand32())
const Z_CASTLE_LO = new Int32Array(16).map(() => rand32())
const Z_CASTLE_HI = new Int32Array(16).map(() => rand32())
const Z_EP_LO = new Int32Array(8).map(() => rand32())
const Z_EP_HI = new Int32Array(8).map(() => rand32())
const Z_SIDE_LO = rand32()
const Z_SIDE_HI = rand32()

// Права рокировки, которые сохраняются после хода с/на клетку.
const CASTLE_MASK = new Int32Array(128).fill(15)
CASTLE_MASK[0] = 15 & ~2
CASTLE_MASK[7] = 15 & ~1
CASTLE_MASK[4] = 15 & ~3
CASTLE_MASK[112] = 15 & ~8
CASTLE_MASK[119] = 15 & ~4
CASTLE_MASK[116] = 15 & ~12

// ---------- Оценка PeSTO (таблицы с позиции белых, a8 — индекс 0) ----------

const MG_VALUE = [0, 82, 337, 365, 477, 1025, 0]
const EG_VALUE = [0, 94, 281, 297, 512, 936, 0]
export const PHASE_INC = [0, 0, 1, 1, 2, 4, 0]

// prettier-ignore
const MG_TABLES = [
  [],
  [0,0,0,0,0,0,0,0, 98,134,61,95,68,126,34,-11, -6,7,26,31,65,56,25,-20, -14,13,6,21,23,12,17,-23, -27,-2,-5,12,17,6,10,-25, -26,-4,-4,-10,3,3,33,-12, -35,-1,-20,-23,-15,24,38,-22, 0,0,0,0,0,0,0,0],
  [-167,-89,-34,-49,61,-97,-15,-107, -73,-41,72,36,23,62,7,-17, -47,60,37,65,84,129,73,44, -9,17,19,53,37,69,18,22, -13,4,16,13,28,19,21,-8, -23,-9,12,10,19,17,25,-16, -29,-53,-12,-3,-1,18,-14,-19, -105,-21,-58,-33,-17,-28,-19,-23],
  [-29,4,-82,-37,-25,-42,7,-8, -26,16,-18,-13,30,59,18,-47, -16,37,43,40,35,50,37,-2, -4,5,19,50,37,37,7,-2, -6,13,13,26,34,12,10,4, 0,15,15,15,14,27,18,10, 4,15,16,0,7,21,33,1, -33,-3,-14,-21,-13,-12,-39,-21],
  [32,42,32,51,63,9,31,43, 27,32,58,62,80,67,26,44, -5,19,26,36,17,45,61,16, -24,-11,7,26,24,35,-8,-20, -36,-26,-12,-1,9,-7,6,-23, -45,-25,-16,-17,3,0,-5,-33, -44,-16,-20,-9,-1,11,-6,-71, -19,-13,1,17,16,7,-37,-26],
  [-28,0,29,12,59,44,43,45, -24,-39,-5,1,-16,57,28,54, -13,-17,7,8,29,56,47,57, -27,-27,-16,-16,-1,17,-2,1, -9,-26,-9,-10,-2,-4,3,-3, -14,2,-11,-2,-5,2,14,5, -35,-8,11,2,8,15,-3,1, -1,-18,-9,10,-15,-25,-31,-50],
  [-65,23,16,-15,-56,-34,2,13, 29,-1,-20,-7,-8,-4,-38,-29, -9,24,2,-16,-20,6,22,-22, -17,-20,-12,-27,-30,-25,-14,-36, -49,-1,-27,-39,-46,-44,-33,-51, -14,-14,-22,-46,-44,-30,-15,-27, 1,7,-8,-64,-43,-16,9,8, -15,36,12,-54,8,-28,24,14],
]
// prettier-ignore
const EG_TABLES = [
  [],
  [0,0,0,0,0,0,0,0, 178,173,158,134,147,132,165,187, 94,100,85,67,56,53,82,84, 32,24,13,5,-2,4,17,17, 13,9,-3,-7,-7,-8,3,-1, 4,7,-6,1,0,-5,-1,-8, 13,8,8,10,13,0,2,-7, 0,0,0,0,0,0,0,0],
  [-58,-38,-13,-28,-31,-27,-63,-99, -25,-8,-25,-2,-9,-25,-24,-52, -24,-20,10,9,-1,-9,-19,-41, -17,3,22,22,22,11,8,-18, -18,-6,16,25,16,17,4,-18, -23,-3,-1,15,10,-3,-20,-22, -42,-20,-10,-5,-2,-20,-23,-44, -29,-51,-23,-15,-22,-18,-50,-64],
  [-14,-21,-11,-8,-7,-9,-17,-24, -8,-4,7,-12,-3,-13,-4,-14, 2,-8,0,-1,-2,6,0,4, -3,9,12,9,14,10,3,2, -6,3,13,19,7,10,-3,-9, -12,-3,8,10,13,3,-7,-15, -14,-18,-7,-1,4,-9,-15,-27, -23,-9,-23,-5,-9,-16,-5,-17],
  [13,10,18,15,12,12,8,5, 11,13,13,11,-3,3,8,3, 7,7,7,5,4,-3,-5,-3, 4,3,13,1,2,1,-1,2, 3,5,8,4,-5,-6,-8,-11, -4,0,-5,-1,-7,-12,-8,-16, -6,-6,0,2,-9,-9,-11,-3, -9,2,3,-1,-5,-13,4,-20],
  [-9,22,22,27,27,19,10,20, -17,20,32,41,58,25,30,0, -20,6,9,49,47,35,19,9, 3,22,24,45,57,40,57,36, -18,28,19,47,31,34,39,23, -16,-27,15,6,9,17,10,5, -22,-23,-30,-16,-16,-23,-36,-32, -33,-28,-22,-43,-5,-32,-20,-41],
  [-74,-35,-18,-18,-11,15,4,-17, -12,17,14,17,17,38,23,11, 10,17,23,15,20,45,44,13, -8,22,24,27,26,33,26,3, -18,-4,21,24,27,23,9,-11, -19,-3,11,21,23,16,7,-9, -27,-11,4,13,14,4,-5,-17, -53,-34,-21,-11,-28,-14,-24,-43],
]

/** Стоимость фигуры на поле (материал + позиция) для дебюта/миттельшпиля и эндшпиля. */
const PST_MG = new Int32Array(16 * 128)
const PST_EG = new Int32Array(16 * 128)
for (let type = PAWN; type <= KING; type++) {
  for (let sq = 0; sq < 128; sq++) {
    if (sq & 0x88) continue
    const rank = sq >> 4
    const file = sq & 7
    const w = (7 - rank) * 8 + file
    const b = rank * 8 + file
    PST_MG[piece(WHITE, type) * 128 + sq] = MG_VALUE[type] + MG_TABLES[type][w]
    PST_EG[piece(WHITE, type) * 128 + sq] = EG_VALUE[type] + EG_TABLES[type][w]
    PST_MG[piece(BLACK, type) * 128 + sq] = MG_VALUE[type] + MG_TABLES[type][b]
    PST_EG[piece(BLACK, type) * 128 + sq] = EG_VALUE[type] + EG_TABLES[type][b]
  }
}

export function squareName(sq: number): string {
  return String.fromCharCode(97 + (sq & 7)) + String.fromCharCode(49 + (sq >> 4))
}

export function parseSquare(name: string): number {
  const file = name.charCodeAt(0) - 97
  const rank = name.charCodeAt(1) - 49
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return -1
  return rank * 16 + file
}

export function moveToUci(m: number): string {
  const promo = movePromo(m)
  return squareName(moveFrom(m)) + squareName(moveTo(m)) + (promo ? ' pnbrqk'[promo] : '')
}

const FEN_PIECES = ' PNBRQK  pnbrqk'

export class Position {
  board = new Int8Array(128)
  side = WHITE
  castling = 0
  ep = -1
  halfmove = 0
  fullmove = 1
  kingSq = new Int32Array(2)
  hashLo = 0
  hashHi = 0
  mg = new Int32Array(2)
  eg = new Int32Array(2)
  phase = 0
  pawns = new Int32Array(2)
  bishops = new Int32Array(2)
  /** Сила фигур (без пешек и короля) по сторонам — для нулевого хода и ничьей. */
  pieceWeight = new Int32Array(2)

  // Стек отмены ходов.
  private sp = 0
  private uMove = new Int32Array(MAX_HISTORY)
  private uCaptured = new Int32Array(MAX_HISTORY)
  private uState = new Int32Array(MAX_HISTORY * 13)
  readonly hashLoHistory = new Int32Array(MAX_HISTORY)
  readonly hashHiHistory = new Int32Array(MAX_HISTORY)

  constructor(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
    this.setFen(fen)
  }

  setFen(fen: string) {
    const parts = fen.trim().split(/\s+/)
    this.board.fill(0)
    this.mg.fill(0)
    this.eg.fill(0)
    this.pawns.fill(0)
    this.bishops.fill(0)
    this.pieceWeight.fill(0)
    this.phase = 0
    this.hashLo = 0
    this.hashHi = 0
    this.sp = 0
    let rank = 7
    let file = 0
    for (const ch of parts[0]) {
      if (ch === '/') {
        rank--
        file = 0
      } else if (ch >= '1' && ch <= '8') {
        file += Number(ch)
      } else {
        const idx = FEN_PIECES.indexOf(ch)
        if (idx <= 0 || file > 7 || rank < 0) throw new Error(`Bad FEN: ${fen}`)
        this.put(rank * 16 + file, idx)
        file++
      }
    }
    this.side = parts[1] === 'b' ? BLACK : WHITE
    this.castling = 0
    for (const ch of parts[2] ?? '-') {
      if (ch === 'K') this.castling |= 1
      if (ch === 'Q') this.castling |= 2
      if (ch === 'k') this.castling |= 4
      if (ch === 'q') this.castling |= 8
    }
    this.ep = parts[3] && parts[3] !== '-' ? parseSquare(parts[3]) : -1
    this.halfmove = Number(parts[4] ?? 0) || 0
    this.fullmove = Number(parts[5] ?? 1) || 1
    if (this.side === BLACK) {
      this.hashLo ^= Z_SIDE_LO
      this.hashHi ^= Z_SIDE_HI
    }
    this.hashLo ^= Z_CASTLE_LO[this.castling]
    this.hashHi ^= Z_CASTLE_HI[this.castling]
    if (this.ep !== -1) {
      this.hashLo ^= Z_EP_LO[this.ep & 7]
      this.hashHi ^= Z_EP_HI[this.ep & 7]
    }
  }

  toFen(): string {
    const rows: string[] = []
    for (let rank = 7; rank >= 0; rank--) {
      let row = ''
      let empty = 0
      for (let file = 0; file < 8; file++) {
        const p = this.board[rank * 16 + file]
        if (!p) {
          empty++
          continue
        }
        if (empty) row += empty
        empty = 0
        row += FEN_PIECES[p]
      }
      if (empty) row += empty
      rows.push(row)
    }
    let castle = ''
    if (this.castling & 1) castle += 'K'
    if (this.castling & 2) castle += 'Q'
    if (this.castling & 4) castle += 'k'
    if (this.castling & 8) castle += 'q'
    return `${rows.join('/')} ${this.side === WHITE ? 'w' : 'b'} ${castle || '-'} ${this.ep === -1 ? '-' : squareName(this.ep)} ${this.halfmove} ${this.fullmove}`
  }

  private put(sq: number, p: number) {
    this.board[sq] = p
    const color = p >> 3
    const type = p & 7
    const k = p * 128 + sq
    this.mg[color] += PST_MG[k]
    this.eg[color] += PST_EG[k]
    this.phase += PHASE_INC[type]
    this.hashLo ^= Z_PIECE_LO[k]
    this.hashHi ^= Z_PIECE_HI[k]
    if (type === KING) this.kingSq[color] = sq
    else if (type === PAWN) this.pawns[color]++
    else {
      this.pieceWeight[color] += PHASE_INC[type]
      if (type === BISHOP) this.bishops[color]++
    }
  }

  private remove(sq: number) {
    const p = this.board[sq]
    this.board[sq] = 0
    const color = p >> 3
    const type = p & 7
    const k = p * 128 + sq
    this.mg[color] -= PST_MG[k]
    this.eg[color] -= PST_EG[k]
    this.phase -= PHASE_INC[type]
    this.hashLo ^= Z_PIECE_LO[k]
    this.hashHi ^= Z_PIECE_HI[k]
    if (type === PAWN) this.pawns[color]--
    else if (type !== KING) {
      this.pieceWeight[color] -= PHASE_INC[type]
      if (type === BISHOP) this.bishops[color]--
    }
  }

  private saveState(m: number) {
    const i = this.sp
    this.uMove[i] = m
    this.hashLoHistory[i] = this.hashLo
    this.hashHiHistory[i] = this.hashHi
    const s = i * 13
    const u = this.uState
    u[s] = this.castling
    u[s + 1] = this.ep
    u[s + 2] = this.halfmove
    u[s + 3] = this.hashLo
    u[s + 4] = this.hashHi
    u[s + 5] = this.mg[0]
    u[s + 6] = this.mg[1]
    u[s + 7] = this.eg[0]
    u[s + 8] = this.eg[1]
    u[s + 9] = this.phase
    u[s + 10] = this.pawns[0] | (this.pawns[1] << 8) | (this.bishops[0] << 16) | (this.bishops[1] << 24)
    u[s + 11] = this.pieceWeight[0] | (this.pieceWeight[1] << 16)
    u[s + 12] = this.fullmove
    this.sp++
  }

  private restoreState() {
    const s = this.sp * 13
    const u = this.uState
    this.castling = u[s]
    this.ep = u[s + 1]
    this.halfmove = u[s + 2]
    this.hashLo = u[s + 3]
    this.hashHi = u[s + 4]
    this.mg[0] = u[s + 5]
    this.mg[1] = u[s + 6]
    this.eg[0] = u[s + 7]
    this.eg[1] = u[s + 8]
    this.phase = u[s + 9]
    const packed = u[s + 10]
    this.pawns[0] = packed & 0xff
    this.pawns[1] = (packed >> 8) & 0xff
    this.bishops[0] = (packed >> 16) & 0xff
    this.bishops[1] = (packed >>> 24) & 0xff
    this.pieceWeight[0] = u[s + 11] & 0xffff
    this.pieceWeight[1] = u[s + 11] >>> 16
    this.fullmove = u[s + 12]
  }

  /** Делает ход; если он оставляет короля под шахом — отменяет и возвращает false. */
  make(m: number): boolean {
    const from = moveFrom(m)
    const to = moveTo(m)
    const promo = movePromo(m)
    const us = this.side
    const them = us ^ 1
    const p = this.board[from]
    this.saveState(m)

    if (this.ep !== -1) {
      this.hashLo ^= Z_EP_LO[this.ep & 7]
      this.hashHi ^= Z_EP_HI[this.ep & 7]
    }
    this.hashLo ^= Z_CASTLE_LO[this.castling]
    this.hashHi ^= Z_CASTLE_HI[this.castling]

    let captured = 0
    if (m & FLAG_EP) {
      const capSq = us === WHITE ? to - 16 : to + 16
      captured = this.board[capSq]
      this.remove(capSq)
    } else if (this.board[to]) {
      captured = this.board[to]
      this.remove(to)
    }
    this.uCaptured[this.sp - 1] = captured
    this.remove(from)
    this.put(to, promo ? piece(us, promo) : p)

    if (m & FLAG_CASTLE) {
      const kingSide = to > from
      const rookFrom = kingSide ? from + 3 : from - 4
      const rookTo = kingSide ? from + 1 : from - 1
      const rook = this.board[rookFrom]
      this.remove(rookFrom)
      this.put(rookTo, rook)
    }

    this.castling &= CASTLE_MASK[from] & CASTLE_MASK[to]
    this.hashLo ^= Z_CASTLE_LO[this.castling]
    this.hashHi ^= Z_CASTLE_HI[this.castling]

    this.ep = -1
    if (m & FLAG_DOUBLE) {
      // Поле взятия на проходе запоминаем, только если взять действительно есть чем.
      const enemyPawn = piece(them, PAWN)
      if ((!((to + 1) & 0x88) && this.board[to + 1] === enemyPawn) || (!((to - 1) & 0x88) && this.board[to - 1] === enemyPawn)) {
        this.ep = (from + to) >> 1
        this.hashLo ^= Z_EP_LO[this.ep & 7]
        this.hashHi ^= Z_EP_HI[this.ep & 7]
      }
    }

    this.halfmove = (p & 7) === PAWN || captured ? 0 : this.halfmove + 1
    if (us === BLACK) this.fullmove++
    this.side = them
    this.hashLo ^= Z_SIDE_LO
    this.hashHi ^= Z_SIDE_HI

    if (this.isAttacked(this.kingSq[us], them)) {
      this.unmake()
      return false
    }
    return true
  }

  unmake() {
    this.sp--
    const m = this.uMove[this.sp]
    const from = moveFrom(m)
    const to = moveTo(m)
    const promo = movePromo(m)
    this.side ^= 1
    const us = this.side
    const p = this.board[to]
    this.board[from] = promo ? piece(us, PAWN) : p
    const captured = this.uCaptured[this.sp]
    if (m & FLAG_EP) {
      this.board[to] = 0
      this.board[us === WHITE ? to - 16 : to + 16] = captured
    } else {
      this.board[to] = captured
    }
    if ((p & 7) === KING) {
      this.kingSq[us] = from
      if (m & FLAG_CASTLE) {
        const kingSide = to > from
        const rookFrom = kingSide ? from + 3 : from - 4
        const rookTo = kingSide ? from + 1 : from - 1
        this.board[rookFrom] = this.board[rookTo]
        this.board[rookTo] = 0
      }
    }
    this.restoreState()
  }

  makeNull() {
    this.saveState(0)
    if (this.ep !== -1) {
      this.hashLo ^= Z_EP_LO[this.ep & 7]
      this.hashHi ^= Z_EP_HI[this.ep & 7]
    }
    this.ep = -1
    // Повторение не ищем дальше нулевого хода (счётчик восстановится при отмене).
    this.halfmove = 0
    this.side ^= 1
    this.hashLo ^= Z_SIDE_LO
    this.hashHi ^= Z_SIDE_HI
  }

  unmakeNull() {
    this.sp--
    this.side ^= 1
    this.restoreState()
  }

  isAttacked(sq: number, by: number): boolean {
    const b = this.board
    let a: number
    if (by === WHITE) {
      a = sq - 15
      if (!(a & 0x88) && b[a] === PAWN) return true
      a = sq - 17
      if (!(a & 0x88) && b[a] === PAWN) return true
    } else {
      a = sq + 15
      if (!(a & 0x88) && b[a] === (8 | PAWN)) return true
      a = sq + 17
      if (!(a & 0x88) && b[a] === (8 | PAWN)) return true
    }
    const knight = piece(by, KNIGHT)
    for (let i = 0; i < 8; i++) {
      a = sq + KNIGHT_OFFSETS[i]
      if (!(a & 0x88) && b[a] === knight) return true
    }
    const king = piece(by, KING)
    for (let i = 0; i < 8; i++) {
      a = sq + KING_OFFSETS[i]
      if (!(a & 0x88) && b[a] === king) return true
    }
    const bishop = piece(by, BISHOP)
    const rook = piece(by, ROOK)
    const queen = piece(by, QUEEN)
    for (let i = 0; i < 4; i++) {
      const d = BISHOP_DIRS[i]
      a = sq + d
      while (!(a & 0x88)) {
        const p = b[a]
        if (p) {
          if (p === bishop || p === queen) return true
          break
        }
        a += d
      }
    }
    for (let i = 0; i < 4; i++) {
      const d = ROOK_DIRS[i]
      a = sq + d
      while (!(a & 0x88)) {
        const p = b[a]
        if (p) {
          if (p === rook || p === queen) return true
          break
        }
        a += d
      }
    }
    return false
  }

  inCheck(): boolean {
    return this.isAttacked(this.kingSq[this.side], this.side ^ 1)
  }

  /** Повторение позиции после последнего необратимого хода. */
  isRepetition(): boolean {
    const stop = Math.max(0, this.sp - this.halfmove)
    for (let i = this.sp - 2; i >= stop; i -= 2) {
      if (this.hashLoHistory[i] === this.hashLo && this.hashHiHistory[i] === this.hashHi) return true
    }
    return false
  }

  /** Сколько раз текущая позиция уже встречалась (для правила троекратного повторения). */
  repetitionCount(): number {
    let count = 0
    const stop = Math.max(0, this.sp - this.halfmove)
    for (let i = this.sp - 2; i >= stop; i -= 2) {
      if (this.hashLoHistory[i] === this.hashLo && this.hashHiHistory[i] === this.hashHi) count++
    }
    return count
  }

  /** Голые короли или король с одной лёгкой фигурой против короля. */
  insufficientMaterial(): boolean {
    return this.pawns[0] + this.pawns[1] === 0 && this.pieceWeight[0] + this.pieceWeight[1] <= 1
  }

  /**
   * Псевдолегальные ходы в буфер начиная с start; возвращает конец списка.
   * capturesOnly — только взятия и превращения в ферзя (для форсированного поиска).
   */
  generate(out: Int32Array, start: number, capturesOnly: boolean): number {
    const b = this.board
    const us = this.side
    const them = us ^ 1
    let n = start
    const forward = us === WHITE ? 16 : -16
    const startRank = us === WHITE ? 1 : 6
    const promoRank = us === WHITE ? 7 : 0

    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) {
        sq += 7
        continue
      }
      const p = b[sq]
      if (!p || p >> 3 !== us) continue
      const type = p & 7

      if (type === PAWN) {
        const to = sq + forward
        if (!(to & 0x88) && !b[to]) {
          if (to >> 4 === promoRank) {
            out[n++] = encode(sq, to, QUEEN)
            if (!capturesOnly) {
              out[n++] = encode(sq, to, ROOK)
              out[n++] = encode(sq, to, BISHOP)
              out[n++] = encode(sq, to, KNIGHT)
            }
          } else if (!capturesOnly) {
            out[n++] = encode(sq, to)
            const two = to + forward
            if (sq >> 4 === startRank && !b[two]) out[n++] = encode(sq, two, 0, FLAG_DOUBLE)
          }
        }
        for (let dx = -1; dx <= 1; dx += 2) {
          const t = to + dx
          if (t & 0x88) continue
          const target = b[t]
          if (target && target >> 3 === them) {
            if (t >> 4 === promoRank) {
              out[n++] = encode(sq, t, QUEEN, FLAG_CAPTURE)
              if (!capturesOnly) {
                out[n++] = encode(sq, t, ROOK, FLAG_CAPTURE)
                out[n++] = encode(sq, t, BISHOP, FLAG_CAPTURE)
                out[n++] = encode(sq, t, KNIGHT, FLAG_CAPTURE)
              }
            } else out[n++] = encode(sq, t, 0, FLAG_CAPTURE)
          } else if (t === this.ep) {
            out[n++] = encode(sq, t, 0, FLAG_CAPTURE | FLAG_EP)
          }
        }
        continue
      }

      if (type === KNIGHT || type === KING) {
        const offsets = type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS
        for (let i = 0; i < 8; i++) {
          const t = sq + offsets[i]
          if (t & 0x88) continue
          const target = b[t]
          if (!target) {
            if (!capturesOnly) out[n++] = encode(sq, t)
          } else if (target >> 3 === them) out[n++] = encode(sq, t, 0, FLAG_CAPTURE)
        }
        if (type === KING && !capturesOnly) n = this.genCastling(out, n, sq)
        continue
      }

      const dirs = type === BISHOP ? BISHOP_DIRS : type === ROOK ? ROOK_DIRS : KING_OFFSETS
      for (let i = 0; i < dirs.length; i++) {
        const d = dirs[i]
        let t = sq + d
        while (!(t & 0x88)) {
          const target = b[t]
          if (!target) {
            if (!capturesOnly) out[n++] = encode(sq, t)
          } else {
            if (target >> 3 === them) out[n++] = encode(sq, t, 0, FLAG_CAPTURE)
            break
          }
          t += d
        }
      }
    }
    return n
  }

  private genCastling(out: Int32Array, n: number, sq: number): number {
    const b = this.board
    const us = this.side
    const them = us ^ 1
    const home = us === WHITE ? 4 : 116
    if (sq !== home) return n
    const rook = piece(us, ROOK)
    const kRight = us === WHITE ? 1 : 4
    const qRight = us === WHITE ? 2 : 8
    if (this.castling & kRight && !b[home + 1] && !b[home + 2] && b[home + 3] === rook) {
      if (!this.isAttacked(home, them) && !this.isAttacked(home + 1, them) && !this.isAttacked(home + 2, them)) {
        out[n++] = encode(home, home + 2, 0, FLAG_CASTLE)
      }
    }
    if (this.castling & qRight && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === rook) {
      if (!this.isAttacked(home, them) && !this.isAttacked(home - 1, them) && !this.isAttacked(home - 2, them)) {
        out[n++] = encode(home, home - 2, 0, FLAG_CASTLE)
      }
    }
    return n
  }

  /** Все легальные ходы позиции. */
  legalMoves(): number[] {
    const buf = new Int32Array(256)
    const end = this.generate(buf, 0, false)
    const result: number[] = []
    for (let i = 0; i < end; i++) {
      if (this.make(buf[i])) {
        this.unmake()
        result.push(buf[i])
      }
    }
    return result
  }

  /** Ход в формате UCI (e2e4, e7e8q) → внутренний ход, либо 0, если он нелегален. */
  parseUci(uci: string): number {
    return this.legalMoves().find((m) => moveToUci(m) === uci) ?? 0
  }

  perft(depth: number): number {
    if (depth === 0) return 1
    const buf = new Int32Array(256)
    const end = this.generate(buf, 0, false)
    let nodes = 0
    for (let i = 0; i < end; i++) {
      if (!this.make(buf[i])) continue
      nodes += depth === 1 ? 1 : this.perft(depth - 1)
      this.unmake()
    }
    return nodes
  }
}
