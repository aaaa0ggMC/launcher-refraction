import { LEVELS } from './levels'
import { trace } from './engine'
import type { GameState, Level } from './types'

function integer(value: unknown): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '')
    return NaN
  const number = Number(value)
  return Number.isInteger(number) ? number : NaN
}

/** One in-memory board; no files, user data, network, or timers. */
export class RefractionGame {
  private level: Level = structuredClone(LEVELS[0])
  private history: Level[] = []
  private moves = 0
  private revision = 0
  private best: Record<number, number> = {}

  state(): GameState {
    return structuredClone({
      level: this.level,
      moves: this.moves,
      ...trace(this.level),
      canUndo: this.history.length > 0,
      best: this.best,
      revision: this.revision,
      levelCount: LEVELS.length
    })
  }

  act(action: 'load' | 'rotate' | 'undo' | 'reset', args: Record<string, unknown>): GameState {
    // Required optimistic revision protects against stale UI/CLI and double clicks.
    if (args.revision !== this.revision) throw new Error('refraction.error.stale')
    if (action === 'load') {
      const id = integer(args.level)
      if (!Number.isInteger(id) || id < 1 || id > LEVELS.length)
        throw new Error('refraction.error.level')
      this.level = structuredClone(LEVELS[id - 1])
      this.moves = 0
      this.history = []
    } else if (action === 'reset') {
      this.level = structuredClone(LEVELS[this.level.id - 1])
      this.moves = 0
      this.history = []
    } else if (action === 'undo') {
      const previous = this.history.pop()
      if (previous) {
        this.level = previous
        this.moves--
      }
    } else {
      if (trace(this.level).won) throw new Error('refraction.error.finished')
      const x = integer(args.x)
      const y = integer(args.y)
      if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('refraction.error.cell')
      const piece = this.level.pieces.find((p) => p.x === x && p.y === y)
      if (!piece || (piece.kind !== 'mirror' && piece.kind !== 'splitter'))
        throw new Error('refraction.error.cell')
      // Bounded history prevents an unattended agent growing memory without limit.
      if (this.history.length >= 512) throw new Error('refraction.error.limit')
      this.history.push(structuredClone(this.level))
      piece.flipped = !piece.flipped
      this.moves++
      if (trace(this.level).won)
        this.best[this.level.id] = Math.min(this.best[this.level.id] ?? Infinity, this.moves)
    }
    this.revision++
    return this.state()
  }
}
