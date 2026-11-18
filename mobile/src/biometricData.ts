// Only this non-secret metadata is needed to bind a Keychain key to a note.
export type BiometricKeyRecord = { v: 1; salt: string; key: string };

export function decodeBiometricKey(raw: string | null, expectedSalt: string): string | null {
  if (!raw) return null;
  try {
    const record: unknown = JSON.parse(raw);
    if (!record || typeof record !== 'object') return null;
    const value = record as Partial<BiometricKeyRecord>;
    if (value.v !== 1 || value.salt !== expectedSalt || !/^[a-f0-9]{64}$/.test(value.key || '')) return null;
    return value.key!;
  } catch { return null; }
}
