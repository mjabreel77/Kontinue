import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { loadConfig } from '../utils/config.js'
import chalk from 'chalk'

export default class Web extends Command {
  static description = 'Open the Kontinue dashboard (deprecated — use the dashboard app directly)'

  static flags = {
    port: Flags.integer({
      char: 'p',
      description: '(deprecated) Port flag — ignored',
    }),
    'no-open': Flags.boolean({
      description: '(deprecated) Do not open browser',
      default: false,
    }),
    'api-url': Flags.string({
      description: 'API server URL (auto-detected from .kontinuerc.json)',
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Web)
    const cwd = resolve(process.cwd())
    const config = await loadConfig(cwd)

    const apiUrl = flags['api-url'] ?? config.backendUrl ?? 'http://localhost:5152'

    console.log(chalk.yellow.bold('\n  ⚠  kontinue web is deprecated\n'))
    console.log(`  The embedded web server has been replaced by the Kontinue Dashboard app.`)
    console.log(`  The dashboard connects directly to the .NET API server.\n`)
    console.log(`  API server: ${chalk.cyan(apiUrl)}`)
    console.log(`  To start the dashboard: ${chalk.bold('cd dashboard && npm run electron:dev')}`)
    console.log(`  Or open: ${chalk.cyan(apiUrl)} in your browser\n`)

    if (!flags['no-open']) {
      try {
        const platform = process.platform
        if (platform === 'win32') execFileSync('cmd', ['/c', 'start', '', apiUrl], { stdio: 'ignore' })
        else if (platform === 'darwin') execFileSync('open', [apiUrl], { stdio: 'ignore' })
        else execFileSync('xdg-open', [apiUrl], { stdio: 'ignore' })
        console.log(chalk.dim('  Opened API URL in browser.\n'))
      } catch {
        // best-effort
      }
    }
  }
}
