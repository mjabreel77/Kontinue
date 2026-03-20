import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { loadConfig } from '../../utils/config.js'
import { getToken, storeApiKey } from '../../utils/credentials.js'
import { ok, warn, err } from '../../utils/display.js'
import chalk from 'chalk'

export default class AuthCreate extends Command {
  static description = 'Create a scoped API key for MCP / automation use'

  static flags = {
    name: Flags.string({ char: 'n', description: 'Key name / label', default: 'default' }),
    'expires-in-days': Flags.integer({ description: 'Days until key expires (omit for no expiry)' }),
    'project-ids': Flags.string({ description: 'Comma-separated project IDs to grant access to' }),
    'no-save': Flags.boolean({ description: 'Do not save the key to OS keychain' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthCreate)
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

    // Use current project if no project IDs specified
    const projectIds = flags['project-ids']
      ? flags['project-ids'].split(',').map(s => s.trim())
      : config.projectId ? [config.projectId] : []

    if (projectIds.length === 0) {
      err('No project IDs specified and no current project configured')
      return
    }

    const url = `${apiUrl}/api/keys`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: flags.name,
        expiresInDays: flags['expires-in-days'] ?? null,
        projectIds,
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      err(`Failed to create API key: ${res.status} ${body}`)
      return
    }

    const data = await res.json() as {
      id: string; name: string; keyPrefix: string; key: string;
      expiresAt: string | null; grants: string[]
    }

    if (!flags['no-save'] && config.projectId) {
      await storeApiKey(apiUrl, config.projectId, data.key)
    }

    console.log()
    ok('API key created')
    console.log(chalk.dim('  Name:    ') + data.name)
    console.log(chalk.dim('  Prefix:  ') + chalk.cyan(data.keyPrefix + '…'))
    console.log(chalk.dim('  Grants:  ') + chalk.white(`${(data.grants ?? projectIds).length} project(s)`))
    if (data.expiresAt) {
      console.log(chalk.dim('  Expires: ') + new Date(data.expiresAt).toLocaleDateString())
    }

    if (!flags['no-save'] && config.projectId) {
      console.log(chalk.dim('  Saved to ') + chalk.white('OS keychain'))
    } else {
      console.log()
      console.log(chalk.yellow('  ⚠ Key shown once — copy it now:'))
      console.log(chalk.bold(`  ${data.key}`))
    }
    console.log()
  }
}
