import { Command, Args } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import { findPlanByTitle, deletePlan } from '../../store/queries.js'
import { deletePlanFile } from '../../store/markdown.js'
import { ok } from '../../utils/display.js'

export default class PlanDelete extends Command {
  static description = 'Delete a plan and its markdown file'
  static aliases = ['plan:delete']

  static args = {
    title: Args.string({ description: 'Partial plan title to match', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(PlanDelete)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const plan = findPlanByTitle(project.id, args.title)
    if (!plan) this.error(`No plan found matching: "${args.title}"`)

    deletePlanFile(cwd, plan)
    deletePlan(plan.id)
    ok(`Plan deleted: "${plan.title}"`)
  }
}
