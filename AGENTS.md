# AGENTS.md

Instructions for AI agents working in this repository. This file is loaded into every
agent conversation, so it describes only what is stable and true of the project.

## Project

quizMaker is a quiz-authoring application. An administrator writes multiple choice
questions and anyone signed in can answer them, with each answer recorded as correct or
incorrect. Two modules are built and verified: authentication with user management
(`/login`, `/signup`, `/users`, `/account`), and multiple choice questions with attempts
(`/mcq`). Signing in lands on `/mcq`.

Nothing groups questions into a quiz yet — `mcqs` is a flat list. The technical PRDs in
`ai-workspace/` are the source of truth for what is being built and for the current phase
of work; read the one matching the area you are changing before changing it.

## Stack

- **Next.js 16** with the App Router and React 19
- **Cloudflare Workers** for hosting, via `@opennextjs/cloudflare`
- **Cloudflare D1** for storage, bound as `DB`, with migrations in `migrations/`
- **Tailwind CSS v4**, configured in CSS rather than a JS config file
- **shadcn/ui** on Base UI, `base-nova` style, with Lucide icons
- **Zod** for validation, applied in the service layer
- **Vitest** with Testing Library and jsdom for tests, configured in `vitest.config.mts`
- **TypeScript** in strict mode
- **Wrangler** for Cloudflare configuration, secrets, and deployment

No AI SDK is installed. Do not write code that imports one without adding it first and
telling the user.

### Layering

Strict, and the same in both modules. Each layer may only call the layer directly beneath
it. A route handler or page that issues SQL is a bug.

```
Presentation / API   src/app/**              Pages, Server Actions, route handlers
Service              src/lib/services/       Validation and all business rules
Repository           src/lib/repositories/   Prepared D1 statements, row mapping
Database             Cloudflare D1
```

`src/lib/db/client.ts` is imported only by repositories. D1 is server-only, so no
repository or service may be imported from a `'use client'` file.

## Layout

```
src/app/            Routes, layouts, and global styles (App Router)
src/components/ui/  shadcn/ui components (generated; avoid hand-editing)
src/lib/            Shared utilities and services
ai-workspace/       Technical PRDs and planning documents
.cursor/rules/      File-scoped conventions
.cursor/skills/     Task-specific guidance loaded on demand
public/             Static assets
```

Import through the `@/` alias, which maps to `src/`.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server on Node at `localhost:3000` |
| `npm run preview` | Build and run on the local **Workers** runtime |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run db:migrate` | Apply migrations to the **local** D1 instance |
| `npm run db:seed` | Seed the bootstrap admin (`admin` / `Password123!`) |
| `npm run deploy` | Build and deploy to Cloudflare |
| `npm run cf-typegen` | Regenerate `cloudflare-env.d.ts` after changing bindings |

`npm run dev` runs on Node and will not surface Workers-specific problems. Verify
anything runtime-sensitive with `npm run preview`.

Restart the dev server after any `wrangler.jsonc` change; bindings are read at startup.
Stop it before `npm run build`, since both write to `.next`.

## Working agreements

- **Do not deploy.** Never run `npm run deploy` unless explicitly asked.
- **Do not touch the remote database.** Migrations may be applied locally only.
- **Ask before adding a dependency.** This is a teaching repository; an unexplained
  dependency is a cost. Propose it and say why.
- **Do not edit generated files.** `cloudflare-env.d.ts`, `next-env.d.ts`, and
  `package-lock.json` are generated.
- **Keep secrets out of the repo.** Local values belong in `.dev.vars`, which is
  gitignored. When adding a variable, also add an empty placeholder to
  `.dev.vars.example`. Production values go in `wrangler secret put`.
- **Verify before claiming completion.** Run `npm test`, `npm run lint` and `npm run build`
  and report the actual result. Do not describe work as done based on inspection alone.
- **Validate every input with Zod in the service layer.** Both existing modules do, and it
  is the only thing enforcing rules the database cannot express.
- **Say when you are unsure.** A flagged uncertainty is more useful than a confident
  guess that has to be unwound later.

## Cursor Cloud specific instructions

Cloud agents have no Cloudflare credentials and no `.dev.vars`. In that environment:

- `npm run dev`, `npm run build`, and `npm run lint` work normally.
- `npm run preview`, `npm run deploy`, and any `wrangler` command that needs
  authentication will fail. This is expected. Do not try to authenticate.
- If a task genuinely requires Cloudflare access, stop and report that it must be run
  locally instead.
