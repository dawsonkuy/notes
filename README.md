# Notepad

A minimal browser Notepad with a grey background, white text, multiple tabs, immediate local saving, text file import/export, word wrap, and cursor status. Use the top-left hamburger menu for File, Edit, and Format commands; use + to create a tab. Open files appear in their own tabs.

Run `npm start` with Node.js 18 or later. The server listens on port 3000 (override with `PORT`). No dependencies or installation are required. Run `npm run check` for JavaScript syntax checks.

The editor opens immediately. Notes are saved in this browser's localStorage; there is no backend or cross-device sync. Clearing browser data removes notes. Use File → Save as to download a copy.
