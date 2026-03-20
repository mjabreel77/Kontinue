import { Command, Flags } from '@oclif/core'
import { resolve } from 'node:path'
import { loadConfig } from '../../utils/config.js'
import { getToken, storeApiKey } from '../../utils/credentials.js'
import { ok, err, warn } from '../../utils/display.js'
import chalk from 'chalk'

export default class AuthRotate extends Command {
  static description = 'Rotate the API key — create a new key, store in keychain, revoke the old one'

  static flags = {
    name: Flags.string({ char: 'n', description: 'Name for the new key', default: 'rotated' }),
    'expires-in-days': Flags.integer({ description: 'Days until the new key expires' }),
  }

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthRotate)
    const cwd = resolve(process.cwd())
    const config = await loadConfig(cwd)

    if (config.backend !== 'remote' || !config.backendUrl || !config.projectId) {
      err('This project is not configured for remote backend. Run: kontinue init --backend=remote')
      return
    }

    const apiUrl = config.backendUrl.replace(/\/$/, '')
    const token = await getToken(apiUrl)
    if (!token) {
      err('Not logged in. Run: kontinue auth login')
      return
    }

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    // 1. Find the current key's ID (by listing user's keys and matching prefix)
    let oldKeyId: string | null = null
    const listRes = await fetch(`${apiUrl}/api/keys`, { headers })
    if (listRes.ok) {
      const keys = await listRes.json() as { id: string; keyPrefix: string; grants: { projectId: string }[] }[]
      // Find a key that has a grant for the current project
      const match = keys.find(k => k.grants?.some(g => g.projectId === config.projectId))
      if (match) oldKeyId = match.id
    }

    // 2. Create the new key
    const createRes = await fetch(`${apiUrl}/api/keys`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: flags.name,
        expiresInDays: flags['expires-in-days'] ?? null,
        projectIds: [config.projectId],
      }),
    })

    if (!createRes.ok) {
      const body = await createRes.text().catch(() => '')
      err(`Failed to create new key: ${createRes.status} ${body}`)
      return
    }

    const newKey = await createRes.json() as { id: string; key: string; keyPrefix: string }

    // 3. Store in keychain
    await storeApiKey(apiUrl, config.projectId, newKey.key)

    // 4. Revoke the old key
    if (oldKeyId) {
      const revokeRes = await fetch(`${apiUrl}/api/keys/${oldKeyId}`, {
        method: 'DELETE',
        headers,
      })
      if (!revokeRes.ok && revokeRes.status !== 404) {
        warn(`New key saved, but failed to revoke old key (${oldKeyId.slice(0, 8)}…). Revoke manually.`)
      }
    }

    ok('API key rotated')
    console.log(chalk.dim('  New prefix: ') + chalk.cyan(newKey.keyPrefix + '…'))
    console.log(chalk.dim('  Saved to   ') + chalk.white('OS keychain'))
    if (oldKeyId) {
      console.log(chalk.dim('  Old key    ') + chalk.red('revoked'))
    } else {
      console.log(chalk.dim('  (no previous key found to revoke)'))
    }
    console.log()
  }
}
