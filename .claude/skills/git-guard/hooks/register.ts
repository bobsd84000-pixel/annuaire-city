import type { Engine, Register } from 'claude-code'

const PUSH = /\bgit\s+push\b/
const MAIN = /(^|[\s:/])main($|[\s:])/
const DENY = 'git-guard: push vers main bloqué. Utilise develop à la place : git push origin HEAD:develop'

const currentBranch = async ($: Engine) => {
  const { exitCode, stdout } = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])

  return exitCode === 0 ? stdout.trim() : ''
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!PUSH.test(e.command)) {
      return next(e)
    }

    if (MAIN.test(e.command)) {
      return { deny: DENY }
    }

    const hasTarget = /\bgit\s+push\s+\S+\s+\S+/.test(e.command)

    if (!hasTarget && (await currentBranch($)) === 'main') {
      return { deny: DENY }
    }

    return next(e)
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'git-guard: son contrôle a échoué, push bloqué par précaution.' },
  )
}
