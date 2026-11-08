# Notepad

A minimal grey browser Notepad with white text, multiple tabs, automatic local saving, and cursor status. Use + to create a tab. The pencil menu on each tab offers Rename, Save as, Share, and Delete. Drag tabs to reorder them; the order saves automatically. Notes are named from their first line unless you rename them. Leave a custom name blank to return to automatic naming.

Save as downloads the selected note as a text file. Share opens your device's share sheet where supported, or copies the note text to the clipboard. Sharing sends a copy of the text, not a live note link. The app fills the window with padding inside the editor.

Run `npm start` with Node.js 18 or later. The server listens on port 3000 (override with `PORT`). No installation is required. Authentication loads the pinned Supabase JavaScript client (2.119.0) from jsDelivr. Run `npm run check` for JavaScript syntax checks.

The editor opens immediately. Signed-out notes save in this browser’s localStorage. Signed-in notes also autosave to Supabase and load when you sign in on another device. Clearing browser data removes notes. Use the pencil menu’s Save as action to download a copy.

## Account login

The Login button at the top right opens an email/password popup supporting email/password sign-in, account creation, persistent sessions, and sign-out through Supabase project `pskrlifkffcpggcarnon`. Only its public publishable key is included in the browser. No secret or service-role key is required.

New accounts must confirm their email before signing in. Set the production Site URL in [Supabase Auth URL configuration](https://supabase.com/dashboard/project/pskrlifkffcpggcarnon/auth/url-configuration) so confirmation links return to the deployed app. Supabase's default email service restricts recipients; configure custom SMTP before offering public signups.

Signed-in notes autosave to Supabase after 700 ms without changes. Each account has its own workspace protected by row level security. Tab contents, names, order, and the active tab are saved together. The first account used in a browser imports its existing local notes when no cloud workspace exists; the original local copy stays available after sign-out.

A local recovery copy is written immediately. Failed writes retry while the page is open; reconnecting retries failed reads. Wait for “Saved to Supabase” before closing the page or switching devices. Notes load from Supabase at sign-in; simultaneous device edits use revision checks, and conflicting changes stay local with a warning instead of overwriting cloud notes. Download local changes before clearing browser storage or resolving a conflict. Signing out returns to the separate guest workspace.

## Cloudflare Workers deployment

The Worker `notes` serves static assets built into `dist/`. `wrangler.jsonc` runs the build automatically before publishing. In Cloudflare Workers Builds, connect this repository's `main` branch with root directory `/`, build command `npm run build`, and deploy command `npx wrangler deploy`. Keep the existing `bestpad.app` custom domain attached to `notes`. Do not use `npm start` as the Cloudflare build command; that starts the local Node server.

Run `npm run build` to check the asset bundle locally. Only browser assets are copied. No custom Worker script or database binding is required; the browser connects directly to Supabase.

For the custom domain, set the Supabase Auth Site URL to `https://bestpad.app/` and add it to the allowed redirect URLs.

## Headings

Use Body, H1, H2, or H3 above the editor to format the current paragraph or selected paragraphs. Headings use the chosen note font and scale relative to the Small, Medium, or Large base size. Formatting is stored alongside plain note text in the existing workspace JSON, so headings survive local saving, cloud saving, and tab switching. Older plain-text notes remain supported. Save as and Share export plain text.

The rich editor uses Quill 2.0.3, loaded from jsDelivr. If it cannot load, the plain-text editor stays available. Only text, heading levels, checked/unchecked checklist items, and the app’s divider embeds are accepted when restoring formatted notes.

The Insert menu inserts headings, the current local time/date, interactive checklists, and dividers. Checklist states and dividers autosave inside the workspace alongside the rest of the note.

## App interface

The desktop layout has a searchable notes sidebar and a focused editor with rename, download, and share controls. On phones, use the notes button beside the logo to open the notes drawer. Insert stays in the header with Heading, Current time, and Current date. The app retains the existing local/cloud workspace format and autosave behavior.

The sidebar supports vertical drag reordering on desktop, Up/Down/Home/End keyboard navigation, and Ctrl+Alt+N for a new note. All themes use solid backgrounds, and note fonts and text sizes remain adjustable in Settings.

Type `/insert` in a note to open Heading, Current time, and Current date at the cursor. Use Up/Down and Enter, or tap an option. Choosing an item replaces the command; Escape dismisses the menu and leaves the typed text intact. The same actions are available from Insert in the header.

## Custom appearance

The website and iPhone app preview share appearance controls: Light/Dark starting modes, a color wheel with brightness and hex editing for Font, Primary (background), and Secondary (cards and controls), and up to four named custom themes. Apply, update, or delete saved themes in Settings. Switching Light/Dark resets the current colors to that mode’s starting colors and keeps saved themes.

Appearance preferences and saved themes persist on the current device using the same origin-scoped localStorage key on both interfaces. They are separate from the notes workspace and do not change note contents or account permissions.
