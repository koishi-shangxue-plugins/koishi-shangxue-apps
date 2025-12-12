import { Bot, Context, Universal, h, Fragment, Session } from 'koishi'
import { Config, logInfo, logDebug, loggerError, loggerInfo } from './index'

export class NextChatBot extends Bot {
  static inject = ['server']

  constructor(ctx: Context, config: Config) {
    super(ctx, config, 'nextchat');
    this.selfId = config.selfId || 'nextchat';
    this.user.name = config.selfname || 'nextchat';
    this.user.avatar = config.selfavatar || 'https://avatars.githubusercontent.com/u/153288546';
    this.platform = 'nextchat';
  }

  async start() {
    await super.start()
    this.online()
    const globalBot = this.ctx.bots.find(b => b.platform === 'nextchat' && b.selfId === this.selfId)
    if (globalBot) {
      logInfo(`[${this.selfId}] Bot已成功注册`)
    } else {
      loggerError(`[${this.selfId}] Bot未能注册！`)
    }
  }

  async stop() {
    this.offline()
    await super.stop()
  }

  // 用于存储待处理的请求响应
  private pendingResponses = new Map<string, {
    resolve: (content: string) => void
    messages: string[]
    timer?: NodeJS.Timeout
  }>();

  // 处理 OpenAI 格式的聊天完成请求
  async handleChatCompletion(body: any): Promise<any> {
    const { messages, stream = false, model = 'gpt-3.5-turbo' } = body;

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      loggerError(`[${this.selfId}] 未找到用户消息`);
      return this.createResponse('没有找到用户消息。', model, stream);
    }

    const userMessage = lastUserMessage.content.trim();
    const userId = body.user || this.config.userId || 'anonymous';
    const username = body.username || this.config.username || 'anonymous';
    const channelId = `private:${userId}`;

    logInfo(`[${this.selfId}] 处理用户消息: "${userMessage}"`, { userId, channelId });

    // 检查是否是 NextChat 的新对话提示词
    if (userMessage.includes('使用四到五个字直接返回这句话的简要主题') &&
      userMessage.includes('不要解释、不要标点、不要语气词、不要多余文本')) {
      logInfo(`[${this.selfId}] 检测到新对话提示词，返回固定文本`);
      return this.createResponse('新的聊天', model, stream);
    }

