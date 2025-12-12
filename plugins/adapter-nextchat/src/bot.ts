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
      // 清理待处理的响应
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
    if (typeof fragment === 'string') {
      return fragment
    }
    if (Array.isArray(fragment)) {
      return fragment.map(item => this.fragmentToString(item)).join('')
    }
    if (fragment && typeof fragment === 'object' && 'type' in fragment) {
      const element = fragment as h
      return h.transform([element], {
        text: (attrs) => attrs.content,
        image: (attrs) => `[图片: ${attrs.src || attrs.url || ''}]`,
        audio: (attrs) => `[音频: ${attrs.src || attrs.url || ''}]`,
        video: (attrs) => `[视频: ${attrs.src || attrs.url || ''}]`,
        at: (attrs) => `@${attrs.name || attrs.id}`,
        quote: (attrs, children) => `> ${children.join('')}`,
        default: () => '',
      }).join('')
    }
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
    logInfo(`[${this.selfId}] sendMessage 被调用`, { channelId, content })

    const pending = this.pendingResponses.get(channelId);
    if (pending) {
      const contentStr = this.fragmentToString(content);
      pending.messages.push(contentStr);

      // 立即返回响应并清理
      const fullResponse = pending.messages.join('\n');
      pending.resolve(fullResponse);

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