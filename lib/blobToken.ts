// Schlüssel für den Vercel-Blob-Speicher finden. Vercel benennt die Variable je nach Einrichtung
// BLOB_READ_WRITE_TOKEN oder <PRÄFIX>_READ_WRITE_TOKEN – wir nehmen jede, die nach einem Blob-Schlüssel aussieht.
export function blobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  for (const [name, value] of Object.entries(process.env)) {
    if (value && /READ_WRITE_TOKEN$/i.test(name) && value.startsWith("vercel_blob_rw_")) return value;
  }
  for (const value of Object.values(process.env)) {
    if (value && value.startsWith("vercel_blob_rw_")) return value;
  }
  return undefined;
}
