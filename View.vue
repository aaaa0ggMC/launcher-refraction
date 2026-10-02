<script setup lang="ts">
defineOptions({ name: 'cockpit-refraction' })

import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { useI18n } from '@ui/i18n'
import type { Direction, GameState, Piece, PieceKind } from './types'

const uiLang = inject('cockpit:lang', ref('zh')) as Ref<string>
const { t, te } = useI18n(uiLang)

/** te() only accepts string vars — these templates interpolate board counters. */
function tv(key: string, vars: Record<string, string | number>): string {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(vars)) out[k] = String(v)
  return te(key, out)
}

/** Poll the engine while the page is mounted so CLI actions show up too. */
const POLL_INTERVAL_MS = 1500

/** Rotation for the source arrow in its cell-local 0 0 1 1 viewBox (y grows down). */
const DIR_ANGLES: Record<Direction, number> = { 0: 0, 1: 90, 2: 180, 3: 270 }
const DIR_KEYS: Record<Direction, string> = {
  0: 'refraction.direction.north',
  1: 'refraction.direction.east',
  2: 'refraction.direction.south',
  3: 'refraction.direction.west'
}
const KIND_KEYS: Record<PieceKind, string> = {
  source: 'refraction.kind.source',
  mirror: 'refraction.kind.mirror',
  splitter: 'refraction.kind.splitter',
  beacon: 'refraction.kind.beacon',
  rock: 'refraction.kind.rock'
}

interface Cell {
  x: number
  y: number
  piece?: Piece
}

type Glyph = 'source' | 'splitter' | 'beaconLit' | 'beaconDark' | 'rock' | 'none'

const state = ref<GameState | null>(null)
const initialLoading = ref(true)
const errorMsg = ref('')
const pending = ref(0)
const newRecord = ref(false)
let pollTimer: ReturnType<typeof setInterval> | null = null

const busy = computed<boolean>(() => pending.value > 0 || initialLoading.value)
const size = computed<number>(() => state.value?.level.size ?? 0)
const beams = computed(() => state.value?.beams ?? [])
const litSet = computed<Set<string>>(() => new Set(state.value?.lit ?? []))
const litCount = computed<number>(() => state.value?.lit.length ?? 0)
const beaconTotal = computed<number>(
  () => (state.value?.level.pieces ?? []).filter((p) => p.kind === 'beacon').length
)
/** Row-major cell list (1-based coordinates, matching the engine's x/y - 1 grid). */
const cells = computed<Cell[]>(() => {
  const n = size.value
  const map = new Map<string, Piece>()
  for (const p of state.value?.level.pieces ?? []) map.set(`${p.x},${p.y}`, p)
  const list: Cell[] = []
  for (let y = 1; y <= n; y++) {
    for (let x = 1; x <= n; x++) list.push({ x, y, piece: map.get(`${x - 1},${y - 1}`) })
  }
  return list
})
const levels = computed<number[]>(() => {
  const count = state.value?.levelCount ?? 0
  return Array.from({ length: count }, (_, i) => i + 1)
})
const isFinalLevel = computed<boolean>(() => {
  const cur = state.value?.level.id
  return cur !== undefined && cur >= (state.value?.levelCount ?? 0)
})

/* ------------------------------------------------------------------ *
 * Request plumbing — one serialized chain so stale results never win  *
 * ------------------------------------------------------------------ */

let chain: Promise<unknown> = Promise.resolve()

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  chain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function call<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  pending.value += 1
  try {
    return (await window.cockpit.command(name, args)) as T
  } finally {
    pending.value -= 1
  }
}

