# Notepad

A minimal grey browser Notepad with white text, multiple tabs, automatic local saving, and cursor status. Use + to create a tab. The pencil menu on each tab offers Rename, Save as, Share, and Delete. Drag tabs to reorder them; the order saves automatically. Notes are named from their first line unless you rename them. Leave a custom name blank to return to automatic naming.

Save as downloads the selected note as a text file. Share opens your device's share sheet where supported, or copies the note text to the clipboard. Sharing sends a copy of the text, not a live note link. The app fills the window with padding inside the editor.

Run `npm start` with Node.js 18 or later. The server listens on port 3000 (override with `PORT`). No dependencies or installation are required. Run `npm run check` for JavaScript syntax checks.

The editor opens immediately. Notes are saved in this browser's localStorage; there is no backend or cross-device sync. Clearing browser data removes notes. Use the pencil menu’s Save as action to download a copy.
