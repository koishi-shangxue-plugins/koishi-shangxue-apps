import { Context, h, Session } from "koishi"
import type { Config } from "."
import { runInNewContext } from "vm"

export interface TemplateLogger {
  
  warn: (message: string) => void
}










export async function executeTemplate(template: string, ctx: Context, config: Config, session: Session, logger: TemplateLogger) {
  const elements = []
  const regex = /{{\s*(.*?)\s*}}/g
  let lastIndex = 0
  let match

  
  const sandbox = {
    ctx,
    config,
    h,
    session,
  }

  while ((match = regex.exec(template)) !== null) {
    
    if (match.index > lastIndex) {
      elements.push(h.text(template.substring(lastIndex, match.index)))
    }

    
    try {
      const result = runInNewContext(match[1], sandbox)
      elements.push(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.warn(`模板执行错误: ${errorMessage}\n模板: ${match[1]}`)
      elements.push(h.text(`[模板错误: ${errorMessage}]`))
    }

    lastIndex = regex.lastIndex
  }

  
  if (lastIndex < template.length) {
    elements.push(h.text(template.substring(lastIndex)))
  }

  return h.normalize(elements)
}
