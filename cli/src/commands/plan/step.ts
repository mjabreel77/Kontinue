import { Command, Args, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import { findPlanByTitle, getPlanSteps, addPlanSteps, updatePlanStepStatus, deletePlanStep } from '../../store/queries.js'
import { writePlan } from '../../store/markdown.js'
import { ok } from '../../utils/display.js'
import type { PlanStep } from '../../types.js'

export default class PlanStepCmd extends Command {
  static description = 'Manage steps within a plan'
  static aliases = ['plan:step']

  static args = {
    plan:    Args.string({ description: 'Partial plan title', required: true }),
    action:  Args.string({ description: 'add | done | skip | delete', required: true }),
    content: Args.string({ description: 'Step content (for add), or partial match (for done/skip/delete)' }),
  }

  static flags = {
    status: Flags.string({ char: 's', description: 'For status update: pending | in-progress | done | skipped' }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(PlanStepCmd)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const plan = findPlanByTitle(project.id, args.plan)
    if (!plan) this.error(`No plan found matching: "${args.plan}"`)

    const steps = getPlanSteps(plan.id)

    if (args.action === 'add') {
      if (!args.content) this.error('Provide step content as third argument')
      addPlanSteps(plan.id, [args.content])
      ok(`Step added to "${plan.title}"`)
    } else if (args.action === 'done' || args.action === 'skip' || args.action === 'progress') {
      if (!args.content) this.error('Provide partial step content to match')
      const lower = args.content.toLowerCase()
      const step = steps.find(s => s.content.toLowerCase().includes(lower))
      if (!step) this.error(`No step found matching: "${args.content}"`)
      const statusMap: Record<string, PlanStep['status']> = {
        done: 'done', skip: 'skipped', progress: 'in-progress',
      }
      updatePlanStepStatus(step.id, statusMap[args.action])
      ok(`Step marked ${statusMap[args.action]}: "${step.content}"`)
    } else if (args.action === 'delete') {
      if (!args.content) this.error('Provide partial step content to match')
      const lower = args.content.toLowerCase()
      const step = steps.find(s => s.content.toLowerCase().includes(lower))
      if (!step) this.error(`No step found matching: "${args.content}"`)
      deletePlanStep(step.id)
      ok(`Step deleted: "${step.content}"`)
    } else {
      this.error('Action must be one of: add | done | skip | progress | delete')
    }

    // Re-write markdown with updated steps
    const freshSteps = getPlanSteps(plan.id)
    writePlan(cwd, plan, freshSteps)
  }
}
