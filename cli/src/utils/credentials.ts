import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto'

/**
 * File-based credential store using AES-256-GCM.
 * Encryption key is derived from a machine-stable seed (hostname + username).
 * Credentials are stored in ~/.config/kontinue/credentials.enc
 */

const CREDENTIALS_DIR = join(homedir(), '.config', 'kontinue')
const CREDENTIALS_FILE = join(CREDENTIALS_DIR, 'credentials.enc')
const ALGO = 'aes-256-gcm'

function deriveKey(): Buffer {
  const seed = `kontinue:${homedir()}:${process.env.USERNAME ?? process.env.USER ?? 'default'}`
  return createHash('sha256').update(seed).digest()
}

function loadStore(): Record<string, string> {
  if (!existsSync(CREDENTIALS_FILE)) return {}
  try {
    const raw = readFileSync(CREDENTIALS_FILE)
    if (raw.length < 28) return {} // iv(12) + tag(16) minimum
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const ciphertext = raw.subarray(28)
    const decipher = createDecipheriv(ALGO, deriveKey(), iv)
    decipher.setAuthTag(tag)
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    return JSON.parse(decrypted.toString('utf8'))
  } catch {
    return {}
  }
}

function saveStore(store: Record<string, string>): void {
  mkdirSync(CREDENTIALS_DIR, { recursive: true })
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, deriveKey(), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(store), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  writeFileSync(CREDENTIALS_FILE, Buffer.concat([iv, tag, encrypted]), { mode: 0o600 })
}

export async function storeToken(apiUrl: string, token: string): Promise<void> {
  const store = loadStore()
  store[`session:${apiUrl}`] = token
  saveStore(store)
}

export async function getToken(apiUrl: string): Promise<string | null> {
  const store = loadStore()
  return store[`session:${apiUrl}`] ?? null
}

export async function deleteToken(apiUrl: string): Promise<boolean> {
  const store = loadStore()
  const key = `session:${apiUrl}`
  if (!(key in store)) return false
  delete store[key]
  saveStore(store)
  return true
}

export async function storeApiKey(apiUrl: string, projectId: string, key: string): Promise<void> {
  const store = loadStore()
  store[`apikey:${apiUrl}:${projectId}`] = key
  saveStore(store)
}

export async function getApiKey(apiUrl: string, projectId: string): Promise<string | null> {
  const store = loadStore()
  return store[`apikey:${apiUrl}:${projectId}`] ?? null
}

export async function deleteApiKey(apiUrl: string, projectId: string): Promise<boolean> {
  const store = loadStore()
  const key = `apikey:${apiUrl}:${projectId}`
  if (!(key in store)) return false
  delete store[key]
  saveStore(store)
  return true
}
