import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { decodeBiometricKey } from './biometricData';

// iOS briefly enters 'inactive' during a Face ID sheet. Only that transition
// may bypass the normal background locking rule; actual background always locks.
let biometricRequests = 0;
export function biometricPromptInProgress(): boolean { return biometricRequests > 0; }
async function duringBiometricPrompt<T>(operation: () => Promise<T>): Promise<T> {
  biometricRequests++;
  try { return await operation(); }
  finally { biometricRequests--; }
}

// Track note IDs (never keys, passwords or contents) for complete account cleanup,
// including notes that have since disappeared from the synced workspace.
let registryQueue: Promise<void> = Promise.resolve();
async function registryKey(user: string | null): Promise<string> {
  const suffix = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(['index', user]));
  return `bestpad:faceid:index:${suffix}`;
}
async function registeredNotes(user: string | null): Promise<string[]> {
  const raw = await AsyncStorage.getItem(await registryKey(user));
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || !parsed.every(id => typeof id === 'string' && id.length > 0))
    throw new Error('Invalid Face ID credential index.');
  return parsed;
}
async function updateRegistry(user: string | null, id: string, add: boolean): Promise<void> {
  const work = registryQueue.catch(() => undefined).then(async () => {
    const current = new Set(await registeredNotes(user));
    if (add) current.add(id); else current.delete(id);
    const key = await registryKey(user);
    if (current.size) await AsyncStorage.setItem(key, JSON.stringify([...current]));
    else await AsyncStorage.removeItem(key);
  });
  registryQueue = work.catch(() => undefined);
  await work;
}


async function names(user: string | null, id: string) {
  // Avoid accidental collisions between guest, signed-in users and imported IDs.
  // SecureStore key names only allow alphanumeric characters, dots, hyphens and underscores.
  const suffix = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify([user || null, id]));
  return { key: `bestpad.faceid.${suffix}`, flag: `bestpad:faceid:${suffix}` };
}

export function faceIdAvailable(): boolean {
  if (Platform.OS !== 'ios' || Constants.appOwnership === 'expo') return false;
  try { return SecureStore.canUseBiometricAuthentication(); } catch { return false; }
}

export async function faceIdEnabled(user: string | null, id: string): Promise<boolean> {
  if (!faceIdAvailable()) return false;
  const { flag } = await names(user, id);
  return (await AsyncStorage.getItem(flag)) === '1';
}

export async function saveFaceIdKey(user: string | null, id: string, salt: string, secret: Uint8Array): Promise<void> {
  if (!faceIdAvailable()) throw new Error('Face ID is unavailable. Enable it in iPhone Settings and use a development or TestFlight build.');
  if (!/^[a-f0-9]{32}$/.test(salt) || secret.length !== 32) throw new Error('This note cannot be enabled for Face ID.');
  const { key, flag } = await names(user, id);
  // The AES key is protected by the iOS Keychain biometric access policy,
  // never saved to AsyncStorage, the notes database, or the synced note.
  await duringBiometricPrompt(() => SecureStore.setItemAsync(key, JSON.stringify({ v: 1, salt, key: bytesToHex(secret) }), {
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    authenticationPrompt: 'Enable Face ID for your BestPad note',
  }));
  try {
    // Creating an iOS Keychain entry may not present a biometric challenge.
    // Confirm the enrollment through an authenticated read before enabling.
    const verified = await duringBiometricPrompt(() => SecureStore.getItemAsync(key, {
      requireAuthentication: true,
      authenticationPrompt: 'Confirm Face ID for your BestPad note',
    }));
    if (decodeBiometricKey(verified, salt) !== bytesToHex(secret))
      throw new Error('Face ID verification failed. Your note password still works.');
    await AsyncStorage.setItem(flag, '1');
    await updateRegistry(user, id, true);
  } catch (error) {
    // Failed/cancelled enrollment must not leave a usable Keychain credential.
    await SecureStore.deleteItemAsync(key).catch(() => undefined);
    await AsyncStorage.removeItem(flag).catch(() => undefined);
    throw error;
  }
}

export async function loadFaceIdKey(user: string | null, id: string, salt: string): Promise<Uint8Array | null> {
  if (!await faceIdEnabled(user, id)) return null;
  const { key } = await names(user, id);
  // Reading requires a fresh biometric prompt. Device PIN must not silently
  // become an unprotected copy of the note's password.
  const raw = await duringBiometricPrompt(() => SecureStore.getItemAsync(key, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock your BestPad note',
  }));
  const hex = decodeBiometricKey(raw, salt);
  if (!hex) {
    await clearFaceIdKey(user, id);
    throw new Error('Face ID needs to be enabled again. Unlock with your note password.');
  }
  return hexToBytes(hex);
}

export async function clearFaceIdKey(user: string | null, id: string): Promise<void> {
  const { key, flag } = await names(user, id);
  await SecureStore.deleteItemAsync(key);
  await AsyncStorage.removeItem(flag);
  await updateRegistry(user, id, false);
}

// Clear credentials across every tracked note as well as pre-registry notes
// still present in the user's workspace. Leave failed entries registered for
// a subsequent attempt instead of falsely reporting that cleanup succeeded.
export async function clearAccountFaceIdKeys(user: string, existingNoteIds: string[] = []): Promise<void> {
  const ids = new Set([...existingNoteIds, ...await registeredNotes(user)]);
  const failures: string[] = [];
  for (const id of ids) {
    const { key, flag } = await names(user, id);
    try {
      await SecureStore.deleteItemAsync(key);
      await AsyncStorage.removeItem(flag);
    } catch { failures.push(id); }
  }
  const index = await registryKey(user);
  if (failures.length) {
    await AsyncStorage.setItem(index, JSON.stringify(failures));
    throw new Error('Some Face ID credentials could not be removed from this iPhone.');
  }
  await AsyncStorage.removeItem(index);
}
