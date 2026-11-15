import 'fast-text-encoding';
import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { Note } from './model';
export type Sealed = { v: 1; salt: string; iv: string; ciphertext: string; iterations: number };
export type Random = (length: number) => Uint8Array;
const random: Random = length => globalThis.crypto.getRandomValues(new Uint8Array(length));
const encoder = new TextEncoder(), decoder = new TextDecoder();
export function isProtected(note: Note): boolean { return Boolean(note.sealed); }
export async function deriveKey(password: string, sealed: Pick<Sealed, 'salt' | 'iterations'>) {
  if (sealed.iterations !== 600000 || !/^[a-f0-9]{32}$/.test(sealed.salt)) throw new Error('Unsupported protected note.');
  return pbkdf2Async(sha256, encoder.encode(password), hexToBytes(sealed.salt), { c: sealed.iterations, dkLen: 32, asyncTick: 10 });
}
export function encryptNote(note: Note, key: Uint8Array, settings: Pick<Sealed, 'salt' | 'iterations'>, bytes: Random = random): Note {
  const iv = bytes(12);
  const value = { text: note.text, content: note.content, filename: note.filename, customName: note.customName };
  const encoded = encoder.encode(JSON.stringify(value));
  if (encoded.length > 19999984) throw new Error('This note is too large to password protect.');
  const ciphertext = gcm(key, iv, encoder.encode(`bestpad:${note.id}:1`)).encrypt(encoded);
  const sealed: Sealed = { v: 1, ...settings, iv: bytesToHex(iv), ciphertext: bytesToHex(ciphertext) };
  return { ...note, text: '', filename: 'Locked note', customName: 'Locked note', content: undefined, sealed };
}
export async function protectNote(note: Note, password: string, bytes: Random = random) {
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  const settings = { salt: bytesToHex(bytes(16)), iterations: 600000 };
  const key = await deriveKey(password, settings);
  return { note: encryptNote(note, key, settings, bytes), key };
}
export async function unlockNote(note: Note, password: string) {
  const sealed = note.sealed as Sealed;
  if (!sealed || sealed.v !== 1 || !/^[a-f0-9]{24}$/.test(sealed.iv) || typeof sealed.ciphertext !== 'string' || sealed.ciphertext.length > 40000000) throw new Error('Invalid protected note.');
  const key = await deriveKey(password, sealed);
  try { return { note: decryptNote(note, key), key }; }
  catch { key.fill(0); throw new Error('Incorrect password or damaged note.'); }
}
export function decryptNote(note: Note, key: Uint8Array): Note {
  const sealed = note.sealed!;
  const data = JSON.parse(decoder.decode(gcm(key, hexToBytes(sealed.iv), encoder.encode(`bestpad:${note.id}:1`)).decrypt(hexToBytes(sealed.ciphertext))));
  if (typeof data.text !== 'string' || typeof data.filename !== 'string') throw new Error('Invalid note');
  const plain: Note = { ...note, text: data.text, content: data.content, filename: data.filename, customName: data.customName }; delete plain.sealed;
  return plain;
}
