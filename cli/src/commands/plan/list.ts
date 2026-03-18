import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { requireProject } from '../../utils/project.js'
import { getAllPlans, getActivePlans, getPlanSteps } from '../../store/queries.js'
import chalk from 'chalk'

const STATUS_COLOR: Record<string, (s: string) => string> = {
  draft:     s => chalk.dim(s),
  active:    s => chalk.green(s),
  complete:  s => chalk.cyan(s),
  archived:  s => chalk.dim(s),
}

const STEP_ICON: Record<string, string> = {
  pending:     chalk.dim('○'),
  'in-progress': chalk.yellow('◉'),
  done:        chalk.green('✓'),
  skipped:     chalk.dim('–'),
}

export default class PlanList extends Command {
  static description = 'List plans and their steps'
  static aliases = ['plan:list']

  static flags = {
    all: Flags.boolean({ char: 'a', description: 'Include complete and archived plans' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(PlanList)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const plans = flags.all ? getAllPlans(project.id) : getActivePlans(project.id)

    if (plans.length === 0) {
      console.log(chalk.dim('\n  No plans found. Run: kontinue plan add "My Plan"\n'))
      return
    }

    console.log()
    for (const plan of plans) {
      const colorFn = STATUS_COLOR[plan.status] ?? chalk.white
      console.log('  ' + colorFn(`● ${plan.title}`) + chalk.dim(` [${plan.status}]`))

      if (plan.goal) {
        console.log(chalk.dim(`    ${plan.goal}`))
      }

      const steps = getPlanSteps(plan.id)
      if (steps.length > 0) {
        for (const step of steps) {
          const icon = STEP_ICON[step.status] ?? '○'
          const lineColor = step.status === 'done' || step.status === 'skipped' ? chalk.dim : chalk.white
          console.log(`    ${icon} ${lineColor(step.content)}`)
        }
        const done = steps.filter(s => s.status === 'done').length
        console.log(chalk.dim(`    ${done}/${steps.length} steps done`))
      }

      console.log()
    }
  }
}
