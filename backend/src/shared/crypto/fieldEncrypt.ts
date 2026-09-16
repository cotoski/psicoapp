import crypto from 'node:crypto'

// AES-256-GCM para campos clínicos em repouso (anamnese, prontuário).
// Formato armazenado: iv(12B) | tag(16B) | ciphertext.
// A chave é derivada de FIELD_ENCRYPTION_KEY: hex(64) ou base64(32B)
// direto; qualquer outro valor passa por sha256 (dev/testes).
const IV_LEN = 12
const TAG_LEN = 16

function deriveKey(secret: string): Buffer {
  if (/^[0-9a-fA-F]{64}$/.test(secret)) return Buffer.from(secret, 'hex')
  const b64 = Buffer.from(secret, 'base64')
  if (b64.length === 32 && b64.toString('base64') === secret) return b64
  return crypto.createHash('sha256').update(secret).digest()
}

export function encryptField(plaintext: string, secret: string): Buffer {
  const key = deriveKey(secret)
  const iv = crypto.randomBytes(IV_LEN)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct])
}

export function decryptField(blob: Buffer, secret: string): string {
  const key = deriveKey(secret)
  const iv = blob.subarray(0, IV_LEN)
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const ct = blob.subarray(IV_LEN + TAG_LEN)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
}
