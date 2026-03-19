export interface QueryTask {
  regex: string;
  botId: string;
  channelId: string;
  maxRetries: number;
  retryDelaySeconds: number;
  requestTimeoutSeconds: number;
  enabled: boolean;
}

export interface Config {
  tasks: QueryTask[];
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
  value?: number;
  notificationSent?: boolean;
  error?: string;
}

export interface TaskStatusSnapshot {
  enabled: boolean;
  running: boolean;
  maxRetries: number;
  lastValue?: number;
  lastAttemptAt?: Date;
  lastSuccessAt?: Date;
  nextRunAt?: Date;
  botId: string;
  channelId: string;
}

export type TaskTrigger = 'schedule' | 'manual'
