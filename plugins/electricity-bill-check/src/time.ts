const DAILY_REPORT_HOUR = 12
const SHANGHAI_TIMEZONE = 'Asia/Shanghai'
const SHANGHAI_UTC_OFFSET = 8

interface ShanghaiDateParts {
  year: number;
  month: number;
  day: number;
}

export function formatShanghaiTime(date: Date) {
  return date.toLocaleString('zh-CN', {
    timeZone: SHANGHAI_TIMEZONE,
    hour12: false,
  })
}

function getShanghaiDateParts(now: Date): ShanghaiDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour12: false,
  })

  const parts = new Map(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )

  return {
    year: Number(parts.get('year')),
    month: Number(parts.get('month')),
    day: Number(parts.get('day')),
  }
}

export function getNextShanghaiNoon(now = new Date()) {
  // 这里固定为中国时区中午 12 点。
  const parts = getShanghaiDateParts(now)
  const nextRun = new Date(Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    DAILY_REPORT_HOUR - SHANGHAI_UTC_OFFSET,
    0,
    0,
    0
  ))

  if (nextRun.getTime() <= now.getTime()) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1)
  }

  return nextRun
}
