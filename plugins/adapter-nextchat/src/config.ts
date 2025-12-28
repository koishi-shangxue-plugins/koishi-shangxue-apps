import { Schema } from 'koishi'
import type { Config } from './types'

const defaultAPIKeys: { token: string; auth: number }[] =
  [
    {
      "token": "sk-fXzPq8rGjK5tLwMhN7bVcFdE2uIaYxS1oQp0iUjH6yT3eW",
      "auth": 5
    },
    {
      "token": "sk-aBcD1eFg2hIj3KlM4nOp5QrS6tUv7WxY8zAb9Cd0EfG1hI",
      "auth": 4
    },
    {
      "token": "sk-qWeR7tYuI8oP9aSdF0gHjK1lLzX2cVbN3mMq4wEr5TyU6i",
      "auth": 3
    },
    {
      "token": "sk-mN0bV1cX2zL3kJa4sDf5gHj6KlQ7wEr8TyU9iOp0aSdFgH",
      "auth": 2
    },
    {
      "token": "sk-default",
      "auth": 1
    }
  ]

const defaultModels: { modelname: string; element: ('text' | 'image' | 'img' | 'audio' | 'video' | 'file')[] }[] =
  [
    {
      "modelname": "gemini-koishi-pro",
      "element": [
        "text",
        "image",
        "img",
        "audio",
        "video",
        "file"
      ]
    },
    {
      "modelname": "gemini-koishi-text",
      "element": [
        "text"
      ]
    },
    {
      "modelname": "gemini-koishi-image",
      "element": [
        "text",
        "image",
        "img"
      ]
    }
  ]

const defaultAutoReplyKeywords =
  [
    {
      "keyword": "使用四到五个字直接返回这句话的简要主题，不要解释、不要标点、不要语气词、不要多余文本，不要加粗，如果没有主题，请直接返回"
    },
    {
      "keyword": "Generate a concise, 3-5 word title with an emoji summarizing the chat history."
    },
    {
      "keyword": "Suggest 3-5 relevant follow-up questions or prompts that the user might naturally ask next in this conversation"
    },
    {
      "keyword": "Generate 1-3 broad tags categorizing the main themes of the chat history, along with 1-3 more specific subtopic tags"
    }
  ]

export const ConfigSchema: Schema<Config> = Schema.intersect([
  Schema.object({
    path: Schema.string().default('/nextchat/v1/chat/completions').description('API 路径').role('link'),
    APIkey: Schema.array(Schema.object({
      token: Schema.string().description('APIkey'),
      auth: Schema.number().default(1).min(0).max(5).step(1).description('权限等级'),
    })).role('table').description('APIkey 权限设置').default(defaultAPIKeys),
    models: Schema.array(Schema.object({
      modelname: Schema.string().description('模型名称'),
      element: Schema
        .array(Schema.union(['text', 'image', 'img', 'audio', 'video', 'file']))
        .description('可渲染的消息元素'),
    })).role('table').description('模型设定<br>`这里以gemini开头是为了让nextchat客户端上传图片，`<br>`否则可能会遇到输入了图片但是不传给koishi的情况。`').default(defaultModels),
  }).description('OpenAI - API设置'),

  Schema.object({
    selfId: Schema.string().default('nextchat').description('机器人 ID').disabled(),
    selfname: Schema.string().default('nextchat').description('机器人昵称').disabled(),
  }).description('Session设置'),

  Schema.object({
    NextChat_host: Schema.string().default('https://www.happieapi.top/#/chat').description('NextChat webUI 的 **URL地址**').role('link'),
  }).description('NextChat设置'),


  Schema.object({
    autoReplyContent: Schema.string().default('').description('自动回复内容<br>当检测到关键词时返回的固定内容（留空则返回空字符串）'),
    autoReplyKeywords: Schema.array(Schema.object({
      keyword: Schema.string().description('关键词'),
    })).role('table').default(defaultAutoReplyKeywords).description('自动回复关键词列表<br>当消息包含这些关键词时，将自动回复固定内容而不触发 Koishi 命令'),
  }).description('客户端自动请求过滤'),

  Schema.object({
    loggerInfo: Schema.boolean().default(false).description('启用详细日志输出'),
    loggerDebug: Schema.boolean().default(false).description('启用调试日志模式（包含请求详情）').experimental(),
  }).description('调试选项'),
]);