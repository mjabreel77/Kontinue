import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../utils/project.js'
import {
  getAllOpenTasks,
  getTasksByStatus,
  getTaskItems,
  getDecisionsByTask,
  getNotesByTask,
} from '../store/queries.js'
import { printBanner } from '../utils/display.js'
import chalk from 'chalk'
import type { Task, TaskItem, Decision, Note } from '../types.js'

const COL_WIDTH = 28

function card(task: Task, items: TaskItem[], decisions: Decision[], notes: Note[]): string[] {
  const lines: string[] = []

  const statusColor =
    task.status === 'in-progress' ? chalk.green
    : task.status === 'done'      ? chalk.dim
    : chalk.white

  // Title line
  lines.push(statusColor(truncate(task.title, COL_WIDTH - 2)))

  // Description (dimmed, wrapped to ~COL_WIDTH)
  if (task.description) {
    for (const chunk of wrap(task.description, COL_WIDTH - 4)) {
      lines.push(chalk.dim('  ' + chunk))
    }
  }

  // Checklist items
  if (items.length > 0) {
    for (const item of items) {
      const tick = item.done ? chalk.green('[x]') : chalk.dim('[ ]')
      lines.push(`  ${tick} ${chalk.dim(truncate(item.content, COL_WIDTH - 8))}`)
    }
    const done = items.filter(i => i.done).length
    lines.push(chalk.dim(`  ${done}/${items.length} steps`))
  }

  // Linked decisions
  if (decisions.length > 0) {
    lines.push(chalk.blue(`  ${decisions.length} decision${decisions.length > 1 ? 's' : ''}`))
  }

  // Linked notes/observations
  if (notes.length > 0) {
    lines.push(chalk.cyan(`  ${notes.length} note${notes.length > 1 ? 's' : ''}`))
  }

  // Branch
  if (task.branch && task.branch !== 'HEAD') {
    lines.push(chalk.dim(`  @ ${task.branch}`))
  }

  return lines
}

function renderColumns(
  cols: Array<{ label: string; color: typeof chalk; tasks: Task[] }>,
  itemsMap: Map<number, TaskItem[]>,
  decisionsMap: Map<number, Decision[]>,
  notesMap: Map<number, Note[]>,
): void {
  const PAD = COL_WIDTH + 2
  const SEP = chalk.dim(' │ ')

  // Headers
  const headers = cols.map(c => c.color.bold(c.label.padEnd(PAD)))
  console.log('  ' + headers.join(SEP))
  console.log('  ' + cols.map(() => chalk.dim('─'.repeat(PAD))).join(chalk.dim('─┼─')))

  // Cards — emit row by row across columns
  const colLines: string[][] = cols.map(c =>
    c.tasks.flatMap(t => {
      const cardRows = card(
        t,
        itemsMap.get(t.id) ?? [],
        decisionsMap.get(t.id) ?? [],
        notesMap.get(t.id) ?? [],
      )
      return [...cardRows, ''] // blank line between cards
    })
  )

  if (colLines.every(l => l.length === 0)) {
    console.log(chalk.dim('  (empty)'))
    return
  }

  const maxRows = Math.max(...colLines.map(l => l.length))
  for (let i = 0; i < maxRows; i++) {
    const row = cols.map((_, ci) => {
      const text = colLines[ci][i] ?? ''
      return text.padEnd(PAD)
    })
    console.log('  ' + row.join(SEP))
  }
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str
}

function wrap(str: string, width: number): string[] {
  const words = str.split(' ')
  const lines: string[] = []
  let current = ''
  for (const w of words) {
    if ((current + ' ' + w).trim().length > width) {
      if (current) lines.push(current)
      current = w
    } else {
      current = (current + ' ' + w).trim()
    }
  }
  if (current) lines.push(current)
  return lines.slice(0, 2) // max 2 lines of description
}

export default class Board extends Command {
  static description = 'Show the task board: Todo / In Progress / Done'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const open = await Promise.resolve(/* sync */ null).then(() => {
      const inProg = getTasksByStatus(project.id, 'in-progress')
      const todo   = getTasksByStatus(project.id, 'todo')
      const done   = getTasksByStatus(project.id, 'done').slice(0, 5) // last 5 done
      return { inProg, todo, done }
    })

    const allTasks = [...open.todo, ...open.inProg, ...open.done]

    const itemsMap    = new Map(allTasks.map(t => [t.id, getTaskItems(t.id)]))
    const decisionsMap = new Map(allTasks.map(t => [t.id, getDecisionsByTask(t.id)]))
    const notesMap    = new Map(allTasks.map(t => [t.id, getNotesByTask(t.id)]))

    printBanner(project.name)

    console.log()
    renderColumns(
      [
        { label: 'TODO',        color: chalk.white, tasks: open.todo   },
        { label: 'IN PROGRESS', color: chalk.green, tasks: open.inProg },
        { label: 'DONE',        color: chalk.dim,   tasks: open.done   },
      ],
      itemsMap,
      decisionsMap,
      notesMap,
    )
    console.log()

    // Summary line
    const totalItems = allTasks.reduce((n, t) => n + (itemsMap.get(t.id)?.length ?? 0), 0)
    const doneItems  = allTasks.reduce((n, t) => n + (itemsMap.get(t.id)?.filter(i => i.done).length ?? 0), 0)
    const linked     = allTasks.reduce((n, t) => n + (decisionsMap.get(t.id)?.length ?? 0), 0)
    const parts = [
      chalk.dim(`${open.todo.length} todo  ·  ${open.inProg.length} in progress  ·  ${open.done.length} done`),
      totalItems > 0 ? chalk.dim(`  |  ${doneItems}/${totalItems} checklist items`) : '',
      linked > 0     ? chalk.dim(`  |  ${linked} linked decisions`) : '',
    ].filter(Boolean)
    console.log('  ' + parts.join(''))
    console.log()
  }
}