function readable(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Refresh the board without disturbing an error message the user should see. */
async function quietRefresh(): Promise<void> {
  try {
    state.value = await call<GameState>('refraction.state')
  } catch {
    /* 刷新失败时保留当前棋盘，下一次轮询会再试 */
  }
}

function applyState(next: GameState): void {
  const prev = state.value
  state.value = next
  if (prev && prev.level.id !== next.level.id) newRecord.value = false
  if (!next.won) {
    newRecord.value = false
    return
  }
  if (prev && !prev.won) {
    const before = prev.best[next.level.id]
    const now = next.best[next.level.id]
    newRecord.value = before !== undefined && now !== undefined && now < before
  }
}

async function load(): Promise<void> {
  await enqueue(async () => {
    initialLoading.value = true
    try {
      state.value = await call<GameState>('refraction.state')
      errorMsg.value = ''
      newRecord.value = false
    } catch (e) {
      errorMsg.value = readable(e)
    } finally {
      initialLoading.value = false
    }
  })
}

async function poll(): Promise<void> {
  if (initialLoading.value) return
  await enqueue(async () => {
    try {
      state.value = await call<GameState>('refraction.state')
    } catch {
      /* 轮询失败静默：命令队列可能正忙，下一轮再取 */
    }
  })
}

/** Every mutation carries the revision of the state the UI is showing. */
async function mutate(name: string, args: Record<string, unknown> = {}): Promise<void> {
  const revision = state.value?.revision
  if (revision === undefined) return
  await enqueue(async () => {
    try {
      applyState(await call<GameState>(name, { ...args, revision }))
      errorMsg.value = ''
    } catch (e) {
      errorMsg.value = readable(e)
      await quietRefresh()
    }
  })
}

function rotate(piece?: Piece): void {
  if (!piece) return
  void mutate('refraction.rotate', { x: piece.x, y: piece.y })
}

function undo(): void {
  void mutate('refraction.undo')
}

function reset(): void {
  void mutate('refraction.reset')
}

function loadLevel(level: number): void {
  void mutate('refraction.load', { level })
}

onMounted(() => {
  void load()
  pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer !== null) clearInterval(pollTimer)
  pollTimer = null
})

