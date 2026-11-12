# Bestpad for Expo Go

A native React Native app with Notes and Settings. It uses the existing Bestpad Supabase project and `note_workspaces` table. The website stays in the repository root; this app is isolated in `mobile/`.

## Run on your iPhone

1. Install Node.js 24 LTS (24.3+), or Node.js 22.13+ on your computer.
2. Install **Expo Go** from the iPhone App Store.
3. In a terminal, run:

   ```bash
   git clone https://github.com/dawsonkuy/notes.git
   cd notes/mobile
   npm.cmd ci
   npm.cmd start
   ```

4. Connect the computer and iPhone to the same Wi-Fi network.
5. Scan the terminal QR code with the iPhone Camera, then tap **Open in Expo Go**.
6. Keep the terminal running while testing. In the app, open **Settings → Login / Create account** to access your existing Bestpad account and cloud notes.

If you already cloned the repository, run `git pull` in it, then `cd mobile`, `npm.cmd ci`, and `npm.cmd start -- --clear`. On Windows, use `npm.cmd` to avoid PowerShell execution-policy errors. On macOS/Linux, use `npm` instead.

This project targets **Expo SDK 58** for the current Expo Go app. If Expo Go reports an SDK mismatch, compare its supported SDK against the project's version before upgrading the dependencies.

If the QR code cannot connect over your network, stop Metro and try:

```bash
npx.cmd expo start --go --tunnel
```

Expo may prompt to install its tunnel package. This needs internet access and a running development server on your computer.

## Features

- Native notes library, editor, and bottom navigation for Notes / Settings. Note titles appear in the library, while the editor opens directly into the note body.
- Email/password sign-in and account creation against your existing Supabase project.
- Local saving with a recovery copy, 250 ms debounced cloud saving, and five-second retries after failed writes while the app is active.
- Existing note names, headings, checked/unchecked checklist items, and dividers are retained when editing website notes.
- Insert Heading, Current time, or Current date. Typing `/insert` at the cursor also opens the Insert sheet.
- Native system sharing of a plain-text copy.
- Light/Dark modes, color-wheel and hex editing for Font / Primary / Secondary, up to four named custom themes, four font choices, and three text sizes.

Guest notes and account notes are separate workspaces. Signing in loads that account's cloud notes; signing out returns to the device's guest notes. Guest notes are not automatically uploaded to another account.

Color preferences and saved themes stay on the device. Cloud notes sync with the website, but browser-local preferences and native-device preferences are separate.

## Typing

Return creates a new paragraph and continues lists. Backspace at the start of a heading or list item removes its formatting before joining paragraphs. Multiline paste keeps the following text and normalizes Windows line endings. Tap below the text to continue at the end, swipe down to dismiss the iOS keyboard, or use the checkmark button. Spellcheck and autocorrection are enabled; the system keyboard appearance follows light/dark mode. The editor scrolls growing text into view when typing at the end of a paragraph.

## Trash

The note's trash button moves it to **Trash** instead of deleting its contents. Open **Trash** from Notes to restore a note or choose **Delete permanently**, which requires confirmation. Trashed notes retain their names and formatting. They remain until manually removed; there is no automatic expiry. If the last active note is trashed, a new blank note is created so the editor stays usable.

Trash, restore, and permanent deletion sync with the website using the existing workspace and revision checks. Website Trash is in the notes sidebar. Update both clients to this version before using Trash.

## Delete an account

In the app, open **Settings → Account → Delete account**. On the website, open **Account → Delete account**. Confirm the permanent deletion. This deletes the signed-in Auth user and all their cloud notes (including Trash), clears that account's recovery cache on this device, and signs out. Guest notes and appearance preferences are kept. A failed server request keeps the account signed in and shows an error.

The server endpoint is in `supabase/functions/delete-account/`. It verifies the access token with Supabase Auth and uses only that verified user ID. Its service-role key is a server environment secret, never an app setting. The existing `ON DELETE CASCADE` foreign key removes the user's `note_workspaces` row. The function performs its own authentication, so gateway JWT verification is disabled in `supabase/config.toml`.

## Saving and conflicts

