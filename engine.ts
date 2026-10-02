import type { BeamSegment, Direction, Level } from './types'

const DELTAS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0]
] as const
const REFLECT = [
  [1, 0, 3, 2],
  [3, 2, 1, 0]
] as const

/** Trace directed cells once; cycles and intersecting split beams always terminate. */
export function trace(level: Level): { beams: BeamSegment[]; lit: string[]; won: boolean } {
  const pieces = new Map(level.pieces.map((p) => [`${p.x},${p.y}`, p]))
  const queue = level.pieces
    .filter((p) => p.kind === 'source')
    .map((p) => ({
      x: p.x,
      y: p.y,
      direction: p.direction ?? 1
    }))
  const visited = new Set<string>()
  const lit = new Set<string>()
  const beams: BeamSegment[] = []
  for (let i = 0; i < queue.length; i++) {
    const { x, y, direction } = queue[i]
    const key = `${x},${y},${direction}`
    if (visited.has(key)) continue
    visited.add(key)
    const [dx, dy] = DELTAS[direction]
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= level.size || ny >= level.size) {
      beams.push({ x1: x + 0.5, y1: y + 0.5, x2: x + 0.5 + dx * 0.5, y2: y + 0.5 + dy * 0.5 })
      continue
    }
    beams.push({ x1: x + 0.5, y1: y + 0.5, x2: nx + 0.5, y2: ny + 0.5 })
    const piece = pieces.get(`${nx},${ny}`)
    if (piece?.kind === 'beacon') {
      lit.add(`${nx},${ny}`)
      continue
    }
    if (piece?.kind === 'rock' || piece?.kind === 'source') continue
    if (piece?.kind === 'mirror' || piece?.kind === 'splitter') {
      queue.push({
        x: nx,
        y: ny,
        direction: REFLECT[piece.flipped ? 1 : 0][direction] as Direction
      })
      if (piece.kind === 'mirror') continue
    }
    queue.push({ x: nx, y: ny, direction })
  }
  const targets = level.pieces.filter((p) => p.kind === 'beacon')
  return {
    beams,
    lit: [...lit],
    won: targets.length > 0 && targets.every((p) => lit.has(`${p.x},${p.y}`))
  }
}
