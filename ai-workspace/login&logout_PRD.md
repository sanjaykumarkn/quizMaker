Date created: 2026-08-27
Date last modified: 2026-08-27

# Login, Logout and User Management - Technical PRD

## Overview/Problem

quizMaker has no concept of a user. Every visitor sees the same application and nothing can
be attributed to, or restricted to, a person. Before any quiz-authoring feature can be built,
the application needs a trustworthy answer to two questions: who is this request from, and is
that person allowed to do this? Today there is no users table, no login screen, no password
storage, and no way for an administrator to add or remove people from the system.

This module builds that foundation: a validated login page, credential verification against a
securely hashed password, server-side sessions, and full CRUD management of user records.

---

## Hypothesis

We believe that a layered authentication and user-management module built on Cloudflare D1
with WebCrypto password hashing will give quizMaker a secure, auditable identity foundation
that every later feature can depend on without reimplementing security-sensitive code.

---

## Scope

### In Scope

- `users` table in Cloudflare D1 with the required columns, uniqueness constraints and indexes
- `sessions` table backing revocable, server-side login sessions
- Login page at `/login` with client-side and server-side validation, masked password input,
  and protection against multiple submissions
- Credential verification against `password_hash` using PBKDF2-SHA256 via WebCrypto
- Generic error message for any failed login (no account enumeration)
- Logout that deletes the session row and clears the cookie
- REST API for user CRUD using correct HTTP methods, with `password_hash` never serialized
- Protected `/users` management screen exercising create, read, update and delete
- Public self-registration at `/signup`, linked from the login page, which creates the account
  through the same service as the administrative path and signs the new user in
- A `/forgot-password` page, linked from the login page, that explains how to get a password
  changed without pretending to send an email
- Strict layering: presentation → service → repository → database

- Two roles, `admin` and `member`, with user management restricted to administrators and a
  `/account` page as the member landing screen

### Out of Scope

- Any privilege level beyond the two roles, and per-resource permissions. `requireAdmin` is a
  single coarse gate, not a permission system.
- A member editing their own profile. `/account` is read-only; changes go through an admin.
- Self-service password reset by emailed one-time token. It needs a `password_reset_tokens`
  table and an email provider, neither of which exists here. `/forgot-password` collects the
  account and directs the user to an administrator instead.
- An administrator "set a new password" action on the `/users` screen
- Email verification of a new registration, "remember me", and account lockout after
  repeated failed attempts
- Rate limiting and CAPTCHA on the login and registration endpoints
- OAuth, SSO, or any third-party identity provider
- Audit logging of user-management actions

### Cut

- **bcrypt / argon2 hashing** - Both require native modules that cannot run on the Cloudflare
  Workers runtime. `bcryptjs` is pure JS but slow enough to risk the Worker CPU-time limit.
  PBKDF2 through WebCrypto is native to the runtime and needs no dependency.
- **Stateless JWT sessions** - Cheaper to verify but impossible to revoke server-side, which
  would make logout and user deletion cosmetic rather than real.
- **Next.js middleware for route protection** - Middleware cannot reliably reach D1 under
  OpenNext, so a session check there could only test for cookie presence, not validity.
  Protection therefore lives in the server component that renders the protected page.
- **react-hook-form** - The project rules forbid adding it without discussion; `useActionState`
  plus the `field` primitive covers the two forms in this module.

---

## Technical Requirements

### Architecture

Each layer may only call the layer directly beneath it. Nothing above the repository layer
issues SQL, and nothing below the API layer knows about HTTP.

```
Presentation / API Layer     src/app/**            Route handlers, Server Actions, pages, forms
        ↓                                          Parses HTTP/form input, maps errors to status codes
Business / Service Layer     src/lib/services/     Zod validation, uniqueness rules, hashing,
        ↓                                          session lifecycle, domain errors
Repository / Data Access     src/lib/repositories/ Prepared D1 statements, row-to-entity mapping
        ↓
Database                     Cloudflare D1         users, sessions
```

