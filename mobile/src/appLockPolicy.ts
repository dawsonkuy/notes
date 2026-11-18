// Keep protected notes locked for real app interruptions. A Face ID sheet
// itself briefly makes iOS report 'inactive'; that alone must not relock.
export function shouldLockNotes(appState: string, biometricPromptInProgress: boolean): boolean {
  if (appState === 'active') return false;
  if (appState === 'inactive' && biometricPromptInProgress) return false;
  return true;
}
