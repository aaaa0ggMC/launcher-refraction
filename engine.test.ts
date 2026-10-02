import { test } from 'node:test'
import assert from 'node:assert/strict'
import { trace } from './engine'
import { LEVELS } from './levels'
import { RefractionGame } from './game'

for (const level of LEVELS) {
  test(`level ${level.id}: solvable and par matches the minimum rotations`, () => {
    assert.equal(trace(level).won, false)
    const mirrors = level.pieces.filter((p) => p.kind === 'mirror' || p.kind === 'splitter')
    let minimum = Infinity
    for (let bits = 0; bits < 2 ** mirrors.length; bits++) {
      const board = structuredClone(level)
      let moves = 0
      mirrors.forEach((piece, i) => {
        if ((bits & (1 << i)) !== 0) {
          const mirror = board.pieces.find((p) => p.x === piece.x && p.y === piece.y)!
          mirror.flipped = !mirror.flipped
          moves++
        }
      })
      if (trace(board).won) minimum = Math.min(minimum, moves)
    }
    assert.equal(minimum, level.par)
  })
}

test('game revisions, win, undo, session best and snapshot isolation', () => {
  const game = new RefractionGame()
  const original = game.state()
  assert.throws(() => game.act('rotate', { x: 3, y: 3 }), /stale/)
  assert.throws(() => game.act('rotate', { x: 0, y: 0, revision: 0 }), /cell/)
  assert.throws(() => game.act('rotate', { x: null, y: 3, revision: 0 }), /cell/)
  assert.throws(() => game.act('load', { level: true, revision: 0 }), /level/)
  assert.equal(game.state().revision, 0)
  const won = game.act('rotate', { x: 3, y: 3, revision: 0 })
  assert.equal(won.won, true)
  assert.equal(won.best[1], 1)
  assert.throws(() => game.act('rotate', { x: 3, y: 3, revision: 1 }), /finished/)
  assert.throws(() => game.act('reset', { revision: 0 }), /stale/)
  const undone = game.act('undo', { revision: 1 })
  assert.equal(undone.won, false)
  assert.equal(undone.moves, 0)
  assert.deepEqual(undone.level, original.level)
  assert.equal(undone.best[1], 1)
  undone.level.pieces.length = 0
  assert.notEqual(game.state().level.pieces.length, 0)
  assert.throws(() => game.act('load', { level: 1.5, revision: 2 }), /level/)
  assert.throws(() => game.act('load', { level: 7, revision: 2 }), /level/)
  assert.equal(game.act('load', { level: 6, revision: 2 }).level.id, 6)
  assert.equal(game.act('reset', { revision: 3 }).moves, 0)
})

test('directed-cycle termination, branching and absorbing obstacles', () => {
  const result = trace({
    id: 1,
    size: 5,
    par: 0,
    pieces: [
      { x: 0, y: 2, kind: 'source', direction: 1 },
      { x: 2, y: 2, kind: 'splitter', flipped: true },
      { x: 2, y: 0, kind: 'mirror', flipped: false },
      { x: 4, y: 0, kind: 'mirror', flipped: true },
      { x: 4, y: 2, kind: 'mirror', flipped: false },
      { x: 2, y: 4, kind: 'beacon' }
    ]
  })
  assert.ok(result.beams.length <= 5 * 5 * 4)
  assert.deepEqual(result.lit, ['2,4'])
  assert.equal(result.won, true)
  assert.equal(
    trace({
      id: 1,
      size: 4,
      par: 0,
      pieces: [
        { x: 0, y: 1, kind: 'source', direction: 1 },
        { x: 1, y: 1, kind: 'rock' },
        { x: 2, y: 1, kind: 'beacon' }
      ]
    }).won,
    false
  )
})

test('bounded undo history can be recovered by undo or reset', () => {
  const game = new RefractionGame()
  let state = game.act('load', { level: 2, revision: 0 })
  for (let i = 0; i < 512; i++) {
    state = game.act('rotate', { x: 4, y: 4, revision: state.revision })
  }
  assert.equal(state.moves, 512)
  assert.throws(() => game.act('rotate', { x: 4, y: 4, revision: state.revision }), /limit/)
  state = game.act('undo', { revision: state.revision })
  assert.equal(state.moves, 511)
  state = game.act('rotate', { x: 4, y: 4, revision: state.revision })
  assert.equal(state.moves, 512)
  state = game.act('reset', { revision: state.revision })
  assert.equal(state.moves, 0)
  assert.equal(state.canUndo, false)
})
