import { Command } from '@oclif/core'
import { resolve } from 'node:path'
import { loadConfig } from '../../utils/config.js'
import { getToken } from '../../utils/credentials.js'
import { err } from '../../utils/display.js'
import chalk from 'chalk'

export default class AuthList extends Command {
  static description = 'List your active API keys (key values are redacted)'

  async run(): Promise<void> {
    const cwd = resolve(process.cwd())
    const config = await loadConfig(cwd)

    if (config.backend !== 'remote' || !config.backendUrl) {
      err('This project is not configured for remote backend. Run: kontinue init --backend=remote')
      return
    }

    const apiUrl = config.backendUrl.replace(/\/$/, '')
    const token = await getToken(apiUrl)
    if (!token) {
      err('Not logged in. Run: kontinue auth login')
      return
    }

    const url = `${apiUrl}/api/keys`
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` },
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      err(`Failed to list keys: ${res.status} ${body}`)
      return
    }

    const keys = await res.json() as {
      id: string; name: string; keyPrefix: string; createdAt: string;
      expiresAt: string | null; grants: { projectId: string; projectName: string }[]
    }[]

    if (keys.length === 0) {
      console.log(chalk.dim('\n  No API keys found.\n'))
      return
    }

    console.log()
    console.log(chalk.bold('  API Keys'))
    console.log(chalk.dim('  ─'.repeat(27)))

    for (const key of keys) {
      const expires = key.expiresAt
        ? chalk.dim(` expires ${new Date(key.expiresAt).toLocaleDateString()}`)
        : ''
      const created = new Date(key.createdAt).toLocaleDateString()
      const grants = key.grants?.map(g => g.projectName).join(', ') ?? ''
      console.log(
        `  ${chalk.cyan(key.keyPrefix + '…')}  ${chalk.white(key.name)}` +
        chalk.dim(`  created ${created}`) + expires +
        chalk.dim(`  id:${key.id.slice(0, 8)}…`),
      )
      if (grants) {
        console.log(chalk.dim(`    → `) + grants)
      }
    }

    console.log()
  }
}
