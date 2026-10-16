# GymFit – dynamic fitness website

A Node.js website with a real backend. No npm packages needed.

## Run it
1. Install Node.js 18 or newer (https://nodejs.org).
2. In this folder run:  `node server.js`
3. Open http://localhost:3000

Optional: `ADMIN_KEY=mysecret node server.js` (Windows PowerShell: `$env:ADMIN_KEY="mysecret"; node server.js`)
then open http://localhost:3000/admin.html to see free-trial requests and edit the site content.

## What is dynamic
- Goals, diet plans and all exercises are loaded from the server (`data/content.json`)
- Sign up / log in (passwords hashed with scrypt, secure session cookie)
- Logged-in users keep their profile, goal, workout log and water count on the server
- Free-trial form saves messages on the server
- Admin page to read requests and edit content without touching code

## Files
- `server.js` – web server + API
- `public/` – the website (index.html, admin.html, images)
- `data/content.json` – editable content; `data/db.json` – users and messages (created automatically)

## Notes
- Back up `data/db.json` to keep your user data.
- For a real public site, put the server behind HTTPS (e.g. a reverse proxy) and set `ADMIN_KEY`.

## Install as an app (PWA)
The site is an installable app (manifest, icons, offline support).
- Android / Chrome / Edge: open the site, tap **Install app** in the top bar (or the browser menu: Install / Add to Home screen).
- iPhone / iPad (Safari): tap Share, then **Add to Home Screen**.
- Installing needs HTTPS (or localhost). Host the folder on any Node host (Render, Railway, a VPS) and open the https:// address on your phone.
- To test on your phone over Wi-Fi without HTTPS, use Chrome's "Add to Home screen" shortcut; full install and offline mode need HTTPS.
- Offline: the pages, exercises and diet plans keep working without internet; login, logs and the form need a connection.
- A Play Store APK can be made from the hosted https site using PWABuilder.com or Bubblewrap (Trusted Web Activity).
