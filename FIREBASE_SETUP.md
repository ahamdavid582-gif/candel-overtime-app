Firebase setup and deploy steps
=================================

This project includes a minimal `firebase.json` to host the built SPA from the `dist/` directory.

Before `firebase deploy` will work you must create or link a Firebase project and set it as the active project for this repo.

Quick options (pick one):

1) Create a new Firebase project in the Console (recommended UI)
   - Open: https://console.firebase.google.com/
   - Click “Add project” → follow steps and create a project (e.g., `candel-overtime-app`).
   - After project is created, go to Project settings and add any Authorized domains needed (e.g., `localhost:5173`, `candel-overtime-app.firebaseapp.com`, or your custom domain).

2) Create a new Firebase project from the CLI
   - Requires `firebase-tools` installed and you logged in with the correct Google account.

     ```powershell
     npm install -g firebase-tools
     firebase login
      firebase projects:create candel-overtime-app --display-name "Candel Overtime App"
     ```

   - After creating, you may need to enable Firebase services in the Console (Authentication, Hosting).

3) Link an existing Firebase project to this repo (if you created it via console)
   - From your project folder run:

     ```powershell
     firebase login
     firebase use --add
     ```

   - Choose the project id (for example `candel-overtime-app`) and set an alias (e.g., `default`). This updates `.firebaserc`.

Deploy steps
------------
After you have a Firebase project created and selected for this repo, build and deploy:

```powershell
cd C:\Users\Dell\candel-overtime-app
npm run build
firebase deploy --only hosting
```

Notes & troubleshooting
-----------------------
- If you see `Error: Not in a Firebase app directory (could not locate firebase.json)` — you now have a `firebase.json` file in the repo root. If the file was not committed, ensure it exists and try again.
- If `firebase deploy` complains about project not set, run `firebase use --add` and select your project.
- To test verification links locally during dev, add `http://localhost:5173` to Firebase Console → Authentication → Authorized domains.
- If you prefer not to create a project, you can change verification flow to use a different domain (for dev) — see `src/App.jsx` actionCodeSettings where we use `/verify`.

If you want, I can:
- Create the Firebase project for you (I cannot run commands in your Google account), or
- Patch the repo further to use an environment variable for the verification URL (dev vs prod), or
- Walk you through the interactive `firebase init` selection once you've logged into the desired account.

Helper script
-------------
I added a small PowerShell helper at `scripts\create-firebase-project.ps1` to run the `firebase projects:create` command and guide you through next steps. To run it (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-firebase-project.ps1 -ProjectId candel-overtime-app -DisplayName "Candel Overtime App"
```

This script will:
- Ensure the Firebase CLI is available
- Run `firebase login` if you're not signed in
- Call `firebase projects:create` with the provided id

After the script completes, run:

```powershell
firebase use --add
npm run build
firebase deploy --only hosting
```

