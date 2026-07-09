import type { HackChatCachedMessage } from '../types'

export class MessageCache {
  private readonly messages: HackChatCachedMessage[] = []

  constructor(private readonly limit = 100) {}

  push(message: HackChatCachedMessage) {
    this.messages.push(message)
    if (this.messages.length > this.limit) {
      this.messages.splice(0, this.messages.length - this.limit)
    }
  }

  find(messageId: string) {
    return this.messages.find((message) => message.id === messageId)
  }

  list(next?: string) {
    if (!next) return [...this.messages]
    const index = this.messages.findIndex((message) => message.id === next)
    if (index < 0) return [...this.messages]
    return this.messages.slice(index + 1)
  }

  clear() {
    this.messages.length = 0
  }
}