Cross-cutting modules sit beside the layers rather than inside them: `src/lib/errors.ts`
(domain error taxonomy), `src/lib/security/` (hashing and token generation),
`src/lib/validation/` (Zod schemas), `src/lib/types/user.ts` (domain types and the
public-view mapper).

### Database Schema

Column names use lowercase `id` (SQLite identifiers are case-insensitive, so this is
equivalent to the `Id` in the original requirement).

```sql
-- migrations/0001_create_users_table.sql
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_email ON users(email);
```

```sql
-- migrations/0003_add_user_role.sql
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

-- Keeps an existing database usable by promoting the first account created.
UPDATE users
SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);

CREATE INDEX idx_users_role ON users(role);
```

```sql
-- migrations/0002_create_sessions_table.sql
CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
```

The session cookie carries a random 256-bit token. Only its SHA-256 digest is stored, so a
database leak does not hand an attacker usable sessions.

### Password Storage

`password_hash` holds a single self-describing string so the parameters can be raised later
without breaking existing rows:

```
pbkdf2$sha256$100000$<base64 salt>$<base64 derived key>
```

- 16-byte random salt per user, 32-byte derived key, 100,000 iterations
- Verification re-derives with the stored salt and iteration count, then compares in constant
  time
- Plain-text passwords exist only as a local variable inside the service layer and are never
  logged, returned, or written to the database

**The iteration count is capped by the platform, not chosen.** The Workers runtime rejects
PBKDF2 above 100,000 iterations with `NotSupportedError`, so 100,000 is the ceiling. This is
below current OWASP guidance for PBKDF2-SHA256, which is the main residual weakness in this
design. Raising it requires either a different KDF or chaining several derivations, neither of
which is implemented. Because verification reads the iteration count from the stored string,
rows written at a different count stay verifiable as long as that count is also under the cap.

### API Endpoints

All responses are JSON. Errors share one envelope: `{ "error": { "code", "message", "fields"? } }`.
No response body ever contains `password_hash`.

#### POST /api/auth/login

**Request Body:**
```json
{ "username": "jdoe", "password": "correct horse battery staple" }
```

**Response:**
- Success (200): `{ "user": PublicUser }` plus a `Set-Cookie` for `qm_session`
- Error (400): `VALIDATION_ERROR` with per-field messages for empty or malformed input
- Error (401): `INVALID_CREDENTIALS`, message `"Invalid username or password."` for an
  unknown username and for a wrong password alike
- Error (500): `INTERNAL_ERROR`

#### POST /api/auth/register

Public. The only unauthenticated write in the system.

**Request Body:** the same shape as `POST /api/users`.

**Response:**
- Success (201): `{ "user": PublicUser }` plus a `Set-Cookie` for `qm_session`
- Error (400): `VALIDATION_ERROR` with per-field messages
- Error (409): `DUPLICATE_USERNAME` or `DUPLICATE_EMAIL`

Registration delegates to `usersService.create`, so validation, uniqueness and hashing are
identical to the administrative path. It then issues a session directly rather than calling
`login`, which would pay for a second PBKDF2 derivation.

#### POST /api/auth/logout

**Response:**
- Success (200): `{ "success": true }`, session row deleted and cookie expired
- Idempotent: succeeds even with no session cookie present

#### GET /api/auth/session

**Response:**
- Success (200): `{ "user": PublicUser }`
- Error (401): `UNAUTHENTICATED`

#### POST /api/users

