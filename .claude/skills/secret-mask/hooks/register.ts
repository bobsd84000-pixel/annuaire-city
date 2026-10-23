import type { Register } from 'claude-code'

const SECRETS = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /eyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){0,2}/g,
  /postgres(?:ql)?:\/\/[^\s'"`<>]+/g,
]

const mask = (text: string) => SECRETS.reduce((out, re) => out.replace(re, '[masqué]'), text)

export const register: Register = on => {
  on('session.append', { door: 'tool-result' }, ($, e, next) => {
    const content = e.message.content

    if (typeof content === 'string') {
      return next({ ...e, message: { ...e.message, content: mask(content) } })
    }

    if (!Array.isArray(content)) {
      return next(e)
    }

    const blocks = content.map(block => {
      if (block.type === 'text') {
        return { ...block, text: mask(block.text) }
      }

      if (block.type === 'tool_result' && typeof block.content === 'string') {
        return { ...block, content: mask(block.content) }
      }

      if (block.type === 'tool_result' && Array.isArray(block.content)) {
        return {
          ...block,
          content: block.content.map(part =>
            part.type === 'text' ? { ...part, text: mask(part.text) } : part,
          ),
        }
      }

      return block
    })

    return next({ ...e, message: { ...e.message, content: blocks } })
  }).catch(($, e, next) =>
    next.called ? next(e) : next({ ...e, message: { ...e.message, content: '[sortie masquée : erreur du mod secret-mask]' } }),
  )
}