/* ------------------------------------------------------------------ *
 * Presentation helpers                                               *
 * ------------------------------------------------------------------ */

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${size.value}, minmax(40px, 1fr))`,
  gridTemplateRows: `repeat(${size.value}, minmax(40px, 1fr))`
}))

function isRotatable(piece?: Piece): boolean {
  return piece?.kind === 'mirror' || piece?.kind === 'splitter'
}

/** Look up a cell by 1-based grid coordinates for the template loops. */
function cellOf(x: number, y: number): Cell {
  const list = cells.value
  const index = (y - 1) * size.value + (x - 1)
  return list[index] ?? { x, y }
}

function isLit(cell: Cell): boolean {
  return litSet.value.has(`${cell.x - 1},${cell.y - 1}`)
}

function glyphOf(cell: Cell): Glyph {
  const kind = cell.piece?.kind
  if (kind === 'source') return 'source'
  if (kind === 'splitter') return 'splitter'
  if (kind === 'rock') return 'rock'
  if (kind === 'beacon') return isLit(cell) ? 'beaconLit' : 'beaconDark'
  return 'none'
}

function kindLabel(piece?: Piece): string {
  if (piece?.kind === 'beacon') {
    return t(
      piece && litSet.value.has(`${piece.x},${piece.y}`)
        ? 'refraction.kind.beaconLit'
        : 'refraction.kind.beaconUnlit'
    )
  }
  return piece ? t(KIND_KEYS[piece.kind]) : t('refraction.kind.empty')
}

function cellLabel(cell: Cell): string {
  const row = String(cell.y)
  const col = String(cell.x)
  const piece = cell.piece
  if (!piece) return te('refraction.cellEmpty', { row, col })
  if (piece.kind === 'source' && piece.direction !== undefined) {
    return te('refraction.cellSource', { row, col, dir: t(DIR_KEYS[piece.direction]) })
  }
  if (piece.kind === 'mirror') {
    return te('refraction.cellMirror', {
      row,
      col,
      kind: kindLabel(piece),
      mirror: t(piece.flipped ? 'refraction.orientation.backslash' : 'refraction.orientation.slash')
    })
  }
  return te('refraction.cell', { row, col, kind: kindLabel(piece) })
}

/** Mirror / splitter geometry inside a cell-local 0 0 1 1 viewBox. */
function mirrorLine(piece?: Piece): { x1: number; y1: number; x2: number; y2: number } {
  return piece?.flipped
    ? { x1: 0.12, y1: 0.12, x2: 0.88, y2: 0.88 }
    : { x1: 0.12, y1: 0.88, x2: 0.88, y2: 0.12 }
}

function sourceAngle(piece?: Piece): number {
  return DIR_ANGLES[piece?.direction ?? 0]
}

function bestLabel(levelId: number): string {
  const best = state.value?.best[levelId]
  return best === undefined
    ? t('refraction.status.noBest')
    : tv('refraction.status.best', { n: best })
}

function levelName(levelId: number): string {
  return t(`refraction.level.${levelId}.name`, t('refraction.level.unknown'))
}

function levelHint(levelId: number): string {
  return t(`refraction.level.${levelId}.hint`)
}
</script>

<template>
  <div class="ref-root">
    <!-- header -->
    <div class="ref-header">
      <div class="ref-heading">
        <div class="text-h6 font-weight-medium">{{ t('refraction.title') }}</div>
        <div class="text-body-2 text-medium-emphasis mt-1 ref-premise">
          {{ t('refraction.premise') }}
        </div>
        <div class="text-caption text-medium-emphasis mt-2 ref-notice">
          <v-icon size="small" class="mr-1">mdi-memory</v-icon>
          {{ t('refraction.sessionNotice') }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1 ref-notice">
          <v-icon size="small" class="mr-1">mdi-hand-back-right</v-icon>
          {{ te('refraction.exclusiveNotice', { what: t('refraction.exclusive') }) }}
        </div>
      </div>
      <div class="d-flex align-center ga-2 flex-wrap ref-toolbar">
        <v-btn
          variant="tonal"
          prepend-icon="mdi-undo"
          :disabled="busy || !state?.canUndo"
          :title="t('refraction.undo')"
          @click="undo"
        >
          {{ t('refraction.undo') }}
        </v-btn>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-restore"
          :disabled="busy || !state"
          :title="t('refraction.reset')"
          @click="reset"
        >
          {{ t('refraction.reset') }}
        </v-btn>
        <v-btn
          variant="tonal"
          prepend-icon="mdi-refresh"
          :disabled="busy || !state"
          :title="t('refraction.refresh')"
          @click="load"
        >
          {{ t('refraction.refresh') }}
        </v-btn>
      </div>
    </div>

    <!-- initial loading skeleton -->
    <v-card v-if="initialLoading" variant="tonal" rounded="lg" class="mt-4 pa-6">
      <div class="d-flex align-center ga-3">
        <v-progress-circular indeterminate size="24" />
        <div class="text-body-1">{{ t('refraction.loading') }}</div>
      </div>
      <div class="ref-skeleton mt-4" />
    </v-card>

    <!-- errors (initial load or a failed action) -->
    <v-alert v-if="errorMsg" type="error" variant="tonal" rounded="lg" class="mt-4" border="start">
      <div class="d-flex align-center flex-wrap ga-3">
        <div class="flex-grow-1">{{ errorMsg }}</div>
        <v-btn variant="tonal" prepend-icon="mdi-reload" :disabled="busy" @click="load">
          {{ t('refraction.retry') }}
        </v-btn>
      </div>
    </v-alert>

    <template v-if="state && !initialLoading">
      <!-- board + controls -->
      <div class="ref-stage mt-4">
        <div class="ref-board-col">
          <div class="ref-board-frame">
            <svg
              class="ref-beams"
              :viewBox="`0 0 ${size} ${size}`"
              aria-hidden="true"
              focusable="false"
            >
              <line
                v-for="(b, i) in beams"
                :key="`glow-${i}`"
                class="ref-beam-glow"
                :x1="b.x1"
                :y1="b.y1"
                :x2="b.x2"
                :y2="b.y2"
              />
              <line
                v-for="(b, i) in beams"
                :key="`beam-${i}`"
                class="ref-beam"
                :x1="b.x1"
                :y1="b.y1"
                :x2="b.x2"
                :y2="b.y2"
              />
            </svg>
            <div
              class="ref-grid"
              role="group"
              :aria-label="t('refraction.board')"
              :style="gridStyle"
            >
              <template v-for="y in size" :key="`row-${y}`">
                <button
                  v-for="x in size"
                  :key="`cell-${x}-${y}`"
                  type="button"
                  class="ref-cell ref-cell-btn"
                  :class="{
                    'ref-cell-piece': cellOf(x, y)?.piece,
                    'ref-cell-won': state.won
                  }"
                  :disabled="busy || state.won || !isRotatable(cellOf(x, y)?.piece)"
                  :aria-label="cellLabel(cellOf(x, y))"
                  :title="
                    isRotatable(cellOf(x, y)?.piece)
                      ? t('refraction.rotateTip')
                      : cellLabel(cellOf(x, y))
                  "
                  :data-coord="`${x},${y}`"
                  @click="rotate(cellOf(x, y)?.piece)"
                >
                  <svg class="ref-glyph" viewBox="0 0 1 1" aria-hidden="true" focusable="false">
                    <g
                      v-if="glyphOf(cellOf(x, y)) === 'source'"
                      :transform="`translate(0.5 0.5) rotate(${sourceAngle(cellOf(x, y)?.piece)})`"
                    >
                      <path
                        class="ref-source"
                        d="M 0 -0.3 L 0.18 -0.04 L 0.07 -0.04 L 0.07 0.28 L -0.07 0.28 L -0.07 -0.04 L -0.18 -0.04 Z"
                      />
                    </g>
                    <template v-if="glyphOf(cellOf(x, y)) === 'splitter'">
                      <line class="ref-cross" x1="0.5" y1="0.1" x2="0.5" y2="0.9" />
                      <line class="ref-cross" x1="0.1" y1="0.5" x2="0.9" y2="0.5" />
                    </template>
                    <line
                      v-if="glyphOf(cellOf(x, y)) === 'splitter'"
                      class="ref-mirror"
                      v-bind="mirrorLine(cellOf(x, y)?.piece)"
                    />
                    <circle
                      v-if="glyphOf(cellOf(x, y)) === 'beaconLit'"
                      class="ref-beacon-glow"
                      cx="0.5"
                      cy="0.5"
                      r="0.34"
                    />
                    <circle
                      v-if="glyphOf(cellOf(x, y)) === 'beaconLit'"
                      class="ref-beacon-lit"
                      cx="0.5"
                      cy="0.5"
                      r="0.22"
                    />
                    <circle
                      v-if="glyphOf(cellOf(x, y)) === 'beaconDark'"
                      class="ref-beacon-dark"
                      cx="0.5"
                      cy="0.5"
                      r="0.2"
                    />
                    <polygon
                      v-if="glyphOf(cellOf(x, y)) === 'rock'"
                      class="ref-rock"
                      points="0.5,0.12 0.85,0.31 0.85,0.69 0.5,0.88 0.15,0.69 0.15,0.31"
                    />
                  </svg>
                </button>
              </template>
            </div>
          </div>

          <!-- legend -->
          <v-card variant="tonal" rounded="lg" class="mt-4 pa-4">
            <div class="text-subtitle-2 font-weight-medium mb-3">
              {{ t('refraction.legend.title') }}
            </div>
            <div class="ref-legend">
              <div class="ref-legend-item">
                <span class="ref-legend-key">
                  <svg class="ref-glyph" viewBox="0 0 1 1" aria-hidden="true">
                    <g transform="translate(0.5 0.5)">
                      <path
                        class="ref-source"
                        d="M 0 -0.3 L 0.18 -0.04 L 0.07 -0.04 L 0.07 0.28 L -0.07 0.28 L -0.07 -0.04 L -0.18 -0.04 Z"
                      />
                    </g>
                  </svg>
                </span>
                <span>{{ t('refraction.legend.source') }}</span>
              </div>
              <div class="ref-legend-item">
                <span class="ref-legend-key">
                  <svg class="ref-glyph" viewBox="0 0 1 1" aria-hidden="true">
                    <line class="ref-mirror" x1="0.12" y1="0.88" x2="0.88" y2="0.12" />
                  </svg>
                </span>
                <span>{{ t('refraction.legend.mirror') }}</span>
              </div>
              <div class="ref-legend-item">
                <span class="ref-legend-key">
                  <svg class="ref-glyph" viewBox="0 0 1 1" aria-hidden="true">
                    <line class="ref-cross" x1="0.5" y1="0.12" x2="0.5" y2="0.88" />
                    <line class="ref-cross" x1="0.12" y1="0.5" x2="0.88" y2="0.5" />
                    <line class="ref-mirror" x1="0.12" y1="0.88" x2="0.88" y2="0.12" />
                  </svg>
                </span>
                <span>{{ t('refraction.legend.splitter') }}</span>
              </div>
              <div class="ref-legend-item">
                <span class="ref-legend-key">
                  <svg class="ref-glyph" viewBox="0 0 1 1" aria-hidden="true">
                    <circle class="ref-beacon-glow" cx="0.5" cy="0.5" r="0.34" />
                    <circle class="ref-beacon-lit" cx="0.5" cy="0.5" r="0.22" />
                  </svg>
                </span>
                <span>{{ t('refraction.legend.beacon') }}</span>
              </div>
              <div class="ref-legend-item">
                <span class="ref-legend-key">
                  <svg class="ref-glyph" viewBox="0 0 1 1" aria-hidden="true">
                    <polygon
                      class="ref-rock"
                      points="0.5,0.12 0.85,0.31 0.85,0.69 0.5,0.88 0.15,0.69 0.15,0.31"
                    />
                  </svg>
                </span>
                <span>{{ t('refraction.legend.rock') }}</span>
              </div>
              <div class="ref-legend-item">
                <span class="ref-legend-key ref-legend-beam">
                  <span class="ref-beam-demo" />
                </span>
                <span>{{ t('refraction.legend.beam') }}</span>
              </div>
            </div>
          </v-card>
        </div>

        <!-- side panel -->
        <div class="ref-side">
          <v-card variant="tonal" rounded="lg" class="pa-4">
            <div class="d-flex align-center ga-2 flex-wrap mb-3">
              <v-chip class="ref-chip">
                <v-icon start size="small">mdi-lighthouse</v-icon>
                {{ tv('refraction.status.lit', { lit: litCount, total: beaconTotal }) }}
              </v-chip>
              <v-chip class="ref-chip">
                <v-icon start size="small">mdi-counter</v-icon>
                {{ tv('refraction.status.moves', { moves: state.moves, par: state.level.par }) }}
              </v-chip>
              <v-chip class="ref-chip">
                <v-icon start size="small">mdi-trophy-outline</v-icon>
                {{ bestLabel(state.level.id) }}
              </v-chip>
            </div>
            <div class="text-subtitle-1 font-weight-medium">
              {{ tv('refraction.level.label', { n: state.level.id }) }}
              <span class="text-medium-emphasis">· {{ levelName(state.level.id) }}</span>
            </div>
            <div class="text-body-2 text-medium-emphasis mt-2">
              {{ tv('refraction.levelCount', { n: state.levelCount }) }}
            </div>
            <div class="text-subtitle-2 font-weight-medium mt-4">
              {{ t('refraction.status.hint') }}
            </div>
            <div class="text-body-2 text-medium-emphasis mt-1">
              {{ levelHint(state.level.id) }}
            </div>
          </v-card>

          <v-card v-if="state.won" variant="tonal" rounded="lg" class="pa-4 mt-4 ref-win-card">
            <div class="text-h6 font-weight-medium">
              {{ isFinalLevel ? t('refraction.win.final') : t('refraction.win.title') }}
            </div>
            <div class="text-body-2 text-medium-emphasis mt-2">
              {{ tv('refraction.win.moves', { moves: state.moves, par: state.level.par }) }}
            </div>
            <div v-if="newRecord" class="text-body-2 font-weight-medium mt-1 ref-record">
              {{ t('refraction.win.newBest') }}
            </div>
            <div class="text-body-2 text-medium-emphasis mt-2">
              {{ bestLabel(state.level.id) }}
            </div>
            <div v-if="isFinalLevel" class="text-body-2 text-medium-emphasis mt-2">
              {{ t('refraction.win.finalTip') }}
            </div>
            <div class="d-flex ga-2 flex-wrap mt-4">
              <v-btn
                v-if="!isFinalLevel"
                variant="flat"
                color="primary"
                prepend-icon="mdi-page-next"
                :disabled="busy"
                @click="loadLevel(state.level.id + 1)"
              >
                {{ t('refraction.win.next') }}
              </v-btn>
              <v-btn variant="tonal" prepend-icon="mdi-restart" :disabled="busy" @click="reset">
                {{ t('refraction.win.replay') }}
              </v-btn>
            </div>
          </v-card>
          <v-card v-else variant="tonal" rounded="lg" class="pa-4 mt-4">
            <div class="text-body-2 text-medium-emphasis">
              {{ tv('refraction.status.idle', { lit: litCount, total: beaconTotal }) }}
            </div>
          </v-card>
        </div>
      </div>

      <!-- level picker -->
      <v-card variant="tonal" rounded="lg" class="mt-4 pa-4">
        <div class="d-flex align-center flex-wrap ga-3 mb-3">
          <div class="text-subtitle-2 font-weight-medium">
            {{ t('refraction.picker.title') }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ t('refraction.picker.allUnlocked') }}
          </div>
        </div>
        <div class="d-flex flex-wrap ga-2">
          <v-btn
            v-for="level in levels"
            :key="level"
            variant="tonal"
            :color="level === state.level.id ? 'primary' : undefined"
            :prepend-icon="
              state.best[level] !== undefined ? 'mdi-check-circle' : 'mdi-circle-outline'
            "
            :disabled="busy || level === state.level.id"
            :aria-label="tv('refraction.picker.item', { level, name: levelName(level) })"
            @click="loadLevel(level)"
          >
            {{ tv('refraction.level.label', { n: level }) }}
            <span class="text-medium-emphasis ml-2">{{ levelName(level) }}</span>
          </v-btn>
        </div>
      </v-card>
    </template>
  </div>
</template>

<style scoped>
.ref-root {
  display: flex;
  flex-direction: column;
}

.ref-header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.ref-premise {
  max-width: 62ch;
}

.ref-notice {
  max-width: 72ch;
}

.ref-skeleton {
  height: 96px;
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

/* ---- layout: board left, controls right, wraps below when narrow ---- */
.ref-stage {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 24px;
}

.ref-board-col {
  flex: 1 1 420px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
}

.ref-side {
  flex: 1 1 300px;
  min-width: 260px;
}

/* ---- board ---- */
.ref-board-frame {
  position: relative;
  width: 100%;
  max-width: 560px;
  aspect-ratio: 1 / 1;
  margin: 0 auto;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background:
    radial-gradient(circle at 50% 38%, rgba(var(--v-theme-primary), 0.1), transparent 65%),
    linear-gradient(
      160deg,
      rgba(var(--v-theme-surface-variant), 0.9),
      rgba(var(--v-theme-surface), 0.9)
    );
  box-shadow: inset 0 0 40px rgba(var(--v-theme-primary), 0.06);
}

.ref-beams {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 0;
}

.ref-grid {
  position: absolute;
  inset: 0;
  display: grid;
  z-index: 1;
}

.ref-cell {
  min-width: 0;
  min-height: 0;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 8px;
  background: transparent;
  overflow: hidden;
}

.ref-cell-piece {
  background: rgba(var(--v-theme-surface), 0.34);
}

.ref-cell-btn {
  appearance: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    transform 120ms ease;
}

.ref-cell-btn:hover:not(:disabled) {
  background: rgba(var(--v-theme-primary), 0.16);
}

.ref-cell-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.ref-cell-btn:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.ref-cell-btn:disabled {
  cursor: default;
}

.ref-cell-btn.ref-cell-won:disabled {
  background: rgba(var(--v-theme-primary), 0.12);
}

.ref-glyph {
  width: 76%;
  height: 76%;
  display: block;
}

/* ---- glyphs (all theme following) ---- */
.ref-beam {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 0.07;
  stroke-linecap: round;
  fill: none;
  opacity: 0.95;
}

.ref-beam-glow {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 0.22;
  stroke-linecap: round;
  fill: none;
  opacity: 0.18;
}

.ref-mirror {
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 0.1;
  stroke-linecap: round;
}

.ref-cross {
  stroke: rgba(var(--v-theme-on-surface), 0.55);
  stroke-width: 0.06;
  stroke-linecap: round;
}

.ref-source {
  fill: rgb(var(--v-theme-primary));
  stroke: rgba(var(--v-theme-primary), 0.35);
  stroke-width: 0.02;
}

.ref-beacon-lit {
  fill: rgb(var(--v-theme-primary));
}

.ref-beacon-glow {
  fill: rgba(var(--v-theme-primary), 0.25);
}

.ref-beacon-dark {
  fill: none;
  stroke: rgba(var(--v-theme-on-surface), 0.55);
  stroke-width: 0.07;
}

.ref-rock {
  fill: rgba(var(--v-theme-on-surface), 0.35);
  stroke: rgba(var(--v-theme-on-surface), 0.45);
  stroke-width: 0.03;
}

/* ---- legend ---- */
.ref-legend {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px 20px;
}

.ref-legend-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
}

.ref-legend-key {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-surface), 0.4);
}

.ref-beam-demo {
  display: block;
  width: 18px;
  height: 3px;
  border-radius: 2px;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 8px rgba(var(--v-theme-primary), 0.7);
}

/* ---- side panel ---- */
.ref-chip {
  padding-block: 4px;
  min-height: 24px;
}

.ref-win-card {
  border: 1px solid rgba(var(--v-theme-primary), 0.35);
}

.ref-record {
  color: rgb(var(--v-theme-primary));
}

/* ---- narrow containers: stack the board above the controls ---- */
@media (max-width: 560px) {
  .ref-board-col,
  .ref-side {
    flex-basis: 100%;
  }
}
</style>
