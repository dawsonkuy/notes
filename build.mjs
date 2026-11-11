import { copyFile, mkdir, rm } from 'node:fs/promises';

// Publish only browser assets, leaving server code and repository files private.
const output = new URL('./dist/', import.meta.url);
const assets = ['appearance.js', 'appearance.css', 'app-preview.html', 'index.html', 'style.css', 'app.js', 'auth.js', 'settings.js', 'logo.png', 'favicon.png', 'legal.css', 'privacy.html', 'terms.html', 'delete-account.html', 'support.html'];
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await Promise.all(assets.map(file => copyFile(new URL(file, import.meta.url), new URL(file, output))));
console.log(`Built ${assets.length} assets in dist/`);
