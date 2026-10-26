import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

import type { Line } from '../types'

const PANE = 'today-todo'
const SERVER = 'claude.ai PlayMCP'
const TITLE = '오늘 할 일'

// Change the tag when a line's fields change: it declines what an earlier
// version stored, which outlives a reload.
const lines = atom({ plugin: 'today-todo', key: 'lines' } as const, [], {
  shape: 'lines-1',
})
const isOn = atom({ plugin: 'today-todo', key: 'isOn' } as const, true)
const date = atom({ plugin: 'today-todo', key: 'date' } as const, '')
const updatedAt = atom({ plugin: 'today-todo', key: 'updatedAt' } as const, '')

type Call = (tool: string, args: Record<string, unknown>) => Promise<string>

// Parses the "### 일정: 제목 ... 기간: YYYY-MM-DD HH:MM:SS~YYYY-MM-DD HH:MM:SS" blocks.
const parseEvents = (text: string): Line[] =>
  text
    .split('### 일정:')
    .slice(1)
    .map(block => {
      const title = block.split('\n')[0].trim()
      const time = block.match(/기간:\s*\S+\s+(\d\d:\d\d):\d\d~\S+\s+(\d\d:\d\d):\d\d/)
      const text = time ? `${time[1]}-${time[2]} ${title}` : title
      return { kind: 'event', text, isDone: false } as Line
    })

// The task list's format is unconfirmed: take "###" headings, else show nothing.
const parseTasks = (text: string): Line[] =>
  text
    .split('\n')
    .filter(row => row.startsWith('###'))
    .map(row => row.replace(/^#+\s*(할 일:)?\s*/, '').trim())
    .filter(Boolean)
    .map(row => ({ kind: 'task', text: row, isDone: false }) as Line)

const parseTodos = (text: string): Line[] => {
  const parsed = JSON.parse(text) as { items?: Record<string, unknown>[] }
  return (parsed.items ?? []).map(item => ({
    kind: 'todo',
    text: String(item.content ?? item.title ?? ''),
    isDone: Boolean(item.is_completed ?? item.completed ?? item.done),
  }))
}

const fetchLines = async (call: Call, today: string): Promise<Line[]> => {
  const [y, m, d] = today.split('-').map(Number)
  const compact = today.replaceAll('-', '')
  const sources: [string, () => Promise<Line[]>][] = [
    ['일정', async () => parseEvents(await call('KakaotalkCal-GetEvent', { from: today, to: today }))],
    ['할 일', async () => parseTasks(await call('KakaotalkCal-GetTask', { from: compact, to: compact }))],
    [
      '투두메이트',
      async () =>
        parseTodos(
          await call('TodoMate-loadTodoItemsByDateRange', {
            start_year: y, start_month: m, start_day: d,
            end_year: y, end_month: m, end_day: d,
          }),
        ),
    ],
  ]
  const out: Line[] = []
  for (const [name, run] of sources) {
    try {
      out.push(...(await run()))
    } catch (error) {
      out.push({ kind: 'error', text: `${name} 불러오기 실패`, isDone: false })
    }
  }
  return out
}

// The chat memo takes 200 characters at most.
const toMessage = (today: string, list: Line[]): string => {
  const rows = list.filter(l => l.kind !== 'error').map(l => `${l.isDone ? '✓' : '•'} ${l.text}`)
  const head = `[오늘 할 일 ${today.slice(5)}]`
  const message = rows.length ? `${head}\n${rows.join('\n')}` : `${head}\n등록된 일정·할 일이 없습니다.`
  return message.length > 200 ? `${message.slice(0, 199)}…` : message
}

async function refresh($: Engine) {
  const call: Call = async (tool, args) => {
    const result = await $.mcp.call(SERVER, tool, args)
    const text = result.content.map(block => block.text ?? '').join('\n')
    if (result.isError) throw new Error(text)
    return text
  }
  const now = await $.clock.now()
  // KST date: shift the clock 9 hours before reading the UTC fields.
  const today = new Date(now + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const list = await fetchLines(call, today)
  await update($, lines, () => list)
  await update($, date, () => today)
  await update($, updatedAt, () => new Date(now + 9 * 3600 * 1000).toISOString().slice(11, 16))
}

async function turnOn($: Engine) {
  await update($, isOn, () => true)
  await $.ui.open({ id: PANE, title: TITLE })
  await refresh($)
}

async function turnOff($: Engine) {
  await update($, isOn, () => false)
  await $.ui.close({ id: PANE })
}


export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'todo', description: '오늘 할 일 패널 ON/OFF' })
    if (await read($, isOn)) void turnOn($)

    return next(e)
  })

  on('command.run', { command: 'todo' }, async $ => {
    if (await read($, isOn)) {
      await turnOff($)
      return { text: '오늘 할 일 패널을 껐습니다.' }
    }
    await turnOn($)
    return { text: '오늘 할 일 패널을 켰습니다.' }
  })

  // The person closed the pane with its own mark: keep the toggle in step.
  on('ui.close', async ($, e, next) => {
    if (e.id === PANE && e.origin === 'person') await update($, isOn, () => false)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    // While the pane is on, its own header holds the toggle; this is the way back on.
    if (await read($, isOn)) return next(e)

    const { Box, Button } = $.ui.resolve(e)

    return (
      <Box justifyContent="flex-end">
        <Button key="toggle" label="오늘 할 일 [OFF]" onPress={() => turnOn($)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, lines)
    const today = await read($, date)
    const time = await read($, updatedAt)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 5)

    const send = async () => {
      // An empty or failed load must not go out as "nothing to do".
      if (!today || list.some(line => line.kind === 'error')) {
        $.ui.toast('불러오기에 실패했거나 아직 불러오지 않아 전송하지 않았습니다')
        return
      }
      const result = await $.mcp.call(SERVER, 'KakaotalkChat-MemoChat', {
        message: toMessage(today, list),
      })
      $.ui.toast(result.isError ? '나챗방 전송 실패' : '나챗방으로 보냈습니다')
    }

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold>
            {today} <Text dimColor>({time} 기준)</Text>
          </Text>
          <Button key="toggle" label="[ON]" onPress={() => turnOff($)} />
        </Box>
        {list.length === 0 && <Text dimColor>등록된 일정·할 일이 없습니다.</Text>}
        {list.slice(0, room).map(line => (
          <Text dimColor={line.isDone} color={line.kind === 'error' ? 'red' : undefined}>
            {line.isDone ? '✓' : line.kind === 'event' ? '◷' : '•'} {line.text}
          </Text>
        ))}
        <Box>
          <Button key="refresh" label="새로고침" onPress={() => refresh($)} />
          <Text> </Text>
          <Button key="send" label="나챗방 전송" onPress={send} />
        </Box>
      </Box>
    )
  })
}
