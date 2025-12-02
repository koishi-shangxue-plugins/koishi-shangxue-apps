import { Context, h, Session } from "koishi"
import { Config } from "."
import { runInNewContext } from "vm"


/**
 * 在安全的沙箱环境中执行JS模板字符串
 * @param template - 包含 {{...}} 插值的模板字符串
 * @param ctx - Koishi 的 Context 对象
 * @param config - 插件配置
 * @param session - 当前会话对象
 * @returns 解析后的消息内容 (字符串或Satori元素)
 */
export async function executeTemplate(template: string, ctx: Context, config: Config, session: Session) {
  const elements = []
  const regex = /{{\s*(.*?)\s*}}/g
  let lastIndex = 0
  let match

  // 创建沙箱环境的上下文
  const sandbox = {
    ctx,
    config,
    h,
    session,
  }

  while ((match = regex.exec(template)) !== null) {
    // 添加插值前的纯文本部分
    if (match.index > lastIndex) {
      elements.push(h.text(template.substring(lastIndex, match.index)))
    }

    // 在沙箱中执行插值中的代码
    try {
      const result = runInNewContext(match[1], sandbox)
      elements.push(result)
    } catch (error) {
      ctx.logger('dialogue-webui').warn(`模板执行错误: ${error.message}\n模板: ${match[1]}`)
      elements.push(h.text(`[模板错误: ${error.message}]`))
    }

    lastIndex = regex.lastIndex
  }

  // 添加最后一个插值后的纯文本部分
  if (lastIndex < template.length) {
    elements.push(h.text(template.substring(lastIndex)))
  }

  return h.normalize(elements)
}
