export type Direction = 0 | 1 | 2 | 3 // north, east, south, west
export type PieceKind = 'source' | 'mirror' | 'splitter' | 'beacon' | 'rock'
export interface Piece {
  x: number
  y: number
  kind: PieceKind
  direction?: Direction
  flipped?: boolean // false: /, true: backslash; splitter also transmits straight
}
export interface Level {
  id: number
  size: number
  par: number
  pieces: Piece[]
}
export interface BeamSegment {
  x1: number
  y1: number
  x2: number
  y2: number
}
export interface GameState {
  level: Level
  moves: number
  beams: BeamSegment[]
  lit: string[] // 'x,y' beacon keys
  won: boolean
  canUndo: boolean
  best: Record<number, number> // session best, stays until app exits
  revision: number
  levelCount: number
}
