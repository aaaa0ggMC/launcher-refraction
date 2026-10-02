import type { Level, Piece } from './types'

const source = (x: number, y: number): Piece => ({ x, y, kind: 'source', direction: 1 })
const mirror = (x: number, y: number, flipped = false): Piece => ({ x, y, kind: 'mirror', flipped })
const splitter = (x: number, y: number, flipped = false): Piece => ({
  x,
  y,
  kind: 'splitter',
  flipped
})
const beacon = (x: number, y: number): Piece => ({ x, y, kind: 'beacon' })
const rock = (x: number, y: number): Piece => ({ x, y, kind: 'rock' })

/** Hand-built puzzles, no random generation: every board has a verified solution. */
export const LEVELS: readonly Level[] = [
  { id: 1, size: 6, par: 1, pieces: [source(0, 3), mirror(3, 3, true), beacon(3, 0)] },
  {
    id: 2,
    size: 6,
    par: 2,
    pieces: [source(0, 4), mirror(4, 4, true), mirror(4, 1), beacon(1, 1), rock(2, 3)]
  },
  {
    id: 3,
    size: 6,
    par: 2,
    pieces: [
      source(0, 5),
      mirror(2, 5, true),
      mirror(2, 2),
      mirror(5, 2, true),
      beacon(5, 0),
      rock(3, 5),
      mirror(4, 4),
      rock(1, 1)
    ]
  },
  {
    id: 4,
    size: 6,
    par: 2,
    pieces: [
      source(0, 3),
      splitter(3, 3, true),
      mirror(5, 3),
      beacon(3, 0),
      beacon(5, 5),
      rock(1, 1)
    ]
  },
  {
    id: 5,
    size: 7,
    par: 2,
    pieces: [
      source(0, 4),
      splitter(2, 4),
      mirror(2, 1, true),
      splitter(4, 4),
      beacon(5, 1),
      beacon(4, 6),
      beacon(6, 4),
      rock(3, 3),
      mirror(1, 6)
    ]
  },
  {
    id: 6,
    size: 8,
    par: 5,
    pieces: [
      source(0, 6),
      mirror(2, 6, true),
      splitter(2, 3, true),
      mirror(2, 0),
      splitter(5, 3),
      mirror(5, 1),
      mirror(7, 3),
      mirror(7, 6, true),
      beacon(7, 0),
      beacon(3, 1),
      beacon(4, 6),
      rock(3, 5),
      rock(4, 2),
      mirror(0, 1)
    ]
  }
]
