import { Command, Args } from '@oclif/core'
import { resolve } from 'node:path'
import { loadConfig } from '../../utils/config.js'
import { getToken } from '../../utils/credentials.js'
import { ok, err, warn } from '../../utils/display.js'

export default class AuthRevoke extends Command {
  static description = 'Revoke an API key by its ID (use `kontinue auth list` to find the ID)'

  static args = {
    keyId: Args.string({ description: 'API key ID (or prefix — first 8 chars)', required: true }),
  }

  async run(): Promise<void> {
    const { args } = await this.parse(AuthRevoke)
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

    const headers = { 'Authorization': `Bearer ${token}` }

    // If the argument looks like a short prefix, resolve to the full ID
    let keyId = args.keyId
    if (keyId.length < 36) {
      const listRes = await fetch(`${apiUrl}/api/keys`, { headers })
      if (!listRes.ok) {
        err(`Failed to list keys: ${listRes.status}`)
        return
      }
      const keys = await listRes.json() as { id: string }[]
      const match = keys.filter((k) => k.id.startsWith(keyId))
      if (match.length === 0) {
        warn(`No key found starting with "${keyId}"`)
        return
      }
      if (match.length > 1) {
        warn(`Ambiguous prefix "${keyId}" — matches ${match.length} keys. Use a longer ID.`)
        return
      }
      keyId = match[0].id
    }

    const res = await fetch(`${apiUrl}/api/keys/${keyId}`, { method: 'DELETE', headers })
    if (res.status === 404) {
      warn('Key not found (already revoked or does not exist)')
      return
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      err(`Failed to revoke key: ${res.status} ${body}`)
      return
    }

    ok(`Key ${keyId.slice(0, 8)}… revoked`)
  }
}