    try {
      // 创建一个 Promise 来等待响应
      const responsePromise = new Promise<string>((resolve) => {
        this.pendingResponses.set(channelId, {
          resolve,
          messages: []
        });
      });

      // 创建并分发 session
      const session = this.createSession(userMessage, userId, username, channelId);
      logInfo(`[${this.selfId}] 分发 session:`, session);

      // 通过 dispatch 分发会话，让 Koishi 中间件系统处理
      this.dispatch(session);

      // 等待响应（设置超时）
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('响应超时')), 30 * 1000);
      });

      const responseContent = await Promise.race([responsePromise, timeoutPromise]);

      logInfo(`[${this.selfId}] 完整响应内容:`, responseContent);
      return this.createResponse(responseContent || ' ', model, stream);

    } catch (error) {
      // loggerError(`[${this.selfId}] 处理消息出错:`, error);
      return this.createResponse(``, model, stream);
    } finally {
      // 清理待处理的响应和定时器
      const pending = this.pendingResponses.get(channelId);
      if (pending?.timer) {
        clearTimeout(pending.timer);
      }
      this.pendingResponses.delete(channelId);
    }
  }

  // 创建 session
  private createSession(content: string, userId: string, username: string, channelId: string) {
    const session = this.session({
      type: 'message',
      subtype: 'private',
      platform: 'nextchat',
      selfId: this.selfId,
      timestamp: Date.now(),
      channel: {
        id: channelId,
        type: Universal.Channel.Type.DIRECT,
      },
      user: {
        id: userId,
        name: username,
      },
      message: {
        id: Date.now().toString(),
        content: content,
        elements: h.parse(content),
      },
    });

    session.content = content;
    session.channelId = channelId;
    session.isDirect = true;

    return session;
  }

  // 创建响应对象
  private createResponse(content: string, model: string, stream: boolean) {
    if (stream) {
      return {
        __isStream: true,
        content,
        model
      }
    } else {
      return {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        }],
        usage: {
          prompt_tokens: this.estimateTokens(content),
          completion_tokens: this.estimateTokens(content),
          total_tokens: this.estimateTokens(content) * 2,
        },
      }
    }
  }

  // 将 Fragment 转换为字符串
  private fragmentToString(fragment: Fragment): string {
    logInfo(`[${this.selfId}] fragmentToString 输入类型:`, typeof fragment, Array.isArray(fragment))

    if (typeof fragment === 'string') {
      logInfo(`[${this.selfId}] 是字符串:`, fragment)
      return fragment
    }

    if (Array.isArray(fragment)) {
      logInfo(`[${this.selfId}] 是数组，长度:`, fragment.length)
      // 递归处理数组中的每个元素
      const result = fragment.map((item, index) => {
        logInfo(`[${this.selfId}] 处理数组元素 ${index}:`, typeof item, item)
        return this.fragmentToString(item)
      }).join('')
      logInfo(`[${this.selfId}] 数组处理结果:`, result.substring(0, 100))
      return result
    }

    if (fragment && typeof fragment === 'object' && 'type' in fragment) {
      const element = fragment as h
      logInfo(`[${this.selfId}] 是 h 元素，类型:`, element.type)

      const result = h.transform([element], {
        text: (attrs) => {
          logInfo(`[${this.selfId}] 处理 text:`, attrs.content)
          return attrs.content
        },
        image: (attrs) => {
          const url = attrs.src || attrs.url || ''
          logInfo(`[${this.selfId}] 处理 image, URL长度:`, url.length)
          return `![image](${url})`
        },
        img: (attrs) => {
          const url = attrs.src || attrs.url || ''
          logInfo(`[${this.selfId}] 处理 image, URL长度:`, url.length)
          return `![image](${url})`
        },
        audio: (attrs) => {
          const url = attrs.src || attrs.url || ''
          return `[音频: ${url}]`
        },
        video: (attrs) => {
          const url = attrs.src || attrs.url || ''
          return `![video](${url})`
        },
        at: (attrs) => `@${attrs.name || attrs.id}`,
        quote: (attrs, children) => `> ${children.join('')}`,
        p: (attrs, children) => {
          // p 元素：递归处理子元素
          logInfo(`[${this.selfId}] 处理 p 元素，子元素数量:`, children.length)
          return children.join('')
        },
        default: (attrs, children) => {
          // 默认处理：递归处理子元素
          logInfo(`[${this.selfId}] 使用 default 处理，类型:`, element.type, `子元素数量:`, children.length)
          return children.join('')
        },
      }).join('')

      logInfo(`[${this.selfId}] h元素处理结果长度:`, result.length)
      return result
    }

    logInfo(`[${this.selfId}] 其他类型，转为字符串:`, fragment)
    return String(fragment)
  }

  // 简单的 token 估算
  private estimateTokens(text: string): number {
    return Math.ceil(text.length * 0.75)
  }

  // 创建流式响应
  createStreamResponse(content: string, model: string) {
    const chunks = []
    const words = content.split('')
    chunks.push({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        delta: { role: 'assistant' },
        finish_reason: null,
      }],
    })
    for (let i = 0; i < words.length; i++) {
      chunks.push({
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{
          index: 0,
          delta: { content: words[i] },
          finish_reason: null,
        }],
      })
    }
    chunks.push({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        delta: {},
        finish_reason: 'stop',
      }],
    })
    return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'
  }

  async sendMessage(channelId: string, content: Fragment): Promise<string[]> {
    logInfo(`[${this.selfId}] sendMessage 被调用`, { channelId })
    logInfo(`[${this.selfId}] Fragment 类型:`, typeof content, Array.isArray(content))

    const pending = this.pendingResponses.get(channelId);
    if (pending) {
      const contentStr = this.fragmentToString(content);
      logInfo(`[${this.selfId}] 转换后的内容长度:`, contentStr.length)
      logInfo(`[${this.selfId}] 转换后的内容前100字符:`, contentStr.substring(0, 100))
      pending.messages.push(contentStr);

      // 使用 setTimeout 延迟 resolve，等待可能的后续消息
      // 如果已经有定时器，先清除它
      if (pending.timer) {
        clearTimeout(pending.timer);
      }

      // 设置新的定时器，50ms 后 resolve
      pending.timer = setTimeout(() => {
        const fullResponse = pending.messages.join('\n');
        logInfo(`[${this.selfId}] 最终响应内容长度:`, fullResponse.length)
        logInfo(`[${this.selfId}] 最终响应内容前200字符:`, fullResponse.substring(0, 200))
        pending.resolve(fullResponse);
      }, 50);

      // 返回一个虚拟的消息 ID
      return [Date.now().toString()];
    }

    loggerError(`[${this.selfId}] sendMessage 被意外调用，无待处理请求`, { channelId });
    return [];
  }

  async sendPrivateMessage(userId: string, content: Fragment): Promise<string[]> {
    return []
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> { }

  async editMessage(channelId: string, messageId: string, content: Fragment): Promise<void> { }

  async getMessage(channelId: string, messageId: string): Promise<Universal.Message> {
    throw new Error('Not supported')
  }

  async getMessageList(channelId: string, next?: string): Promise<Universal.List<Universal.Message>> {
    return { data: [] }
  }

  async getChannel(channelId: string): Promise<Universal.Channel> {
    return {
      id: channelId,
      name: channelId,
      type: Universal.Channel.Type.TEXT,
    }
  }

  async getChannelList(guildId: string, next?: string): Promise<Universal.List<Universal.Channel>> {
    return { data: [] }
  }

  async getGuild(guildId: string): Promise<Universal.Guild> {
    return {
      id: guildId,
      name: guildId,
    }
  }

  async getGuildList(next?: string): Promise<Universal.List<Universal.Guild>> {
    return { data: [] }
  }

  async getGuildMember(guildId: string, userId: string): Promise<Universal.GuildMember> {
    return {
      user: {
        id: userId,
        name: userId,
      },
    }
  }

  async getGuildMemberList(guildId: string, next?: string): Promise<Universal.List<Universal.GuildMember>> {
    return { data: [] }
  }

  async kickGuildMember(guildId: string, userId: string): Promise<void> { }

  async muteGuildMember(guildId: string, userId: string, duration: number): Promise<void> { }

  async getUser(userId: string): Promise<Universal.User> {
    return {
      id: userId,
      name: userId,
    }
  }

  async getFriendList(next?: string): Promise<Universal.List<Universal.User>> {
    return { data: [] }
  }
}