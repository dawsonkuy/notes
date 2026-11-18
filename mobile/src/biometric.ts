import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { decodeBiometricKey } from './biometricData';

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
  await SecureStore.setItemAsync(key, JSON.stringify({ v: 1, salt, key: bytesToHex(secret) }), {
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    authenticationPrompt: 'Enable Face ID for your BestPad note',
  });
  await AsyncStorage.setItem(flag, '1');
}

export async function loadFaceIdKey(user: string | null, id: string, salt: string): Promise<Uint8Array | null> {
  if (!await faceIdEnabled(user, id)) return null;
  const { key } = await names(user, id);
  // Reading requires a fresh biometric prompt. Device PIN must not silently
  // become an unprotected copy of the note's password.
  const raw = await SecureStore.getItemAsync(key, {
    requireAuthentication: true,
    authenticationPrompt: 'Unlock your BestPad note',
  });
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
}
