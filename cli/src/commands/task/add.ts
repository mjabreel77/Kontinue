import { Command, Args } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import { getActiveSession, addTask, getAllOpenTasks, getTasksByStatus } from '../../store/queries.js'
import { rewriteTaskList } from '../../store/markdown.js'
import { ok } from '../../utils/display.js'
import { getBranch } from '../../utils/git.js'

export default class TaskAdd extends Command {
  static description = 'Add a new task'
  static aliases = ['task:add']

  static args = {
    title: Args.string({ description: 'Task title', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(TaskAdd)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)
    const session = getActiveSession(project.id)

    const task = addTask(project.id, args.title, session?.id, getBranch(cwd))

    // Dual-write: rewrite todo.md
    const inProgress = getAllOpenTasks(project.id).filter(t => t.status === 'in-progress')
    const todo = getAllOpenTasks(project.id).filter(t => t.status === 'todo')
    const done = getTasksByStatus(project.id, 'done')
    rewriteTaskList(inProgress, todo, done)

    ok(`Task added: "${task.title}"`)
  }
}
