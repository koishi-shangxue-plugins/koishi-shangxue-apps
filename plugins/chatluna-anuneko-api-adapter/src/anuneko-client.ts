import { Context } from 'koishi'
import { PlatformModelAndEmbeddingsClient } from 'koishi-plugin-chatluna/llm-core/platform/client'
import {
  ChatLunaBaseEmbeddings,
  ChatLunaChatModel
} from 'koishi-plugin-chatluna/llm-core/platform/model'
import {
  ModelInfo,
  ModelType
} from 'koishi-plugin-chatluna/llm-core/platform/types'
import {
  ChatLunaError,
  ChatLunaErrorCode
} from 'koishi-plugin-chatluna/utils/error'
import { Config } from './index'
import { AnunekoRequester } from './anuneko-requester'
import { ChatLunaPlugin } from 'koishi-plugin-chatluna/services/chat'
import { getModelMaxContextSize } from '@chatluna/v1-shared-adapter'
import { RunnableConfig } from '@langchain/core/runnables'

export class AnunekoClient extends PlatformModelAndEmbeddingsClient {
  platform = 'anuneko'

  private _requester: AnunekoRequester

  constructor(
    ctx: Context,
    private _config: Config,
    public plugin: ChatLunaPlugin
  ) {
    super(ctx, plugin.platformConfigPool)
    this.platform = _config.platform
    this._requester = new AnunekoRequester(
      ctx,
      plugin.platformConfigPool,
      _config,
      plugin
    )
  }

  async refreshModels(config?: RunnableConfig): Promise<ModelInfo[]> {
    return [
      {
        name: 'orange-cat',
        type: ModelType.llm,
        capabilities: [],
        maxTokens: 128000
      },
      {
        name: 'exotic-shorthair',
        type: ModelType.llm,
        capabilities: [],
        maxTokens: 128000
      }
    ]
  }

  protected _createModel(
    model: string
  ): ChatLunaChatModel | ChatLunaBaseEmbeddings {
    this.ctx.logger.info('[anuneko] _createModel called for model:', model)
    this.ctx.logger.info('[anuneko] _modelInfos keys:', Object.keys(this._modelInfos))

    const info = this._modelInfos[model]

    this.ctx.logger.info('[anuneko] Model info:', JSON.stringify(info))

    if (info == null) {
      this.ctx.logger.error('[anuneko] Model info is null!')
      throw new ChatLunaError(
        ChatLunaErrorCode.MODEL_NOT_FOUND,
        new Error(
          `The model ${model} is not found in the models: ${JSON.stringify(Object.keys(this._modelInfos))}`
        )
      )
    }

    this.ctx.logger.info('[anuneko] Model type:', info.type, 'Expected:', ModelType.llm)
    this.ctx.logger.info('[anuneko] Type check:', info.type === ModelType.llm)

    if (info.type === ModelType.llm) {
      this.ctx.logger.info('[anuneko] Creating ChatLunaChatModel...')
      const modelMaxContextSize = getModelMaxContextSize(info)

      const chatModel = new ChatLunaChatModel({
        modelInfo: info,
        requester: this._requester,
        model,
        maxTokenLimit: info.maxTokens || modelMaxContextSize || 128_000,
        modelMaxContextSize,
        timeout: this._config.timeout,
        maxRetries: this._config.maxRetries,
        llmType: 'openai',
        isThinkModel: false
      })

      this.ctx.logger.info('[anuneko] ChatLunaChatModel created successfully')
      this.ctx.logger.info('[anuneko] Instance check:', chatModel instanceof ChatLunaChatModel)

      return chatModel
    }

    this.ctx.logger.error('[anuneko] Model type is not LLM!')
    throw new ChatLunaError(
      ChatLunaErrorCode.MODEL_NOT_FOUND,
      new Error(
        `The model ${model} is not a chat model, type is ${info.type}`
      )
    )
  }
}