Wait for **Saved to cloud** before switching devices. Both the app and website listen for Supabase Realtime updates and refresh every three seconds while active as a fallback. New notes and edits appear without reloading; each device keeps its own open-note selection. Incoming updates never replace pending local edits. If another device has saved a newer workspace revision, the app keeps local changes and stops automatic writes rather than replacing the newer cloud copy.

To resolve a conflict, share a backup of your local note from the editor, return to Notes, and choose **Use cloud copy…**. That action requires confirmation and replaces the local workspace with the current cloud version. **Retry sync** retries failed reads/writes and preserves pending local changes.

## Configuration

The existing public Supabase URL and publishable key are configured in `src/supabase.ts`, so no environment file is required to test. There is no service-role key in the app. You can override the public settings with `.env` using the names in `.env.example`.

Email confirmation follows your project's Supabase setting. If confirmation is enabled, confirm via the email and return to the app to sign in. The signup redirect is `https://bestpad.app/`. Turning **Confirm email** off in the Supabase dashboard enables immediate signup/login; the app does not change that project setting.

No new database tables or permissions are required. The existing row-level security policies enforce each account's access.

## Validation

```bash
npm run typecheck
npm run lint
npm test
npx expo install --check
npm run export:ios
```

The iOS export checks that Metro and Hermes can bundle the native application. It does not install or sign an iPhone binary. Physical iPhone keyboard and gesture behavior should be checked in Expo Go.

For a browser smoke test of the same React Native screens:

```bash
npm run web
```

A later TestFlight/App Store release can use EAS Build. No Apple Developer account is needed for testing in Expo Go.

## Headings and lists (App Store editor)
The Insert sheet and `/insert` menu provide H1 (large), H2 (medium), H3 (small), bulleted lists, numbered lists, and checked/unchecked to-do lists, along with date and time. Pressing Return after a heading moves to normal text; pressing Return inside a list adds the next item, and pressing Return on an empty list item returns to plain text. Rich formatting persists in the existing `note_workspaces.tabs[].content` Quill Delta format without a database migration. Test editing the same note on mobile and on the website, including offline conflict recovery.

## App Store release preparation

**Recovery:** Use "Forgot password?" on the native login screen or in the website login dialog. An email links to `https://bestpad.app/?password_reset=1` to choose a new password in the browser. Return to the native app and sign in with it. This URL must be allowed in Supabase Auth redirect settings and the deployed website must serve the updated `auth.js`.

**Backups:** Notes → Export all creates a timestamped JSON file containing the complete currently selected guest or account workspace, including Trash and rich formatting. On iOS, it is saved under Files → On My iPhone → Bestpad (enabled via the expo-file-system config plugin), and the app opens the share sheet. Store another copy outside the device. If local and cloud notes conflict, the native "Back up local notes, then use cloud copy" flow creates the backup before offering replacement.

**Notes library:** Search filters the selected Notes/Trash view by note title or content. Rename sets a separate title without changing note text; choosing Automatic title returns to the first-line title behavior.

**Release:** `eas.json` defines a production build with remote build-number increments. The iOS bundle identifier is `app.bestpad.mobile` and v1 targets iPhone only (`supportsTablet: false`). On a Windows machine, sign in to Expo/Apple and run `npx.cmd eas-cli@latest init` once in `mobile/` to attach an EAS project ID, then `npx.cmd eas-cli@latest build --platform ios --profile production`. A production build needs App Store Connect access and must be validated in TestFlight before public submission. Do not set or guess a project ID in the repository.

The app uses standard HTTPS to connect to Supabase; the iOS export-compliance field `ITSAppUsesNonExemptEncryption` is set to false on that basis. Re-evaluate it if non-exempt cryptographic features are introduced.

Use `npm run typecheck`, `npm run lint`, `npm test` and `npx expo-doctor@latest` before building. Test the password reset email end-to-end and the backup's saved JSON file on a physical iPhone. Supabase's leaked-password-protection Auth toggle still requires a user with project admin access; enabling it changes Auth configuration, not note contents.

The public App Store Support URL is `https://bestpad.app/support.html`. Its support issue tracker is public, so do not ask users to post passwords, notes, or account identifiers. Before App Store submission, establish a private support contact for sensitive inquiries.
