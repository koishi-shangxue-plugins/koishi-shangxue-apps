import { Bot, Context, Universal, h, Fragment, Session } from 'koishi'
import type { Config, PendingResponse } from './types'
import { logInfo, loggerError } from './logger'
import { fragmentToString, estimateTokens, createStreamResponse } from './message'
import { } from '@koishijs/assets'

export class NextChatBot extends Bot<Context, Config> {
  static inject = ['server', 'i18n', 'assets']

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
  private pendingResponses = new Map<string, PendingResponse>();

  // 处理 OpenAI 格式的聊天完成请求
  async handleChatCompletion(body: any, authority: number, userId: string, username: string, allowedElements: string[]): Promise<any> {
    const { messages, stream = false, model = 'koishi' } = body;

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      loggerError(`[${this.selfId}] 未找到用户消息`);
      return this.createResponse('没有找到用户消息。', model, stream);
    }

    const userMessage = lastUserMessage.content.trim();
    const channelId = `private:${userId}`;

    logInfo(`[${this.selfId}] 处理用户消息: "${userMessage}"`, { userId, channelId });

    // 检查是否是 NextChat 的新对话提示词
    if (userMessage.includes('使用四到五个字直接返回这句话的简要主题') && userMessage.includes('不要解释、不要标点、不要语气词、不要多余文本')
      || userMessage.includes('这是历史聊天总结作为前情提要')) {
      return this.createResponse('新的聊天', model, stream);
    }

    try {
      // 创建一个 Promise 来等待响应
      const responsePromise = new Promise<string>((resolve) => {
        this.pendingResponses.set(channelId, {
          resolve,
          messages: [],
          allowedElements
        });
      });

      // 创建并分发 session，同时传递权限等级
      const session = this.createSession(userMessage, userId, username, channelId, authority);
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
        pending.timer();
      }
      this.pendingResponses.delete(channelId);
    }
  }

  // 创建 session
  private createSession(content: string, userId: string, username: string, channelId: string, authority: number) {
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

    // 将权限等级附加到 session 的一个临时属性上
    session['_authority'] = authority;

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
          prompt_tokens: estimateTokens(content),
          completion_tokens: estimateTokens(content),
          total_tokens: estimateTokens(content) * 2,
        },
      }
    }
  }

  // 创建流式响应（委托给 message.ts）
  createStreamResponse(content: string, model: string): string {
    return createStreamResponse(content, model)
  }

  async sendMessage(channelId: string, content: Fragment): Promise<string[]> {
    logInfo(`[${this.selfId}] sendMessage 被调用`, { channelId })
    logInfo(`[${this.selfId}] Fragment 类型:`, typeof content, Array.isArray(content))

    const pending = this.pendingResponses.get(channelId);
    if (pending) {
      const contentStr = await fragmentToString(this, content, pending.allowedElements);
      logInfo(`[${this.selfId}] 转换后的内容长度:`, contentStr.length)
      logInfo(`[${this.selfId}] 转换后的内容前100字符:`, contentStr.substring(0, 100))
      pending.messages.push(contentStr);

      // 如果已经有定时器，先清除它
      if (pending.timer) {
        pending.timer();
      }

      // 设置新的定时器，50ms 后 resolve
      pending.timer = this.ctx.setTimeout(() => {
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
      avatar: this.config.selfavatar || 'https://avatars.githubusercontent.com/u/153288546',
    }
  }

  async getFriendList(next?: string): Promise<Universal.List<Universal.User>> {
    return { data: [] }
  }
}