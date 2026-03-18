import { Command, Args, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import { createPlan, addPlanSteps, getPlanSteps } from '../../store/queries.js'
import { writePlan } from '../../store/markdown.js'
import { ok } from '../../utils/display.js'

export default class PlanAdd extends Command {
  static description = 'Create a new plan'
  static aliases = ['plan:add']

  static args = {
    title: Args.string({ description: 'Plan title', required: true }),
  }

  static flags = {
    goal:  Flags.string({ char: 'g', description: 'What this plan aims to achieve' }),
    steps: Flags.string({ char: 's', description: 'Comma-separated list of steps' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PlanAdd)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const plan = createPlan(project.id, args.title, flags.goal)

    const steps = flags.steps
      ? addPlanSteps(plan.id, flags.steps.split(',').map(s => s.trim()).filter(Boolean))
      : []

    writePlan(cwd, plan, steps)
    ok(`Plan created: "${plan.title}"`)
  }
}
