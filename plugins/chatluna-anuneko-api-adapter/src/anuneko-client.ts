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

  // 刷新可用模型列表
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

  // 创建模型实例
  protected _createModel(model: string): ChatLunaChatModel | ChatLunaBaseEmbeddings {
    const info = this._modelInfos[model]

    if (info == null) {
      throw new ChatLunaError(
        ChatLunaErrorCode.MODEL_NOT_FOUND,
        new Error(
          `The model ${model} is not found in the models: ${JSON.stringify(Object.keys(this._modelInfos))}`
        )
      )
    }

    if (info.type !== ModelType.llm) {
      throw new ChatLunaError(
        ChatLunaErrorCode.MODEL_NOT_FOUND,
        new Error(
          `The model ${model} is not a chat model`
        )
      )
    }

    const modelMaxContextSize = getModelMaxContextSize(info)
    return new ChatLunaChatModel({
      modelInfo: info,
      requester: this._requester,
      model,
      maxTokenLimit: info.maxTokens || modelMaxContextSize || 128000,
      modelMaxContextSize,
      timeout: this._config.timeout,
      maxRetries: this._config.maxRetries,
      llmType: 'openai',
      isThinkModel: false
    })
  }
}