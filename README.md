# H7 LMS — web frontend

The browser app for H7 LMS: admins, teachers, students, parents and the online-tuition
programme all sign in here. React 18 + TypeScript + Vite, styled with Tailwind and
shadcn/Radix components, data fetched with TanStack Query.

It is one of three repositories:

| Repo | What it is |
| --- | --- |
| **`h7_lms_frontend`** (this one) | The web app, on Azure Static Web Apps |
| [`H7_LMS-`](https://github.com/Sebinmon-VR/H7_LMS-) | The FastAPI backend, on Azure App Service. Owns sign-in, data, files, live classes and email |
| [`h7-lms-app`](https://github.com/Sebinmon-VR/h7-lms-app) | The Expo (iOS/Android) app for students, teachers and parents. Ports this repo's `src/api` and `src/queries` |

**New to the project?** Read [HANDOVER.md](HANDOVER.md) first. It covers how the pieces
fit together, the accounts and secrets you need, and the traps to avoid.

---

## Quick start

Prerequisites: **Node.js 20 or newer** (developed on Node 24) and npm.

```bash
git clone https://github.com/Sebinmon-VR/h7_lms_frontend.git
cd h7_lms_frontend
npm install
cp .env.example .env
npm run dev                 # http://localhost:3000
```

The app needs a backend to talk to. Pick one in `.env`:

| You want to... | `.env` |
| --- | --- |
| Work against **your own backend** (recommended; see the backend README) | `VITE_API_BASE=` (empty)<br>`VITE_BACKEND_ORIGIN=http://127.0.0.1:8000` |
| Work on UI only, against the **deployed backend** (live data, so be careful) | `VITE_API_BASE=` (empty)<br>`VITE_BACKEND_ORIGIN=https://h7-lms-bknd-hhaqd9cdcfe7f9gh.indiasouthcentral-01.azurewebsites.net` |

Keep `VITE_API_BASE` **empty** in development either way. The dev server proxies `/api`,
`/uploads` and `/files` to `VITE_BACKEND_ORIGIN`, which keeps every request same-origin. A
non-empty `VITE_API_BASE` bypasses the proxy, so the browser talks straight to whatever it
names, usually production, without any warning.

After editing `.env`, restart `npm run dev` and hard-reload the browser (Ctrl+Shift+R).

Sign in with an account that exists on the backend you chose. A fresh backend database has
only the bootstrap admin (`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` in the
backend's `.env`). Create teachers and students from **Admin → Users**.

**Check which backend the browser is really using:** open
`http://localhost:3000/src/lib/env.ts` and read the `import.meta.env` line, or watch the
Network tab. Requests should go to `localhost:3000/api/v1/...`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000, with the API proxy |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | Typecheck, then a production build into `dist/`. **Fails unless `VITE_API_BASE` is set** to an absolute origin, which is deliberate (see below) |
| `npm run preview` | Serve `dist/` locally |
| `npm run legal` | Regenerate `public/legal/*.html` (privacy, terms, data deletion) from `scripts/legal/documents.ts`. The mobile app and the app stores link to these pages |

There is no test suite in this repo. `npm run typecheck` is the check to run before pushing.

To try a production build locally:

```bash
VITE_API_BASE=http://127.0.0.1:8000 npm run build && npm run preview
```

The build can run out of memory on small machines because the live-class (Azure calling)
bundle is large. CI uses `NODE_OPTIONS=--max-old-space-size=6144`; do the same locally if
you see a heap error.

---

## Deployment

**Pushing to `main` deploys to production.** There is no staging environment.

- Workflow: [.github/workflows/azure-static-web-apps-thankful-hill-090549110.yml](.github/workflows/azure-static-web-apps-thankful-hill-090549110.yml)
- Live site: https://thankful-hill-090549110.7.azurestaticapps.net
- The workflow runs `npm install && npm run build` with `VITE_API_BASE` taken from the
  repo's **Settings → Secrets and variables → Actions → Variables**, then uploads `dist/`
  to the Static Web App using the `AZURE_STATIC_WEB_APPS_API_TOKEN_THANKFUL_HILL_090549110`
  secret.
- Pull requests against `main` get their own preview URL (Static Web Apps staging
  environments). **Previews are built with the same `VITE_API_BASE`, so they use the
  production backend and its data.**
- `VITE_*` values are baked in at build time. Changing them in the Azure portal's Static
  Web App "Environment variables" blade has **no effect**. Change the GitHub Actions
  variable and re-run the workflow.
- `public/staticwebapp.config.json` sends unknown paths to `index.html` (client-side
  routing) but leaves `/legal/*`, `/arena/*` and static assets alone.

If a deploy goes out with the wrong API address, every request returns the site's own
HTML instead of JSON. `vite.config.ts` refuses to build with an empty, scheme-less or
path-carrying `VITE_API_BASE` to prevent exactly that.

A backend change that the frontend depends on must be deployed **first** (or together),
otherwise the new screens call endpoints that do not exist yet.

---

## Code map

```
src/
  api/          One <area>.api.ts per backend router + types. client.ts is the axios
                instance (bearer token, sign-out on an expired session); errors.ts
                turns API errors into plain messages. types.ts mirrors the
                backend's Pydantic schemas by hand.
  queries/      TanStack Query hooks per area; keys.ts holds every query key.
  pages/        One folder per role/area: admin, teacher, student, parent, tuition,
                exams, arena-manage, call (live class page), auth, shared.
  routes/       index.tsx (every route, lazy-loaded, with role guards) and
                navigation.ts (the sidebar menu for each role).
  components/   ui/ (shadcn primitives), layout/ (shell, sidebar, guards), domain/
                (LMS-specific widgets), charts/, forms/, arena/, feedback/.
  providers/    auth-provider.tsx (session, current user, role; renews the token
                through POST /auth/refresh before it runs out) and theme.
  content/      user-guide/: the in-app User Guide text, per role.
  lib/          env.ts (API base), datetime/format helpers, CSV, files, demo
                accounts, exam helpers, etc.
  styles/       index.css: the design tokens (light and dark). The mobile app
                copies these values, so keep them in step.
public/         arena/ artwork, legal/ pages, staticwebapp.config.json
scripts/        render-legal.mjs and the legal text it renders
```

### Adding a feature that the backend already has

1. Read the backend's router, schema and service for it:
   `H7_LMS-/app/api/v1/<area>.py`, `app/schemas/<area>.py`, `app/services/<area>.py`.
2. Mirror the Pydantic models into `src/api/types.ts` (or the area's `*.types.ts`).
3. Add the calls to `src/api/<area>.api.ts` and hooks to `src/queries/<area>.queries.ts`,
   with keys in `src/queries/keys.ts`.
4. Add the page under `src/pages/<role>/`, the route in `src/routes/index.tsx`, and the menu
   entry in `src/routes/navigation.ts`.
5. If students, teachers or parents use it, the mobile app needs the same change. Its README
   has a "Keeping it in step with the web app" section recording the last synced commit.

The backend's interactive API docs are at `<backend>/docs` (Swagger) when you run it
locally.

---

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Changes you made on your local backend don't show up, or new endpoints 404 | `VITE_API_BASE` is set in `.env`, so you are talking to production. Empty it, restart, hard-reload |
| `ECONNREFUSED 127.0.0.1:8000` in the dev-server log | Your backend isn't running, or is on another port |
| Login says "invalid credentials" locally | The account doesn't exist in *your* backend's database. Use the bootstrap admin |
| Build fails with `VITE_API_BASE is empty` | Expected for a bare `npm run build`. Set it (see Scripts) |
| Production shows a blank page or HTML parse errors on API calls | The GitHub Actions variable `VITE_API_BASE` is wrong or missing |
| CORS error against a deployed backend | Use the proxy (empty `VITE_API_BASE`) instead of calling it directly, or add your origin to the backend's `CORS_ALLOW_ORIGINS` |
