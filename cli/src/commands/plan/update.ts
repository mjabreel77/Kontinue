import { Command, Args, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import { findPlanByTitle, updatePlanStatus, updatePlanGoal, getPlanSteps } from '../../store/queries.js'
import { writePlan } from '../../store/markdown.js'
import { ok } from '../../utils/display.js'
import type { Plan } from '../../types.js'

export default class PlanUpdate extends Command {
  static description = 'Update a plan status or goal'
  static aliases = ['plan:update']

  static args = {
    title: Args.string({ description: 'Partial plan title to match', required: true }),
  }

  static flags = {
    status: Flags.string({ char: 's', description: 'New status: draft | active | complete | archived' }),
    goal:   Flags.string({ char: 'g', description: 'Update the plan goal' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PlanUpdate)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const plan = findPlanByTitle(project.id, args.title)
    if (!plan) {
      this.error(`No plan found matching: "${args.title}"`)
    }

    if (flags.status) {
      const valid = ['draft', 'active', 'complete', 'archived']
      if (!valid.includes(flags.status)) this.error(`Invalid status. Use: ${valid.join(' | ')}`)
      updatePlanStatus(plan.id, flags.status as Plan['status'])
    }

    if (flags.goal) {
      updatePlanGoal(plan.id, flags.goal)
    }

    // Re-fetch updated plan and write markdown
    const updated = findPlanByTitle(project.id, args.title)!
    const steps = getPlanSteps(plan.id)
    writePlan(cwd, updated, steps)

    ok(`Plan updated: "${plan.title}"`)
  }
}
