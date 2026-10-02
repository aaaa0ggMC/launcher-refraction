import type { CommandSpec } from '../../main/process/commands/types'
import { defineExclusiveScopes } from '../../main/process/exclusive'
import { t } from '../../main/process/i18n'
import { RefractionGame } from './game'

const scopes = defineExclusiveScopes('refraction', { board: { label: 'refraction.exclusive' } })
const game = new RefractionGame()
const actions = ['load', 'rotate', 'undo', 'reset'] as const

export default [
  {
    name: 'refraction.state',
    description: t('refraction.cmd.state', '读取棋盘、光路、成绩与 revision'),
    run: () => game.state()
  },
  ...actions.map((action): CommandSpec => ({
    name: `refraction.${action}`,
    description: t(`refraction.cmd.${action}`),
    usage: `refraction.${action} --revision <revision>${action === 'load' ? ' --level <1..6>' : action === 'rotate' ? ' --x <列> --y <行>' : ''}`,
    exclusive: { scope: scopes.board, key: () => 'board' },
    run: ({ named }) => {
      try {
        return game.act(action, {
          ...named,
          revision:
            typeof named.revision === 'string' && named.revision.trim() !== ''
              ? Number(named.revision)
              : named.revision
        })
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('refraction.error.')) {
          throw new Error(t(error.message))
        }
        throw error
      }
    }
  }))
] satisfies CommandSpec[]
