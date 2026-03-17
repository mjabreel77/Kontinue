import { Command, Args } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import {
  findTaskByTitle,
  updateTaskStatus,
  getAllOpenTasks,
  getTasksByStatus,
} from '../../store/queries.js'
import { rewriteTaskList } from '../../store/markdown.js'
import { ok, warn } from '../../utils/display.js'

export default class TaskDone extends Command {
  static description = 'Mark a task as done'

  static args = {
    title: Args.string({ description: 'Task title (partial match)', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(TaskDone)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const task = findTaskByTitle(project.id, args.title)
    if (!task) {
      warn(`No open task found matching: "${args.title}"`)
      return
    }

    updateTaskStatus(task.id, 'done')

    const inProgress = getAllOpenTasks(project.id).filter(t => t.status === 'in-progress')
    const todo = getAllOpenTasks(project.id).filter(t => t.status === 'todo')
    const done = getTasksByStatus(project.id, 'done')
    rewriteTaskList(inProgress, todo, done)

    ok(`Task done: "${task.title}"`)
  }
}
