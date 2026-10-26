export type Line = {
  kind: 'event' | 'task' | 'todo' | 'error'
  text: string
  isDone: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'today-todo': {
      lines: Shaped<Line[]>
      isOn: boolean
      date: string
      updatedAt: string
    }
  }
}
