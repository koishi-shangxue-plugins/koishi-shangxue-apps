import { Bot, Context, Universal, h, Fragment, Session } from 'koishi'
import type { Config, PendingResponse } from './types'
import { logInfo, loggerError } from './logger'
import { fragmentToString, estimateTokens, createStreamResponse } from './message'
import { } from '@koishijs/assets'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export class NextChatBot extends Bot<Context, Config> {
  static inject = ['server', 'i18n', 'assets']
  private avatarDataUrl: string;

  constructor(ctx: Context, config: Config) {
    super(ctx, config, 'nextchat');
    this.selfId = config.selfId || 'nextchat';
    this.user.name = config.selfname || 'nextchat';

    // 读取本地头像文件并转换为 base64 data URL
    try {
      const avatarPath = join(__dirname, '..', 'templates', '153288546.png');
      const avatarBuffer = readFileSync(avatarPath);
      this.avatarDataUrl = `data:image/png;base64,${avatarBuffer.toString('base64')}`;
      this.user.avatar = this.avatarDataUrl;
    } catch (error) {
      loggerError(`[${this.selfId}] 读取头像文件失败:`, error);
      // 使用默认头像作为后备
      this.avatarDataUrl = 'https://avatars.githubusercontent.com/u/153288546';
      this.user.avatar = this.avatarDataUrl;
    }

    this.platform = 'nextchat';
  }

  async start() {
    await super.start()
    this.online()
    const globalBot = this.ctx.bots.find(b => b.platform === 'nextchat' && b.selfId === this.selfId)
    if (globalBot) {
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

  // 用于存储等待 prompt 输入的 session
  private pendingPrompts = new Map<string, {
    resolve: (value: string) => void;
    timestamp: number;
  }>();

  // 处理 OpenAI 格式的聊天完成请求
  async handleChatCompletion(body: any, authority: number, userId: string, username: string, allowedElements: string[]): Promise<any> {
    const { messages, stream = false, model = 'koishi' } = body;

    const lastUserMessage = messages.filter(m => m.role === 'user').pop();
    if (!lastUserMessage) {
      loggerError(`[${this.selfId}] 未找到用户消息`);
      return this.createResponse('没有找到用户消息。', model, stream);
    }

    let userMessage: string;
    if (typeof lastUserMessage.content === 'string') {
      userMessage = lastUserMessage.content.trim();
    } else if (Array.isArray(lastUserMessage.content)) {
      // 处理数组格式的 content，构建一个 Koishi 元素数组
      const parts: string[] = [];
      for (const part of lastUserMessage.content) {
        if (part.type === 'text' && part.text) {
          // 只添加非空文本
          const trimmedText = part.text.trim();
          if (trimmedText) {
            parts.push(trimmedText);
          }
        } else if (part.type === 'image_url' && part.image_url) {
          parts.push(h('image', { url: part.image_url.url }).toString());
        }
      }
      // 用空格连接各部分，确保文本和图片元素之间有分隔
      userMessage = parts.join(' ');
    } else {
      userMessage = '';
    }
    const channelId = `private:${userId}`;

    logInfo(`[${this.selfId}] 处理用户 ${userId} 消息: `, userMessage);

    // 检查是否匹配自动回复关键词
    const autoReplyKeywords = this.config.autoReplyKeywords || [];
    const autoReplyContent = this.config.autoReplyContent || '';

    if (autoReplyKeywords.length > 0) {
      for (const item of autoReplyKeywords) {
        if (userMessage.includes(item.keyword)) {
          logInfo(`[${this.selfId}] 检测到自动回复关键词: ${item.keyword}，返回固定内容`);
          return this.createResponse(autoReplyContent, model, stream);
        }
      }
    }

    try {
      // 检查是否有等待 prompt 的 session
      logInfo(`[${this.selfId}] 检查 pendingPrompts，channelId: ${channelId}`);
      logInfo(`[${this.selfId}] pendingPrompts 内容:`, Array.from(this.pendingPrompts.keys()));

      const pendingPrompt = this.pendingPrompts.get(channelId);
      if (pendingPrompt) {
        // 如果有等待的 prompt，直接将消息传递给它
        logInfo(`[${this.selfId}] 找到等待的 prompt，将消息传递给它: ${userMessage}`);
        pendingPrompt.resolve(userMessage);
        this.pendingPrompts.delete(channelId);

        // 等待原始 session 的响应完成
        const originalPending = this.pendingResponses.get(channelId);
        if (originalPending) {
          logInfo(`[${this.selfId}] 等待原始 session 完成处理`);
          const responsePromise = new Promise<string>((resolve) => {
            originalPending.resolve = resolve;
          });

          const timeoutPromise = new Promise<string>((_, reject) => {
            setTimeout(() => reject(new Error('响应超时')), 30 * 1000);
          });

          const responseContent = await Promise.race([responsePromise, timeoutPromise]);
          logInfo(`[${this.selfId}] prompt 后的完整响应:\n`, responseContent);
          return this.createResponse(responseContent || ' ', model, stream);
        }

        // 如果没有找到原始 pending，返回空响应
        return this.createResponse('', model, stream);
      }

      logInfo(`[${this.selfId}] 没有找到等待的 prompt，创建新 session`);

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

      // 通过 dispatch 分发会话，让 Koishi 中间件系统处理
      this.dispatch(session);

      // 等待响应（设置超时）
      const timeoutPromise = new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('响应超时')), 30 * 1000);
      });

      const responseContent = await Promise.race([responsePromise, timeoutPromise]);

      logInfo(`[${this.selfId}] 完整响应内容:\n`, responseContent);
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
  private createSession(content: string, userId: string, username: string, channelId: string, authority: number) {
    const bot = this;
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

    // 保存原始的 prompt 方法
    const originalPrompt = session.prompt.bind(session);

    // 创建一个包装函数来处理跨请求的 prompt
    const wrappedPrompt = function (this: any, ...args: any[]): any {
      // 如果第一个参数是数字（超时时间）
      if (typeof args[0] === 'number' || args[0] === undefined) {
        const timeout = args[0];
        logInfo(`[${bot.selfId}] session.prompt 被调用，channelId: ${channelId}, timeout: ${timeout}`);

        // 创建一个 Promise 来等待下一条消息
        return new Promise<string>((resolve, reject) => {
          logInfo(`[${bot.selfId}] 将 prompt resolve 存入 pendingPrompts，channelId: ${channelId}`);
          bot.pendingPrompts.set(channelId, {
            resolve,
            timestamp: Date.now()
          });
          logInfo(`[${bot.selfId}] pendingPrompts 当前内容:`, Array.from(bot.pendingPrompts.keys()));

          // 设置超时
          const timeoutMs = timeout || 60000;
          setTimeout(() => {
            if (bot.pendingPrompts.has(channelId)) {
              logInfo(`[${bot.selfId}] prompt 超时，channelId: ${channelId}`);
              bot.pendingPrompts.delete(channelId);
              reject(new Error('Prompt timeout'));
            }
          }, timeoutMs);
        });
      } else {
        // 否则调用原始的 prompt 方法（带回调的版本）
        logInfo(`[${bot.selfId}] 调用原始 prompt 方法（带回调）`);
        return originalPrompt.apply(this, args);
      }
    };

    // 替换 prompt 方法
    session.prompt = wrappedPrompt as any;

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
    const pending = this.pendingResponses.get(channelId);
    if (pending) {
      const contentStr = await fragmentToString(this, content, pending.allowedElements);
      pending.messages.push(contentStr);

      // 如果已经有定时器，先清除它
      if (pending.timer) {
        clearTimeout(pending.timer);
      }

      // 检查是否有等待的 prompt，如果有则不要 resolve
      if (this.pendingPrompts.has(channelId)) {
        logInfo(`[${this.selfId}] 检测到 prompt 等待中，不 resolve 响应`);
        // 不设置定时器，等待 prompt 完成
      } else {
        // 设置新的定时器，50ms 后 resolve
        pending.timer = setTimeout(() => {
          const fullResponse = pending.messages.join('\n');
          pending.resolve(fullResponse);
        }, 50);
      }

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
      avatar: this.avatarDataUrl,
    }
  }

  async getFriendList(next?: string): Promise<Universal.List<Universal.User>> {
    return { data: [] }
  }
}