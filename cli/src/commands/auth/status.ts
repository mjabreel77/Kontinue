import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { loadConfig } from '../../utils/config.js'
import { getToken, getApiKey } from '../../utils/credentials.js'
import { ok, warn, err } from '../../utils/display.js'
import chalk from 'chalk'

export default class AuthStatus extends Command {
  static description = 'Show the current authentication status'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const config = await loadConfig(cwd)

    console.log()

    if (config.backend !== 'remote') {
      console.log(chalk.dim('  Backend: ') + chalk.white('local') + chalk.dim(' (no auth required)'))
      console.log()
      return
    }

    const apiUrl = (config.backendUrl ?? '').replace(/\/$/, '')
    console.log(chalk.dim('  Backend:   ') + chalk.white('remote'))
    console.log(chalk.dim('  API URL:   ') + chalk.white(apiUrl || '(not set)'))
    console.log(chalk.dim('  Project:   ') + chalk.white(config.projectId ?? '(not set)'))

    // Check session token
    const token = apiUrl ? await getToken(apiUrl) : null
    if (!token) {
      console.log(chalk.dim('  Session:   ') + chalk.yellow('not logged in'))
      warn('No session token. Run: kontinue auth login')
    } else {
      console.log(chalk.dim('  Session:   ') + chalk.cyan(token.slice(0, 8) + '…'))

      // Validate by hitting /auth/me
      try {
        const res = await fetch(`${apiUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const me = await res.json() as { email: string; displayName?: string }
          console.log(chalk.dim('  User:      ') + chalk.green(`${me.displayName ?? me.email} ✓`))
        } else {
          console.log(chalk.dim('  User:      ') + chalk.red('session expired or invalid ✗'))
          warn('Run: kontinue auth login')
        }
      } catch {
        console.log(chalk.dim('  User:      ') + chalk.yellow('unreachable'))
      }
    }

    // Check API key
    if (config.projectId && apiUrl) {
      const apiKey = await getApiKey(apiUrl, config.projectId)
      if (apiKey) {
        console.log(chalk.dim('  API Key:   ') + chalk.cyan(apiKey.slice(0, 8) + '…'))

        try {
          const res = await fetch(`${apiUrl}/api/projects/${config.projectId}/tasks?status=in-progress`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          })
          if (res.ok) {
            console.log(chalk.dim('  Key status:') + chalk.green(' valid ✓'))
          } else {
            console.log(chalk.dim('  Key status:') + chalk.red(' rejected ✗'))
          }
        } catch {
          console.log(chalk.dim('  Key status:') + chalk.yellow(' unreachable'))
        }
      } else {
        console.log(chalk.dim('  API Key:   ') + chalk.dim('not set for this project'))
      }
    }

    console.log()
  }
}
