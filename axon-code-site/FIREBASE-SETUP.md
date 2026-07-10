# Firebase setup — Veylaro (project 451819388140)

The site is already wired to the `veylaro` Firebase project (`src/lib/firebase.ts`).
Three one-time steps in the [Firebase console](https://console.firebase.google.com/project/veylaro)
finish the job:

## 1. Enable Email/Password sign-in
**Build → Authentication → Sign-in method → Email/Password → Enable.**
Then open the site's `/#/admin`, keep your email, type the admin password you want,
and press **"First time? Create admin account."** Done — from then on it's sign-in only.
(Only `leoanthonybons@gmail.com` is allowed through the gate — the list lives in
`src/lib/firebase.ts` → `SUPER_ADMINS`.)

## 2. Create the Firestore database
**Build → Firestore Database → Create database → Production mode** (any region).

## 3. Publish the security rules
**Firestore → Rules**, paste the contents of [`firestore.rules`](firestore.rules), **Publish**.
These rules let anyone submit a register-interest email (create-only, validated),
while reads/deletes are locked to the super-admin account.

That's it. The **Register interest** forms (home, /download, /code) write to the
`interest` collection, and **Mission Control → Register interest** (`/#/admin`)
shows every signup with CSV export.

## Notes
- The web config in `src/lib/firebase.ts` is a public client key — safe in the repo.
- Never commit passwords; the admin password lives only in Firebase Auth.
- The Firebase MCP (`firebase-tools`) is registered in `~/.claude.json` for future
  Claude sessions — run `npx firebase-tools login` once to let it manage the project
  (rules deploys, user management) from chat.
