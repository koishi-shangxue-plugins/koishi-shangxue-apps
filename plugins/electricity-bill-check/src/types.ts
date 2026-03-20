export interface QueryResult {
  text: string;
}

export interface Config {
  url: string;
  regex: string;
  botId: string;
  channelId: string;
  maxRetries: number;
  retryDelaySeconds: number;
  requestTimeoutSeconds: number;
  enabled: boolean;
  loggerinfo: boolean;
}

export interface RuntimeLogger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string, error?: unknown): void;
}

export interface TaskExecutionResult {
  success: boolean;
  attempts: number;
  resultText?: string;
  error?: string;
}

export type TaskTrigger = 'schedule' | 'manual'
