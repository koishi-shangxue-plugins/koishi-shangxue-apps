import { GitHubBotWithReaction } from './reaction'

/**
 * GitHub 适配器不支持的 API
 * 这些方法会直接返回，不执行任何操作
 */
export class GitHubBotWithUnsupported extends GitHubBotWithReaction {
  /**
   * 广播消息（不支持）
   */
  async broadcast(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 broadcast 方法')
    return []
  }

  /**
   * 清除所有反应（不支持）
   */
  async clearReaction(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 clearReaction 方法')
  }

  /**
   * 获取消息列表（不支持）
   */
  async getMessageList(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 getMessageList 方法')
    return { data: [] }
  }

  /**
   * 获取消息迭代器（不支持）
   */
  async *getMessageIter(...args: any[]): AsyncIterable<any> {
    this.logInfo('GitHub 适配器不支持 getMessageIter 方法')
  }

  /**
   * 创建私聊频道（不支持）
   */
  async createDirectChannel(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 createDirectChannel 方法')
    throw new Error('GitHub 适配器不支持创建私聊频道')
  }

  /**
   * 获取频道迭代器（不支持）
   */
  async *getChannelIter(...args: any[]): AsyncIterable<any> {
    this.logInfo('GitHub 适配器不支持 getChannelIter 方法')
  }

  /**
   * 发送私聊消息（不支持）
   */
  async sendPrivateMessage(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 sendPrivateMessage 方法')
    return []
  }

  /**
   * 获取群组迭代器（不支持）
   */
  async *getGuildIter(...args: any[]): AsyncIterable<any> {
    this.logInfo('GitHub 适配器不支持 getGuildIter 方法')
  }

  /**
   * 处理群组请求（不支持）
   */
  async handleGuildRequest(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 handleGuildRequest 方法')
  }

  /**
   * 获取群组成员迭代器（不支持）
   */
  async *getGuildMemberIter(...args: any[]): AsyncIterable<any> {
    this.logInfo('GitHub 适配器不支持 getGuildMemberIter 方法')
  }

  /**
   * 踢出群组成员（不支持）
   */
  async kickGuildMember(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 kickGuildMember 方法')
  }

  /**
   * 禁言群组成员（不支持）
   */
  async muteGuildMember(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 muteGuildMember 方法')
  }

  /**
   * 处理群组成员请求（不支持）
   */
  async handleGuildMemberRequest(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 handleGuildMemberRequest 方法')
  }

  /**
   * 获取群组角色列表（不支持）
   */
  async getGuildRoleList(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 getGuildRoleList 方法')
    return { data: [] }
  }

  /**
   * 获取群组角色迭代器（不支持）
   */
  async *getGuildRoleIter(...args: any[]): AsyncIterable<any> {
    this.logInfo('GitHub 适配器不支持 getGuildRoleIter 方法')
  }

  /**
   * 创建群组角色（不支持）
   */
  async createGuildRole(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 createGuildRole 方法')
    throw new Error('GitHub 适配器不支持创建角色')
  }

  /**
   * 更新群组角色（不支持）
   */
  async updateGuildRole(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 updateGuildRole 方法')
  }

  /**
   * 删除群组角色（不支持）
   */
  async deleteGuildRole(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 deleteGuildRole 方法')
  }

  /**
   * 设置群组成员角色（不支持）
   */
  async setGuildMemberRole(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 setGuildMemberRole 方法')
  }

  /**
   * 取消群组成员角色（不支持）
   */
  async unsetGuildMemberRole(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 unsetGuildMemberRole 方法')
  }

  /**
   * 获取好友列表（不支持）
   */
  async getFriendList(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 getFriendList 方法')
    return { data: [] }
  }

  /**
   * 获取好友迭代器（不支持）
   */
  async *getFriendIter(...args: any[]): AsyncIterable<any> {
    this.logInfo('GitHub 适配器不支持 getFriendIter 方法')
  }

  /**
   * 处理好友请求（不支持）
   */
  async handleFriendRequest(...args: any[]): Promise<any> {
    this.logInfo('GitHub 适配器不支持 handleFriendRequest 方法')
  }

  /**
   * 获取反应迭代器（不支持）
   */
  async *getReactionIter(...args: any[]): AsyncIterable<any> {
    this.logInfo('GitHub 适配器不支持 getReactionIter 方法')
  }
}
