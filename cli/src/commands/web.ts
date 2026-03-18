import { Command, Flags } from '@oclif/core'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { requireProject } from '../utils/project.js'
import { handleApi, handleSSE } from '../web/api.js'
import { getDashboardHtml } from '../web/dashboard.js'
import chalk from 'chalk'

export default class Web extends Command {
  static description = 'Start a local web dashboard for this project'

  static flags = {
    port: Flags.integer({
      char: 'p',
      description: 'Port to listen on',
      default: 3456,
    }),
    'no-open': Flags.boolean({
      description: 'Do not open browser automatically',
      default: false,
    }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(Web)
    const cwd = resolve(process.cwd())
    const project = requireProject(cwd)

    const port = flags.port

    const html = getDashboardHtml(project.name)

    const server = createServer((req, res) => {
      const url = req.url ?? '/'

      // CORS for local dev convenience
      res.setHeader('Access-Control-Allow-Origin', '*')

      if (handleSSE(req, res, project, cwd)) return
      if (handleApi(req, res, project, cwd)) return

      if (url === '/' || url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(html)
        return
      }

      res.writeHead(404)
      res.end('Not found')
    })

    server.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${port}`
      console.log(chalk.bold(`\n  Kontinue — ${project.name}\n`))
      console.log(`  Dashboard: ${chalk.cyan(url)}`)
      console.log(chalk.dim(`  SSE stream at /api/events. Ctrl+C to stop.\n`))

      if (!flags['no-open']) {
        try {
          const platform = process.platform
          if (platform === 'win32')  execFileSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore' })
          else if (platform === 'darwin') execFileSync('open', [url], { stdio: 'ignore' })
          else execFileSync('xdg-open', [url], { stdio: 'ignore' })
        } catch {
          // Browser open is best-effort
        }
      }
    })

    // Keep alive until Ctrl+C
    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        server.close(() => resolve())
        console.log(chalk.dim('\n  Stopped.'))
      })
      process.on('SIGTERM', () => {
        server.close(() => resolve())
      })
    })
  }
}
