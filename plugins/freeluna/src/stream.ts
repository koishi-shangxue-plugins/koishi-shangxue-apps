

export function createStreamResponse(content: string, model: string): string {
  const id = `chatcmpl-freeluna-${Date.now()}`
  const created = Math.floor(Date.now() / 1000)
  const chunks: object[] = []


  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: { role: 'assistant' },
      finish_reason: null,
    }],
  })


  for (const char of content) {
    chunks.push({
      id,
      object: 'chat.completion.chunk',
      created,
      model,
      choices: [{
        index: 0,
        delta: { content: char },
        finish_reason: null,
      }],
    })
  }


  chunks.push({
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop',
    }],
  })

  return chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n'
}

export function buildChatResponse(content: string, modelName: string) {
  return {
    id: `chatcmpl-freeluna-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  }
}