Requires authentication.

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "username": "jdoe",
  "email": "jane@example.com",
  "password": "at least 8 characters"
}
```

**Response:**
- Success (201): `{ "user": PublicUser }`
- Error (400): `VALIDATION_ERROR` for missing or malformed fields
- Error (409): `DUPLICATE_USERNAME` or `DUPLICATE_EMAIL`
- Error (401): `UNAUTHENTICATED`

#### GET /api/users

Requires authentication. Returns `{ "users": PublicUser[] }`, newest first.

#### GET /api/users/[id]

Requires authentication. Returns `{ "user": PublicUser }` or 404 `USER_NOT_FOUND`.

#### PATCH /api/users/[id]

Requires authentication. Partial update of `firstName`, `lastName`, `username`, `email`.
Rejects an empty body with 400. Returns `{ "user": PublicUser }`, 404 if absent,
409 on a duplicate username or email belonging to another user. `PUT` is accepted as an
alias so either verb works.

#### DELETE /api/users/[id]

Requires authentication. Returns 204 with no body. Returns 404 if absent and 409
`CANNOT_DELETE_SELF` when the caller targets their own account. Deleting a user cascades
to their sessions, so a deleted user is logged out everywhere immediately.

`PublicUser` is `{ id, firstName, lastName, username, email, createdAt, updatedAt }`.

### User Interface Requirements

#### Login page (`/login`)

- Username and password fields, both required; password is `type="password"` so it is masked
- Client-side validation on submit: empty username, empty password, username shorter than
  3 characters. Messages render beneath the offending field through `FieldError`
- The submit button is disabled and relabelled "Signing in…" while the action is pending, so
  a second submission cannot be issued
- Failed authentication shows one generic banner: "Invalid username or password."
- On success, redirects to `/users`
- Already-authenticated visitors are redirected away from `/login`
- Two links below the form: "Forgot your password?" to `/forgot-password`, and
  "Create an account" to `/signup`

#### Signup page (`/signup`)

- Public. Already-authenticated visitors are redirected to `/users`
- First name, last name, username, email, password and a confirm-password field
- Confirmation is checked on the client only and is never sent to the server; the server has
  no notion of it
- Client-side rules mirror `createUserSchema`; the server revalidates everything
- Duplicate username or email is reported against the offending field
- Submit locks while pending
- On success the user is signed in and lands on `/users`

#### Forgot password page (`/forgot-password`)

- Public, and the only page in the module that never touches the database
- One field: username or email, required
- Submitting replaces the form with the same instruction regardless of input, so the page
  cannot be used to discover which accounts exist
- Explains that hashes cannot be reversed, so a password is replaced rather than recovered

#### Users management page (`/users`)

- Server component; unauthenticated visitors are redirected to `/login`
- Header shows the signed-in user's name and a Sign out button
- Table of all users: name, username, email, created date, and row actions
- "Add user" opens a dialog with first name, last name, username, email and password
- "Edit" opens the same dialog without the password field
- "Delete" asks for confirmation; the caller's own row cannot be deleted
- Server-side validation and duplicate errors surface inside the dialog, keeping the form
  filled in

---

## Implementation Phases

### Phase 1: Schema and Configuration - COMPLETED

**Objective**: A local D1 database with the users and sessions tables.

**Tasks**:
1. Add `zod` dependency
2. Add the `DB` D1 binding to `wrangler.jsonc` and regenerate `cloudflare-env.d.ts`
3. Write both migrations and apply them locally
4. Add a seed file and a password-hash helper script for bootstrapping the first user

**Deliverables**:
- `migrations/0001_create_users_table.sql`, `migrations/0002_create_sessions_table.sql`
- `db/seed.sql`, `scripts/hash-password.mjs`
- npm scripts `db:migrate`, `db:seed`, `hash-password`

### Phase 2: Foundation and Repository Layer - COMPLETED

**Objective**: Typed data access with no business rules in it.

**Tasks**:
1. Domain error taxonomy in `src/lib/errors.ts`
2. Domain types and the `toPublicUser` mapper
3. PBKDF2 hashing and session-token helpers
4. D1 client accessor
5. Users and sessions repositories using prepared statements

**Deliverables**:
- `src/lib/errors.ts`, `src/lib/types/user.ts`, `src/lib/security/*`, `src/lib/db/client.ts`
- `src/lib/repositories/users.repository.ts`, `src/lib/repositories/sessions.repository.ts`

### Phase 3: Service Layer - COMPLETED

**Objective**: All business rules in one place, reused by every caller.

**Tasks**:
1. Zod schemas for login, create-user and update-user
2. `usersService`: create, list, get, update, delete with uniqueness and required-field rules
3. `authService`: authenticate, create session, resolve session, revoke session

**Deliverables**:
- `src/lib/validation/*.ts`, `src/lib/services/users.service.ts`,
  `src/lib/services/auth.service.ts`

### Phase 4: API Layer - COMPLETED

**Objective**: HTTP surface that is a thin adapter over the services.

**Tasks**:
1. Shared error-to-status mapping and JSON helpers
2. Auth routes: login, logout, session
3. Users routes: collection and item, with authentication guards

**Deliverables**:
- `src/lib/http/api.ts`, `src/app/api/auth/**`, `src/app/api/users/**`

### Phase 5: Presentation Layer - COMPLETED

**Objective**: Login and user management screens.

**Tasks**:
1. Session cookie helpers and `requireSession` / `getCurrentUser` guards
2. Login page and client form with pending-state locking
3. Users page, table, add/edit dialog, delete confirmation
4. Server Actions delegating to the service layer

**Deliverables**:
- `src/lib/auth/session.ts`, `src/app/login/**`, `src/app/users/**`,
  `src/components/auth/**`, `src/components/users/**`

### Phase 6: Verification - COMPLETED

**Objective**: Prove the module works rather than assume it.

**Tasks**:
1. `npm run lint` and `npm run build` clean
2. Exercise every endpoint against a running server
3. Record results and any gotchas in this document

**Results** (2026-08-27, `next dev` with the local D1 binding):

- 26 API assertions passed, covering empty-credential validation, identical responses for an
  unknown username and a wrong password, 401 on every unauthenticated `/api/users` call,
  successful login and cookie issuance, create/read/update/delete, duplicate username and
  email conflicts, per-field validation errors, empty-PATCH rejection, the `PUT` alias,
  404 on unknown ids, self-deletion refusal, malformed JSON returning 400 rather than 500,
  logout idempotency, and post-logout session invalidation.
- Round trip confirmed: a user created through `POST /api/users` can log in with the password
  supplied at creation, and a one-character variation is rejected. This proves `hashPassword`
  and `verifyPassword` agree, and that the seed script's parameters match the application's.
- Deleting a user immediately invalidates that user's live session (`ON DELETE CASCADE`).
- `SELECT` against the table shows only `pbkdf2$sha256$210000$...` values, 90 characters long.
- The rendered `/users` HTML contains no `password_hash`, no `pbkdf2` string, and no session
  token. `/` and `/login` redirect correctly in both the signed-in and anonymous directions.

**Not verified**: the dialog interactions on `/users` (open, submit, close on success) and the
login form's pending-state lock were exercised through their Server Actions and rendered
markup, but not clicked through in a real browser.

### Phase 7: Signup and Forgot Password - COMPLETED

**Objective**: Let a visitor create their own account, and give a dead end for a lost password
an honest explanation.

**Tasks**:
1. Extract session issuance in `auth.service.ts` and add `register`
2. Public `POST /api/auth/register`
3. `/signup` page, Server Action and client form with confirm-password
4. `/forgot-password` page, Server Action and client form
5. Link both from `/login`

**Deliverables**:
- `src/app/signup/**`, `src/app/forgot-password/**`, `src/app/api/auth/register/route.ts`
- `src/components/auth/signup-form.tsx`, `src/components/auth/forgot-password-form.tsx`
- `authService.register` and the shared `issueSession` helper

### Phase 8: Roles and Authorization - COMPLETED

**Objective**: Make "signed in" and "allowed to manage users" different questions, now that
anyone can sign themselves up.

**Tasks**:
1. Migration adding `role`, defaulting to `member`, promoting the first existing account
2. Thread `role` through types, schemas, both repositories and the service
3. `requireAdmin` guard; apply to all `/api/users` routes and the `/users` Server Actions
4. `registerUserSchema` without `role`, so registration cannot self-promote
5. `assertNotLastAdmin` protecting the final administrator from deletion and demotion
6. `/account` landing page for members, and `landingPathFor` used by every redirect
7. Role badge in the users table and a role selector in the add/edit dialog

**Deliverables**:
- `migrations/0003_add_user_role.sql`, `src/lib/auth/landing.ts`, `src/app/account/page.tsx`
- `requireAdmin` in `src/lib/auth/session.ts`, `countAdmins` in the users repository
- `src/components/ui/select.tsx` (generated by the shadcn CLI, not a new dependency)

**Results**: 21 of 21 assertions passed. A `member` receives 403 `NOT_AN_ADMIN` on every one of
`GET`/`POST /api/users` and `GET`/`PATCH`/`DELETE /api/users/[id]`, while an anonymous caller
still receives 401, keeping "authenticate" and "not allowed" distinguishable. Registration with
`"role": "admin"` in the body produces a `member`. A member visiting `/users` is redirected to
`/account`, and `/` routes each role to its own landing page. An admin can promote and demote,
an unknown role is a 400, and demoting the only administrator is a 409 `LAST_ADMIN`.

**Note**: The dialog was restructured so the form is a child keyed by user id. The role selector
previously synchronised itself in an effect, which the `react-hooks/set-state-in-effect` rule
correctly rejected.

**Results (Phase 7)**: 15 of 15 assertions passed, covering both links on the login page, the two new
pages rendering with the right fields and two masked password inputs, unauthenticated
registration returning 201 with a session and no `password_hash`, duplicate username and email
conflicts, per-field validation errors, the registered password actually working at login and a
wrong one failing, a signed-in visitor being redirected off `/signup`, and `GET /api/users`
still returning 401 without a session. `npm run lint` and `npm run build` pass.

---

## Technical Implementation Details

### Key Files

| File | Layer | Purpose |
|---|---|---|
| `src/lib/errors.ts` | cross-cutting | `AppError` subclasses that services throw and the API maps to status codes |
| `src/lib/types/user.ts` | cross-cutting | `UserRecord` (internal, has hash), `PublicUser`, `toPublicUser` |
| `src/lib/security/password.ts` | cross-cutting | PBKDF2 `hashPassword` / `verifyPassword` |
| `src/lib/security/tokens.ts` | cross-cutting | `generateId`, `generateSessionToken`, `hashToken` |
| `src/lib/db/client.ts` | infrastructure | `getDb()` via `getCloudflareContext()` |
| `src/lib/repositories/users.repository.ts` | repository | Prepared SQL for users |
| `src/lib/repositories/sessions.repository.ts` | repository | Prepared SQL for sessions |
| `src/lib/services/users.service.ts` | service | CRUD rules, validation, hashing |
| `src/lib/services/auth.service.ts` | service | Credential check and session lifecycle |
| `src/lib/auth/session.ts` | presentation support | Cookie read/write, `requireUser`, `requireAdmin` |
| `src/lib/auth/landing.ts` | presentation support | Where each role belongs after signing in |
| `src/app/account/page.tsx` | presentation | Member landing page, read-only own profile |
| `src/lib/http/api.ts` | API | `jsonOk`, `errorResponse`, `withErrorHandling` |
| `src/app/login/page.tsx` + `actions.ts` | presentation | Login screen and its Server Action |
| `src/app/users/page.tsx` + `actions.ts` | presentation | Management screen and its Server Actions |

### Local setup

```bash
npm install
npm run db:migrate      # applies migrations to the local D1 instance
npm run db:seed         # bootstrap user: admin / Password123!
npm run dev
```

Restart the dev server after any `wrangler.jsonc` change; bindings are read at startup.
To generate a hash for a different seed password: `npm run hash-password -- "your password"`.

### Implementation Patterns

Repositories never leak SQL upward and never decide policy:

```typescript
export const usersRepository = {
  async findByUsername(username: string): Promise<UserRecord | null> {
    const db = await getDb();
    const { results } = await db
      .prepare("SELECT * FROM users WHERE username = ?1 LIMIT 1")
      .bind(username)
      .all<UserRow>();
    return results[0] ? mapRow(results[0]) : null;
  },
};
```

Services validate, enforce rules, and return public shapes only:

```typescript
async function create(input: unknown): Promise<PublicUser> {
  const data = parse(createUserSchema, input);          // throws ValidationError
  await assertUsernameAvailable(data.username);          // throws ConflictError
  const passwordHash = await hashPassword(data.password);
  return toPublicUser(await usersRepository.insert({ ...data, passwordHash }));
}
```

The API layer only translates:

```typescript
export const POST = withErrorHandling(async (request: Request) => {
  await requireApiSession();
  const user = await usersService.create(await readJson(request));
  return jsonOk({ user }, 201);
});
```

### Important Notes

- **Always use `?1`-style placeholders.** Anonymous `?` binding is unreliable in local Wrangler.
- **`all()`, not `first()`.** `first()` behaves inconsistently between local and remote D1.
- Login deliberately performs a dummy hash comparison when the username does not exist, so the
  response time does not reveal whether an account exists.
- `updated_at` is set explicitly by the repository on update. SQLite does not fire
  `ON UPDATE CURRENT_TIMESTAMP`.
- The session cookie is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure` outside development.
- D1 is server-only. No repository or service module may be imported from a `'use client'` file.

---

## Acceptance Criteria

- [x] Submitting the login form with either field empty shows a per-field message and no request
- [x] Password input is masked
- [x] The submit button locks while the login action is in flight, so a double click sends once
- [x] A wrong password and an unknown username produce the identical message
      "Invalid username or password."
- [x] A correct credential pair sets a session cookie and lands on `/users`
- [x] Sign out removes the session row and returns the visitor to `/login`
- [x] Visiting `/users` without a valid session redirects to `/login`
- [x] `POST /api/users` creates a user whose stored `password_hash` is a PBKDF2 string and whose
      plain password appears nowhere in the database
- [x] No API response, Server Action result, or page payload contains `password_hash`
- [x] A duplicate username returns 409 `DUPLICATE_USERNAME`; a duplicate email returns 409
      `DUPLICATE_EMAIL`
- [x] Creating a user with a missing required field returns 400 with the offending field named
- [x] `PATCH /api/users/[id]` updates only supplied fields and refuses an empty body
- [x] `DELETE /api/users/[id]` returns 204, cascades to sessions, and refuses self-deletion
- [x] Unauthenticated calls to any `/api/users` route return 401
- [x] The login page links to both `/signup` and `/forgot-password`
- [x] A visitor with no session can register at `/signup`, is signed in on success, and lands
      on `/users`
- [x] Registration enforces the same validation and uniqueness rules as `POST /api/users`
- [x] The confirm-password field is never transmitted to the server
- [x] `/forgot-password` returns the same response whatever is typed, so it cannot be used to
      discover accounts, and it issues no database query
- [x] A signed-in visitor is redirected away from `/signup` and `/login`
- [x] A self-registered account has role `member`, and supplying `"role": "admin"` in a
      registration body does not change that
- [x] A `member` receives 403 on every `/api/users` route, while an anonymous caller gets 401
- [x] A `member` visiting `/users` is redirected to `/account`, not to `/login`
- [x] An `admin` can promote and demote other users, and an unknown role value is a 400
- [x] Deleting or demoting the only remaining administrator returns 409 `LAST_ADMIN`
- [x] `npm run lint` and `npm run build` both pass

---

## Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Plain-text passwords in the database | 0 | `SELECT password_hash FROM users` shows only `pbkdf2$` strings |
| `password_hash` in any response | 0 occurrences | Inspect JSON from every endpoint and the rendered page payload |
| Login round trip | < 500 ms locally | Browser network panel on `POST /api/auth/login` |
| Failed-login information leakage | Identical message and status for all failures | Compare unknown-user and wrong-password responses |
| Layer violations | 0 | No `getDb` import outside `src/lib/repositories/`; no SQL outside repositories |

---

## Dependencies

### External Dependencies

- Cloudflare D1 - user and session storage, bound as `DB`
- Cloudflare Workers WebCrypto (`crypto.subtle`) - PBKDF2 derivation and SHA-256 digests
- `zod` - schema validation in the service layer

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` - the only way to reach bindings
- `next/headers` `cookies()` - session cookie read and write
- shadcn/ui `field`, `input`, `button`, `card`, `table`, `dialog`, `badge`, `label`

### Environment

- `wrangler.jsonc` `d1_databases` entry with binding `DB`
- No secrets are required. The session token is random, not signed, so there is no signing key.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: **Public signup combined with peer-level authorization.** `/users` and the whole
  `/api/users` surface authorized on "is signed in", which was reasonable while accounts could
  only be created by an existing user. Once anyone could register, anyone could reach the
  management screen and read, edit or delete every other account.
- **Mitigation**: RESOLVED in Phase 8. A `role` column (`admin` | `member`) plus a
  `requireAdmin` guard now gates every user-management route and Server Action. Registration
  cannot set a role, so self-registration always produces a `member`.

- **Risk**: Removing the last administrator would leave a database that nobody can administer,
  recoverable only with direct SQL.
- **Mitigation**: `assertNotLastAdmin` refuses both the delete and the demotion with 409
  `LAST_ADMIN` while only one admin remains.

- **Risk**: SQLite cannot add a CHECK constraint to an existing table, so the database itself
  does not restrict `role` to the two known values.
- **Mitigation**: `roleSchema` is the gate, and every write passes through it. The repository
  additionally treats any unexpected stored value as `member`, so a row edited by hand cannot
  grant administrator access.

- **Risk**: PBKDF2 at high iteration counts consumes Worker CPU time and could hit the limit
  under concurrent logins.
- **Mitigation**: 210,000 iterations measures well within the limit for a single request.
  The iteration count is embedded in each hash, so it can be tuned without a migration.

- **Risk**: A `UNIQUE` violation surfaces as an opaque D1 error rather than a clean 409.
- **Mitigation**: The service checks availability first, and the repository additionally
  translates SQLite `UNIQUE constraint failed` messages into `ConflictError`, closing the race
  between check and insert.

- **Risk**: The remote D1 database does not exist yet, so `wrangler.jsonc` carries a placeholder
  `database_id`.
- **Mitigation**: Local development and migrations work regardless. Deployment requires the
  user to run `wrangler d1 create` and paste the real id; this is called out in the README
  section of this document and in `.dev.vars.example` is not needed since there is no secret.

### User Experience Risks

- **Risk**: A generic login error frustrates users who mistyped their username.
- **Mitigation**: Accepted deliberately. Account enumeration is the greater harm; the message
  names both possibilities.

- **Risk**: Deleting a user is irreversible and the button sits in a dense table row.
- **Mitigation**: Delete requires confirmation in a dialog naming the user, and self-deletion
  is blocked outright.

---

## Troubleshooting Guide

### `env.DB` is undefined

**Problem**: `getDb()` throws "D1 binding \"DB\" is not available".
**Cause**: `wrangler.jsonc` is missing the `d1_databases` block, or `cloudflare-env.d.ts` was
not regenerated after adding it.
**Solution**: Add the binding, run `npm run cf-typegen`, and restart the dev server.
**Code Reference**: `src/lib/db/client.ts`

### `A "use server" file can only export async functions, found object`

**Problem**: Opening `/users` in a browser throws during module evaluation, so the page and its
dialogs fail even though the REST API works and `npm run build` reports success.
**Cause**: `src/app/users/actions.ts` carries the `"use server"` directive, which restricts the
module to async-function exports only. It also exported `idleUserFormState`, a plain object.
The build does not catch this because `/users` is dynamic and is never rendered at build time.
**Solution**: Shared values used by both the actions and the client components live in
`src/app/users/form-state.ts`, which has no `"use server"` directive. A `"use server"` module
may still export TypeScript types, since those are erased at compile time.
**Code Reference**: `src/app/users/form-state.ts`, `src/app/users/actions.ts:1`

### `Base UI: A component is changing the default value state of an uncontrolled FieldControl`

**Problem**: A console error appears on the login page after a failed sign-in attempt.
**Cause**: React resets uncontrolled fields in a form driven by an action, so the username was
echoed back through `defaultValue`, which then changed after initialization.
**Solution**: The username input is controlled by local component state, which survives a
failed attempt without any echo from the server.
**Code Reference**: `src/components/auth/login-form.tsx`

### `D1 binding "DB" is not available` while `wrangler.jsonc` clearly has the binding

**Problem**: Every database-backed request returns 500 even though the config is correct.
**Cause**: `initOpenNextCloudflareForDev()` reads `wrangler.jsonc` once, when the dev server
starts. A server that was already running when the binding was added never sees it.
**Solution**: Restart `npm run dev` after any change to `wrangler.jsonc`. Next 16 refuses a
second dev server in the same directory, so stop the old one first.

### `wrangler` rejects the project name

**Problem**: Every wrangler command fails with `Expected "name" to be ... alphanumeric and
lowercase with dashes only`.
**Cause**: The starter shipped `"name": "quizMaker"`, which wrangler will not accept.
**Solution**: The worker name is now `quizmaker`. Keep it lowercase.

### `no such table: users`

**Problem**: Every query fails against a fresh checkout.
**Cause**: Migrations have not been applied to the local D1 instance.
**Solution**: `npm run db:migrate`, then `npm run db:seed` for the bootstrap user.

### Cannot log in on a fresh database

**Problem**: The seeded credentials are rejected.
**Cause**: The seed hash was generated with different PBKDF2 parameters than the code uses.
**Solution**: Regenerate with `npm run hash-password -- "<password>"` and update `db/seed.sql`.
**Code Reference**: `scripts/hash-password.mjs`

### D1 binding errors mentioning parameter counts

**Problem**: "Wrong number of parameter bindings" from a query that looks correct.
**Cause**: Mixing anonymous `?` and numbered `?1` placeholders in one statement.
**Solution**: Use numbered placeholders exclusively.

### Every login fails on the deployed Worker but works with `npm run dev`

**Problem**: The deployed app answers "Invalid username or password." for known-good
credentials, and registration returns 500, while the same credentials work locally.
**Cause**: PBKDF2 iterations above 100,000. The Workers runtime throws
`NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported`. In
`hashPassword` that surfaces as a 500; in `verifyPassword` the `catch` turns it into `false`,
which is indistinguishable from a wrong password. Node has no such cap, so `npm run dev`
cannot reproduce it.
**Solution**: Keep `ITERATIONS` at or below 100,000 in both `src/lib/security/password.ts` and
`scripts/hash-password.mjs`, then re-hash any rows written at a higher count.
**How it was found**: `npx wrangler tail quizmaker --format json` showed the real exception. A
swallowed error in a verification path is invisible from the outside, so check the logs before
suspecting the data.
**Code Reference**: `src/lib/security/password.ts`

---

## Notes for AI Agents

When working with this PRD:
1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries - do not build out-of-scope items
3. Respect the layering table. New database access belongs in a repository, new rules in a
   service, and new HTTP concerns in a route handler. A route handler that issues SQL is a bug.
4. Update phase status markers as work progresses
5. Add implementation details under "Technical Implementation Details" as code is written
6. Mark acceptance criteria as complete when features work
7. Add troubleshooting entries when bugs are found and fixed
8. Use code references format: `filepath:line-number` when citing code

---

## Current Status

**Last Updated**: 2026-08-31
**Current Phase**: Phase 8 - Roles and Authorization
**Status**: COMPLETED. All eight phases are implemented and verified locally. `npm run lint`
and `npm run build` pass; 26 of 26 core API assertions, 12 of 12 page-rendering assertions,
15 of 15 signup assertions and 21 of 21 role assertions pass.
**Next Steps**:
1. Rate limiting on `POST /api/auth/login` and `POST /api/auth/register` is now the most
   valuable security addition still missing. Nothing slows a password-guessing loop, and
   registration is open to automated abuse.
2. Before deploying: run `npx wrangler d1 create quizmaker-db`, replace the placeholder
   `database_id` in `wrangler.jsonc`, and apply the migrations remotely. Change the seeded
   admin credentials.
3. Verify on the Workers runtime with `npm run preview`; `npm run dev` runs on Node and will
   not surface Workers-specific problems.
4. Rate limiting on `POST /api/auth/login` is the most valuable security addition still
   missing, since nothing currently slows down a password-guessing loop.
