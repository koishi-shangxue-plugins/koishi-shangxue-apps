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
      "modelname": "koishi-pro-image-preview",
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
      "modelname": "koishi",
      "element": [
        "text"
      ]
    },
    {
      "modelname": "koishi-image-preview",
      "element": [
        "text",
        "image",
        "img"
      ]
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
    })).role('table').description('模型配置').default(defaultModels),
  }).description('OpenAI - API设置'),

  Schema.object({
    selfId: Schema.string().default('nextchat').description('机器人 ID'),
    selfname: Schema.string().default('nextchat').description('机器人昵称'),
    selfavatar: Schema.string().default('https://avatars.githubusercontent.com/u/153288546').description('用户和机器人的头像').role('link'),
  }).description('Session设置'),

  Schema.object({
    NextChat_host: Schema.string().default('https://chat.bailili.top/#/').description('NextChat webUI 的 **URL地址**').role('link'),
  }).description('WebUI设置'),

  Schema.object({
    loggerInfo: Schema.boolean().default(false).description('启用详细日志输出'),
    loggerDebug: Schema.boolean().default(false).description('启用调试日志模式（包含请求详情）').experimental(),
  }).description('调试选项'),
]);