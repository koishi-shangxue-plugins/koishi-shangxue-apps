import { Session } from 'koishi'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getNestedValue(source: unknown, paths: string[]): unknown {
  let current: unknown = source

  for (const key of paths) {
    if (!isRecord(current) || !(key in current)) {
      return undefined
    }
    current = current[key]
  }

  return current
}

export function isSupportedPlatform(session: Session): boolean {
  return session.platform === 'qq' || session.platform === 'qqguild'
}

export function getInteractionId(session: Session): string {
  const interactionId = getNestedValue(session.event, ['_data', 'id'])
  return typeof interactionId === 'string' ? interactionId : ''
}

export function getButtonData(session: Session): string | undefined {
  const buttonData = getNestedValue(session.event, ['button', 'data'])
  return typeof buttonData === 'string' ? buttonData : undefined
}
