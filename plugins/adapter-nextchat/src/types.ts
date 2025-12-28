// 类型定义文件

// OpenAI Chat Completions API 请求体类型
export interface ChatCompletionRequest {
  messages: Array<{
    role: string;
    content: string | Array<{
      type: 'text' | 'image_url';
      text?: string;
      image_url?: {
        url: string;
      };
    }>;
  }>;
  stream?: boolean;
  model?: string;
  user?: string;
  username?: string;
}

// 配置接口
export interface Config {
  path?: string;
  APIkey?: { token: string; auth: number }[];
  models?: { modelname: string; element: string[] }[];
  selfId?: string;
  selfname?: string;
  NextChat_host?: string;
  loggerInfo?: boolean;
  loggerDebug?: boolean;
  autoReplyKeywords?: { keyword: string }[];
  autoReplyContent?: string;
}

// 待处理响应接口
export interface PendingResponse {
  resolve: (content: string) => void;
  messages: string[];
  timer?: NodeJS.Timeout;
  allowedElements: string[];
}