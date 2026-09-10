Date created: 2026-09-10
Date last modified: 2026-09-10

# Multiple Choice Questions - Technical PRD

## Overview/Problem

quizMaker can now tell who a request is from and whether that person is an administrator, but
it has nothing for them to do. There is no quiz content in the system at all: no question, no
answer, no record that anyone ever answered anything. An administrator signs in and lands on a
user-management table; a member signs in and lands on a read-only copy of their own profile.

This module gives the application its first real subject matter. An administrator can author a
multiple choice question with between two and six answer choices, exactly one of which is
correct, and can list, edit, preview and delete those questions. Any signed-in user can attempt
a question and have the outcome recorded as correct or incorrect. The MCQ list becomes the
landing screen after login, replacing `/account` as the first thing a signed-in user sees.

---

## Hypothesis

We believe that modelling a question, its choices and its attempts as three related tables
behind a single service will give quizMaker a content foundation that supports authoring today
and scoring, reporting and quiz assembly later, without any caller needing to know how a
question is stored or how an answer is graded.

---

## Scope

### In Scope

- `mcqs` table holding the question record: `id`, `name`, `description`, author, timestamps
- `mcq_choices` table holding two to six choices per question, ordered, with a correct flag,
  and a foreign key back to `mcqs`
- `mcq_attempts` table recording who attempted which question, what they picked, and whether
  that pick was correct
- `mcqService` owning every rule: choice-count bounds, exactly one correct choice, distinct
  choice text, and the grading of an attempt
- REST API for MCQ create, read, update and delete, plus attempt submission and attempt listing
- List page at `/mcq` showing a table of questions with name, description, choice count and
  timestamps, a **Create** button, and a per-row actions menu offering **Edit**, **Preview** and
  **Delete**
- Full-page authoring form at `/mcq/new` and `/mcq/[id]/edit` with **Save** and **Cancel**
  buttons, a repeatable choice editor bounded at two and six rows, and a radio selecting the
  correct choice
- Preview and attempt screen at `/mcq/[id]/preview` that renders the question as a learner sees
  it, accepts one answer, records the attempt and reports correct or incorrect
- Authoring restricted to `admin`; attempting and previewing open to any signed-in user
- `/mcq` as the post-login landing page for both roles, with `/account` still reachable
- Vitest as the project's test harness, with the service, validation and grading rules driven
  out test-first
- The same strict layering as the auth module: presentation → service → repository → database

### Out of Scope

- Grouping questions into a quiz, an exam or a question bank. A question stands alone here.
- Question types other than single-answer multiple choice: no multi-select, free text, true or
  false, matching or ordering.
- Rich text, images, code blocks or LaTeX in a question or a choice. Both are plain text.
- Per-question scoring weights, partial credit, negative marking and time limits.
- A results or analytics dashboard. Attempts are recorded and retrievable through the API, but
  no aggregate reporting screen is built.
- Limiting how many times a user may attempt the same question, or resuming an attempt.
- Explanations or feedback text shown after answering, beyond correct or incorrect.
- Pagination, search, sorting and filtering on the `/mcq` table.
- Import or export of questions in any format, and AI-assisted question generation.
- Soft delete, versioning and an audit trail of edits.

### Cut

- **A separate `choices` service and repository** - A choice has no independent lifecycle. It
  cannot exist without its question, is never addressed on its own, and is always written as
  part of a whole question. Giving it its own service would create an aggregate boundary the
  domain does not have, and would let a caller write four choices with no correct answer.
  `mcqsRepository` owns both tables and always returns a question with its choices attached.
- **`ON DELETE CASCADE` from `mcq_attempts.choice_id`** - Correct on the surface, wrong in
  effect. Editing a question replaces its choice rows, which would silently delete the attempt
  history of everyone who had already answered. Attempts use `ON DELETE SET NULL` and carry a
  `selected_text` snapshot, so a recorded result stays true after the question is reworded.
- **A `CHECK` constraint on the choice count** - SQLite cannot express "between two and six
  rows in a child table" as a constraint. The bound is enforced by `mcqChoicesSchema` and by
  the service, and tested there.
- **Diffing choices on update** - Matching submitted choices to existing rows to issue the
  minimal set of inserts, updates and deletes. The choice set is at most six rows, so replacing
  all of them inside one `db.batch()` transaction is simpler, atomic, and impossible to get
  subtly wrong.
- **`@cloudflare/vitest-pool-workers`** - Would let tests exercise real D1 rather than a mocked
  repository, but it changes how the entire suite runs and pulls in a Workers pool. The rules
  in this module are all above the SQL boundary, so mocking the repository tests them honestly.
- **`@vitejs/plugin-react`** - Cut because it cannot be installed. Its current release needs
  Babel 8 through `@rolldown/plugin-babel`, while `shadcn` pins Babel 7, so npm cannot resolve
  the tree. Nothing in the suite needs it: Vite's esbuild transform compiles `.tsx` using the
  `jsx: "react-jsx"` setting already in `tsconfig.json`, and Fast Refresh is meaningless in a
  test run. The project's testing skill recommends it; the skill is wrong for this repo.
- **`vite-tsconfig-paths`** - Installed, then removed. Vite resolves tsconfig paths natively
  via `resolve.tsconfigPaths: true`, and told us so on the first run. One fewer dependency for
  the same behaviour.
- **A `Textarea` for the description with a character counter** - The counter is UI polish; the
  500-character limit is already reported by `FieldError` on submit.

---

## Technical Requirements

### Architecture

Unchanged from the auth module. Each layer may call only the layer directly beneath it.

```
Presentation / API Layer     src/app/**            Pages, Server Actions, route handlers
        ↓                                          Parses HTTP/form input, maps errors to status
Business / Service Layer     src/lib/services/     Zod validation, choice-count and
        ↓                                          single-correct rules, attempt grading
Repository / Data Access     src/lib/repositories/ Prepared D1 statements, row-to-entity mapping
        ↓
Database                     Cloudflare D1         mcqs, mcq_choices, mcq_attempts
```

Two rules from the auth module carry over and are worth restating because this module is the
first place they could plausibly be broken:

- **Grading happens in the service, never in the browser.** The client is told whether an
  answer was correct only after the server has decided. `isCorrect` is stripped from any
  payload sent to a user who is about to answer.
- **No route handler or page issues SQL.** `getDb` is imported only by repositories.

### Database Schema

```sql
-- migrations/0004_create_mcq_tables.sql

CREATE TABLE mcqs (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcqs_created_at ON mcqs(created_at);
CREATE INDEX idx_mcqs_created_by ON mcqs(created_by);
```

`created_by` is `ON DELETE SET NULL` rather than `CASCADE`. Deleting the administrator who
wrote a question must not delete the question; the content outlives the account.

```sql
CREATE TABLE mcq_choices (
  id         TEXT PRIMARY KEY,
  mcq_id     TEXT NOT NULL REFERENCES mcqs(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mcq_id, position)
);

CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices(mcq_id);
```

This is the foreign key that ties a choice to its question. `CASCADE` is right here, unlike on
attempts: a choice genuinely cannot outlive its question. `position` is zero-based and gives
the choices a stable display order, since SQLite makes no promise about row order without an
`ORDER BY`. `is_correct` is `INTEGER` because SQLite has no boolean type; the repository maps
it to and from a TypeScript `boolean` so nothing above the repository sees a `0` or a `1`.

```sql
CREATE TABLE mcq_attempts (
  id            TEXT PRIMARY KEY,
  mcq_id        TEXT NOT NULL REFERENCES mcqs(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  choice_id     TEXT REFERENCES mcq_choices(id) ON DELETE SET NULL,
  selected_text TEXT NOT NULL,
  is_correct    INTEGER NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts(mcq_id);
CREATE INDEX idx_mcq_attempts_user_id ON mcq_attempts(user_id);
CREATE INDEX idx_mcq_attempts_mcq_user ON mcq_attempts(mcq_id, user_id);
```

An attempt is a historical fact and is never recalculated. `is_correct` is decided once, at
submission, by comparing the chosen choice against the `is_correct` column as it stood at that
moment. `selected_text` snapshots what the user actually clicked, so the row still reads
sensibly after the question has been edited and `choice_id` has become `NULL`.

### Domain Types

`src/lib/types/mcq.ts` mirrors the `UserRecord` / `PublicUser` split in `src/lib/types/user.ts`,
and for the same reason: one field must not cross one particular boundary.

| Type | Contains `isCorrect` | Used for |
|---|---|---|
| `Mcq` | yes | The authoring view. Admin only. |
| `McqSummary` | no choices at all | The `/mcq` table. Carries `choiceCount`. |
| `McqForAttempt` | **no** | The preview and attempt view, for any signed-in user. |
| `McqAttempt` | `isCorrect` is the *result*, not the answer key | Recorded outcomes. |

`toAttemptView(mcq)` performs the strip. It copies an explicit allowlist of choice fields
rather than deleting `isCorrect` from a spread, so the answer key cannot leak back in later by
omission.

```typescript
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;
```

Both constants are exported and used by the schema, the service and the choice editor, so the
bound cannot drift between the rule and the UI that enforces it.

### Validation Rules

`src/lib/validation/mcq.schemas.ts`, consumed through the existing `parse()` helper.

| Field | Rule |
|---|---|
| `name` | required, trimmed, 1–120 characters |
| `description` | required, trimmed, 1–500 characters |
| `choices` | array of 2–6 entries |
| `choices[].body` | required, trimmed, 1–300 characters |
| `choices[].isCorrect` | boolean |
| `choices` | exactly one entry has `isCorrect: true` |
| `choices` | no two entries have the same `body`, compared case-insensitively |
| `choiceId` (attempt) | required, non-empty string |

Update is a partial of `name`, `description` and `choices`, and rejects an empty body with the
same "Provide at least one field to update." message the users module uses. When `choices` is
supplied it is validated as a whole; a partial choice list is not a concept.

The exactly-one-correct rule attaches its message to the `choices` path so the form can render
it next to the choice editor rather than as an anonymous banner.

### API Endpoints

All responses are JSON and share the existing error envelope:
`{ "error": { "code", "message", "fields"? } }`.

#### GET /api/mcqs

Requires authentication. Returns `{ "mcqs": McqSummary[] }`, newest first.

- Error (401): `UNAUTHENTICATED`

#### POST /api/mcqs

Requires **admin**.

**Request Body:**
```json
{
  "name": "Capital of France",
  "description": "Pick the correct capital city.",
  "choices": [
    { "body": "Paris", "isCorrect": true },
    { "body": "Lyon", "isCorrect": false }
  ]
}
```

**Response:**
- Success (201): `{ "mcq": Mcq }`
- Error (400): `VALIDATION_ERROR`, including `TOO_FEW_CHOICES`, `TOO_MANY_CHOICES`,
  no-correct-choice and duplicate-choice cases, all reported against `choices`
- Error (401): `UNAUTHENTICATED`
- Error (403): `NOT_AN_ADMIN`

#### GET /api/mcqs/[id]

Requires authentication. An `admin` receives `{ "mcq": Mcq }` with `isCorrect` on each choice.
A `member` receives `{ "mcq": McqForAttempt }` with no `isCorrect` at all, because a member who
can read the answer key does not need to attempt anything.

- Error (404): `MCQ_NOT_FOUND`

#### PATCH /api/mcqs/[id]

Requires **admin**. Partial update of `name`, `description` and `choices`. Supplying `choices`
replaces the entire set. `PUT` is accepted as an alias.

- Success (200): `{ "mcq": Mcq }`
- Error (400): `VALIDATION_ERROR`, and on an empty body
- Error (404): `MCQ_NOT_FOUND`

#### DELETE /api/mcqs/[id]

Requires **admin**. Returns 204 with no body. Choices cascade, and so do attempts:
`mcq_attempts.mcq_id` is `ON DELETE CASCADE`, so removing a question removes its answer
history with it. This is the opposite of an *edit*, which keeps attempts — the distinction is
that an attempt is meaningless once the question it answered no longer exists, whereas a
reworded question is still the same question. The delete dialog says so explicitly.

- Error (404): `MCQ_NOT_FOUND`, including on a second delete of the same id

#### POST /api/mcqs/[id]/attempts

Requires authentication. Any signed-in user may attempt.

**Request Body:** `{ "choiceId": "..." }`

**Response:**
- Success (201): `{ "attempt": McqAttempt, "correctChoiceId": "..." }`. The answer key is
  returned only *after* the answer has been committed.
- Error (400): `VALIDATION_ERROR` for a missing `choiceId`
- Error (404): `MCQ_NOT_FOUND`, or `CHOICE_NOT_FOUND` when the id does not belong to this
  question. A choice id belonging to a *different* question is a 404, not a silent wrong
  answer, since it can only come from a tampered or stale client.

#### GET /api/mcqs/[id]/attempts

Requires **admin**. Returns `{ "attempts": McqAttempt[] }`, newest first.

### User Interface Requirements

#### MCQ list page (`/mcq`)

- Server Component. Unauthenticated visitors are redirected to `/login`
- The landing page for both roles after sign-in
- Header with the signed-in user's name, a link to `/account`, a link to `/users` for admins,
  and a Sign out button
- Table columns: Name, Description, Choices, Created, Updated, and a trailing actions column
- A **Create** button, visible only to an `admin`, which navigates to `/mcq/new`
- Each row carries a `⋯` context menu with exactly three items: **Edit**, **Preview** and
  **Delete**. A member sees only **Preview**; Edit and Delete are administrator actions
- **Delete** opens a confirmation dialog naming the question, warning that its choices go with
  it, and stating that recorded attempts are kept
- Empty state: a row explaining that no questions exist yet

#### Create page (`/mcq/new`) and edit page (`/mcq/[id]/edit`)

- Admin only. A member is redirected to `/mcq`
- Full pages rather than dialogs. A question with six choices is too tall for a modal, and a
  URL for an in-progress edit is worth having
- Fields: Name, Description, and a choice editor
- The choice editor starts a new question with **two empty choices**, which is the minimum
- **Add choice** appends a row and is disabled at six. **Remove** deletes a row and is disabled
  at two, so the client cannot even express an invalid choice count
- One radio group across all rows, so marking a second choice correct unmarks the first. *Two*
  correct answers is not a state the form can reach. *Zero* is, deliberately: no row is
  preselected, because silently making the first choice the answer is how an author ships a
  question whose answer they never actually chose. A client-side check catches it before the
  round trip
- Removing the row that holds the answer clears the selection rather than reassigning it to a
  neighbour
- Two buttons at the foot of the form: **Save**, which submits, and **Cancel**, which returns
  to `/mcq` without writing
- Save is disabled and relabelled while the action is pending, so a double click writes once
- Server-side validation errors render against the offending field and the form keeps its
  contents

#### Preview and attempt page (`/mcq/[id]/preview`)

- Any signed-in user
- Renders the name, the description and the choices as a radio group, in `position` order
- For a member the page is served from `McqForAttempt`, so the correct answer is absent from
  the HTML as well as from the JSON
- **Submit answer** records the attempt and re-renders with the outcome: a success panel for a
  correct answer, or a destructive panel naming the correct choice for an incorrect one
- Submitting nothing shows "Select an answer." and issues no request
- After answering, **Try again** resets the form and **Back to questions** returns to `/mcq`
- An admin previewing their own question sees a note that the correct choice is marked, since
  for an author preview is a proofreading tool rather than a test

---

## Implementation Phases

### Phase 1: Test Harness - COMPLETED

**Objective**: A working Vitest suite, since the rest of this module is written test-first.

**Tasks**:
1. Add `vitest`, `@testing-library/react`, `@testing-library/user-event` and `jsdom` as
   devDependencies
2. Add `vitest.config.mts` with `jsdom` and `resolve.tsconfigPaths` for the `@/` alias
3. Add `test` and `test:watch` npm scripts

**Deliverables**:
- `vitest.config.mts`, npm scripts `test` and `test:watch`

**Results**: Two of the five packages the project's testing skill prescribes turned out to be
wrong for this repo. `@vitejs/plugin-react` cannot be installed at all (Babel 8 against
`shadcn`'s Babel 7), and `vite-tsconfig-paths` is redundant now that Vite resolves tsconfig
paths natively. The harness is four packages, not five, and the config is `.mts` so Vite does
not load it as CommonJS. Both are recorded in Cut and in the Troubleshooting Guide.

### Phase 2: Schema - COMPLETED

**Objective**: The three tables, applied locally.

**Tasks**:
1. Write `migrations/0004_create_mcq_tables.sql`
2. Apply it locally with `npm run db:migrate`

**Deliverables**:
- `migrations/0004_create_mcq_tables.sql`

**Results**: 10 commands executed successfully against the local D1 instance, and later the
same 10 against the remote one when the user asked for it (2026-09-10). Both databases carry
the three tables and six indexes; `wrangler d1 migrations list --remote` reports nothing
pending.

### Phase 3: Failing Tests - COMPLETED

**Objective**: Every rule in this module expressed as an assertion before it is implemented.

**Tasks**:
1. Validation tests: choice-count bounds at 1, 2, 6 and 7; zero and two correct choices;
   duplicate choice text; field lengths; empty update body
2. Service tests against a mocked repository: create, list, get, update, delete, not-found
   paths, and that `getForAttempt` output contains no `isCorrect`
3. Grading tests: a correct pick, an incorrect pick, and a `choiceId` from another question
4. Confirm the suite fails for the intended reasons before writing the implementation

**Deliverables**:
- `src/lib/validation/mcq.schemas.test.ts`, `src/lib/services/mcq.service.test.ts`,
  `src/lib/types/mcq.test.ts`

**Results**: All three files failed to resolve their imports before the implementation existed,
which is the intended starting point. Writing them first caught one flaw in a test rather than
in the code: the answer-key leakage assertion searched the serialized payload for the string
`"correct"`, and the fixture's question text was "Pick the **correct** capital city", so the
test would have failed for a reason that had nothing to do with a leak. The fixture text was
changed and the assertion kept.

### Phase 4: Domain and Repository - COMPLETED

**Objective**: Typed data access with no business rules in it.

**Tasks**:
1. `src/lib/types/mcq.ts` with the record, summary, attempt-view and attempt types, the
   `MIN_CHOICES` / `MAX_CHOICES` constants, and `toAttemptView`
2. `src/lib/validation/mcq.schemas.ts`
3. `mcqsRepository` owning `mcqs` and `mcq_choices`, writing both in one `db.batch()`
4. `mcqAttemptsRepository`

**Deliverables**:
- `src/lib/types/mcq.ts`, `src/lib/validation/mcq.schemas.ts`,
  `src/lib/repositories/mcqs.repository.ts`, `src/lib/repositories/mcq-attempts.repository.ts`

### Phase 5: Service Layer - COMPLETED

**Objective**: All MCQ rules in one place, until the tests from Phase 3 pass.

**Tasks**:
1. `mcqService`: create, list, getById, getForAttempt, update, delete
2. `recordAttempt` with server-side grading
3. `listAttempts`

**Deliverables**:
- `src/lib/services/mcq.service.ts`

**Results**: 63 assertions green across the three files once the service was written.

### Phase 6: API Layer - COMPLETED

**Objective**: HTTP surface that is a thin adapter over the service.

**Tasks**:
1. `/api/mcqs` collection routes
2. `/api/mcqs/[id]` item routes, role-aware on `GET`
3. `/api/mcqs/[id]/attempts`

**Deliverables**:
- `src/app/api/mcqs/route.ts`, `src/app/api/mcqs/[id]/route.ts`,
  `src/app/api/mcqs/[id]/attempts/route.ts`

### Phase 7: Presentation Layer - COMPLETED

**Objective**: The three screens.

**Tasks**:
1. Add the `dropdown-menu`, `radio-group` and `textarea` shadcn components
2. `/mcq` list page, table, actions menu and delete dialog
3. `/mcq/new` and `/mcq/[id]/edit` sharing one form component and one choice editor
4. `/mcq/[id]/preview` with the attempt form and the outcome panel
5. Server Actions for create, update, delete and attempt
6. Point `landingPathFor` at `/mcq` for both roles

**Deliverables**:
- `src/app/mcq/**`, `src/components/mcq/**`, updated `src/lib/auth/landing.ts`

**Results**: Four things needed correcting during this phase, all recorded in the
Troubleshooting Guide: the shadcn CLI generated a broken `cn` import in all three new
components; `landingPathFor` no longer varies by role, so its parameter was removed rather
than left unused; `Button` rendering a `Link` labelled a navigation control as
`role="button"`, so links are styled with `buttonVariants` instead; and the per-row choice
error was computed but never rendered, which a component test caught.

### Phase 8: Verification - COMPLETED

**Objective**: Prove the module works rather than assume it.

**Tasks**:
1. `npm test`, `npm run lint` and `npm run build` clean
2. Exercise every endpoint against a running server as both an admin and a member
3. Check the database invariants directly with SQL
4. Record results and any gotchas in this document

**Results** (2026-09-10, `next dev` with the local D1 binding):

- **92 unit and component assertions pass** across six files. `npm run lint` reports no
  problems and `npm run build` compiles with all 20 routes registered.
- **81 of 81 HTTP and page assertions pass** against a running server, driven as a seeded
  `admin` and a freshly registered `member`. They cover: 401 for every anonymous call and 403
  `NOT_AN_ADMIN` for every member write, while member reads stay 200; each rejected choice set
  (one choice, seven choices, zero correct, two correct, duplicate differing only in case, a
  blank name, an empty choice body naming `choices.0.body`); positions stored as 0,1,2 in
  submitted order; `isCorrect` present for an admin and absent from a member's payload;
  correct and incorrect grading; a tampered body claiming `isCorrect: true` on a wrong answer
  still recorded incorrect; a foreign `choiceId` returning 404 `CHOICE_NOT_FOUND` and writing
  nothing; empty-PATCH rejection; the `PUT` alias; a choice-set replacement renumbering from
  zero while leaving all three prior attempts intact with `choiceId` null; a rejected update
  leaving the stored choices untouched; malformed JSON returning 400 rather than 500; delete
  returning 204 and a second delete returning 404; and every page redirect for both roles.
- **The answer key does not reach a member.** A member's `GET /api/mcqs/[id]` response
  contains no `isCorrect` substring at all, and their rendered `/mcq/[id]/preview` HTML
  contains no `isCorrect`, no "correct answer" marker, and serializes `correctChoiceId` as
  `null`. An admin's copy of the same page does carry it, which is the whole difference.
- **The database invariants hold.** Four `SELECT ... HAVING` queries for a choice count outside
  2–6, a per-question `SUM(is_correct) <> 1`, an orphaned choice row, and a non-contiguous
  `position` sequence all return zero rows.
- **The authoring form works end to end through its Server Action.** A question created in a
  real browser ("about national animal", four choices) stored positions 0–3 contiguously with
  the correct answer at position 1 — not position 0 — which is what proves the radio-to-key
  mapping is real rather than defaulting to the first row. An attempt against it recorded
  correct.

**Not verified**: the dropdown menu, the choice editor's bounds and the delete confirmation
were exercised through Testing Library rather than a real browser, so the rendering is
asserted but the visual layout is not. `npm run preview` on the Workers runtime has not been
run; `npm run dev` executes on Node and will not surface Workers-specific problems.

---

## Technical Implementation Details

### Key Files

| File | Layer | Purpose |
|---|---|---|
| `migrations/0004_create_mcq_tables.sql` | database | The three tables and their indexes |
| `src/lib/types/mcq.ts` | cross-cutting | Domain types, choice bounds, `toAttemptView` |
| `src/lib/validation/mcq.schemas.ts` | cross-cutting | Zod schemas for create, update and attempt |
| `src/lib/repositories/mcqs.repository.ts` | repository | SQL for `mcqs` and `mcq_choices` |
| `src/lib/repositories/mcq-attempts.repository.ts` | repository | SQL for `mcq_attempts` |
| `src/lib/services/mcq.service.ts` | service | Choice rules, grading, CRUD |
| `src/app/api/mcqs/**` | API | REST surface |
| `src/app/mcq/page.tsx` + `actions.ts` | presentation | List screen and its Server Actions |
| `src/app/mcq/form-fields.ts` | presentation | `readChoiceFields`: the flat form fields → choice array translation |
| `src/app/mcq/form-state.ts` | presentation | Shared form state shapes and idle values |
| `src/app/mcq/new/page.tsx` | presentation | Create screen |
| `src/app/mcq/[id]/edit/page.tsx` | presentation | Edit screen |
| `src/app/mcq/[id]/preview/page.tsx` | presentation | Preview and attempt screen |
| `src/components/mcq/mcq-form.tsx` | presentation | Shared create/edit form |
| `src/components/mcq/choice-editor.tsx` | presentation | The 2–6 row choice editor |
| `src/components/mcq/mcq-table.tsx` | presentation | Table and per-row actions menu |
| `src/components/mcq/attempt-form.tsx` | presentation | Answer submission and outcome |
| `src/lib/validation/mcq.schemas.test.ts` | test | Choice bounds, single-correct, distinctness, field limits |
| `src/lib/services/mcq.service.test.ts` | test | CRUD, not-found paths, grading, answer-key stripping |
| `src/lib/types/mcq.test.ts` | test | `toAttemptView` removes the answer key |
| `src/app/mcq/form-fields.test.ts` | test | Form-array reassembly, including row removal |
| `src/components/mcq/mcq-form.test.tsx` | test | Choice editor bounds and client validation |
| `src/components/mcq/mcq-table.test.tsx` | test | Row actions menu per role, delete confirmation |

### Implementation Patterns

A question and its choices are written as one transaction, so a question can never exist with
a half-written choice set:

```typescript
await db.batch([
  db.prepare("INSERT INTO mcqs (id, name, description, created_by) VALUES (?1, ?2, ?3, ?4)")
    .bind(id, name, description, createdBy),
  ...choices.map((choice, index) =>
    db.prepare(
      "INSERT INTO mcq_choices (id, mcq_id, body, is_correct, position) VALUES (?1, ?2, ?3, ?4, ?5)",
    ).bind(generateId(), id, choice.body, choice.isCorrect ? 1 : 0, index),
  ),
]);
```

Grading is a server-side lookup, never a comparison of anything the client sent:

```typescript
async recordAttempt(mcqId: string, userId: string, input: unknown) {
  const { choiceId } = parse(recordAttemptSchema, input);
  const mcq = await this.requireMcq(mcqId);

  const chosen = mcq.choices.find((choice) => choice.id === choiceId);
  if (!chosen) {
    throw new NotFoundError("CHOICE_NOT_FOUND", "That choice does not belong to this question.");
  }

  const attempt = await mcqAttemptsRepository.insert({
    id: generateId(),
    mcqId,
    userId,
    choiceId: chosen.id,
    selectedText: chosen.body,
    isCorrect: chosen.isCorrect,
  });

  return { attempt, correctChoiceId: mcq.choices.find((c) => c.isCorrect)!.id };
}
```

The choice-set replacement on update reuses the insert path rather than duplicating it, and
`position` is always the array index, so ordering is a property of the submitted array.

### Important Notes

- **Form arrays are reassembled by key, not by index.** The choice editor submits one
  `choiceBody` and one `choiceKey` per row, in display order, plus a single `correctChoice`
  holding the key of the selected row. `readChoiceFields` pairs them positionally, since
  `FormData.getAll` preserves document order. Indices would be the obvious choice and would be
  wrong: removing the first row shifts every later row down, silently moving the correct answer
  onto a different choice. This is the one piece of the presentation layer with a quiet and
  expensive failure mode, which is why it lives in its own module with its own tests rather
  than inside the `"use server"` file where it cannot be imported.
- **`is_correct` is an integer in SQLite.** `mapChoiceRow` converts with `row.is_correct === 1`.
  A truthiness check would be wrong the day the column holds a string.
- **`ORDER BY position` on every choice read.** Without it the display order is whatever SQLite
  finds convenient, which is stable in practice and therefore a bug that hides.
- **The answer key never reaches a member's browser.** `getForAttempt` is what the preview page
  calls for a non-admin, and it is the reason `McqForAttempt` exists as a separate type.
- Only async functions may be exported from a `"use server"` module, so shared form state lives
  in `src/app/mcq/form-state.ts`. This cost the auth module a debugging session already.
- D1 is server-only. No repository or service module may be imported from a `'use client'` file.

---

## Acceptance Criteria

- [x] A question cannot be created with fewer than two or more than six choices, and the error
      names `choices`
- [x] A question cannot be created with zero correct choices or with two correct choices
- [x] Two choices with the same text, differing only in case, are rejected
- [x] Creating a question stores exactly one row in `mcqs` and one row per choice in
      `mcq_choices`, each with the position it was submitted in
- [x] `POST /api/mcqs` and `PATCH`/`DELETE /api/mcqs/[id]` return 403 for a member and 401 for
      an anonymous caller
- [x] `GET /api/mcqs/[id]` includes `isCorrect` for an admin and omits it entirely for a member
- [x] `PATCH /api/mcqs/[id]` with `choices` replaces the whole set and leaves no orphan rows
- [x] `PATCH /api/mcqs/[id]` with an empty body returns 400
- [x] `DELETE /api/mcqs/[id]` returns 204 and removes the question, its choices and its
      attempts; a second delete of the same id returns 404
- [x] Attempting with the correct choice records `is_correct = 1`; attempting with a wrong
      choice records `is_correct = 0`
- [x] A request body claiming `isCorrect: true` alongside a wrong `choiceId` is still recorded
      as incorrect, because grading reads the stored choice
- [x] Attempting with a `choiceId` from a different question returns 404 `CHOICE_NOT_FOUND` and
      records nothing
- [x] Editing a question after it has been attempted does not change or delete the attempt row
- [x] `/mcq` lists every question with its name, description and choice count
- [x] The `/mcq` row menu offers exactly Edit, Preview and Delete, and a member sees only
      Preview
- [x] Clicking Create navigates to `/mcq/new`, which opens with two empty choice rows
- [x] Add choice is disabled at six rows and Remove is disabled at two rows
- [x] Removing a row removes the row that was clicked, and clears the answer if it held it
- [x] Cancel on the create and edit pages returns to `/mcq` without writing anything
- [x] Save locks while the action is pending, so a double click creates one question
- [x] Deleting from the list requires confirmation naming the question
- [x] The preview page renders the choices in position order and grades a submitted answer
- [x] A member's rendered preview HTML contains no indication of which choice is correct
- [x] Signing in as either role lands on `/mcq`, and `/account` is still reachable
- [x] `npm test`, `npm run lint` and `npm run build` all pass

---

## Success Metrics

| Metric | Target | How Measured |
|---|---|---|
| Answer key leakage to a member | 0 occurrences | Search a member's rendered `/mcq/[id]/preview` HTML and the `GET /api/mcqs/[id]` JSON for `isCorrect` |
| Questions with an invalid choice count | 0 | `SELECT mcq_id, COUNT(*) FROM mcq_choices GROUP BY mcq_id HAVING COUNT(*) < 2 OR COUNT(*) > 6` returns no rows |
| Questions without exactly one correct choice | 0 | `SELECT mcq_id, SUM(is_correct) FROM mcq_choices GROUP BY mcq_id HAVING SUM(is_correct) <> 1` returns no rows |
| Attempts lost to a question edit | 0 | Count attempts before and after a `PATCH` that replaces the choice set |
| Rule coverage | Every rule in the Validation table has a failing-case test | `npm test` |
| Layer violations | 0 | No `getDb` import outside `src/lib/repositories/`; no SQL outside repositories |

---

## Dependencies

### External Dependencies

- Cloudflare D1 - question, choice and attempt storage, bound as `DB`
- `zod` - schema validation in the service layer, already installed
- `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom` - the test
  harness, added by this module as devDependencies. See Cut for the two packages the project's
  testing skill recommends that were deliberately left out.

### Internal Dependencies

- `src/lib/auth/session.ts` - `requireUser` and `requireAdmin` gate every entry point
- `src/lib/errors.ts` - `ValidationError`, `NotFoundError`, `ForbiddenError`
- `src/lib/http/api.ts` - `jsonOk`, `noContent`, `readJsonBody`, `withErrorHandling`
- `src/lib/security/tokens.ts` - `generateId` for every primary key
- `src/lib/validation/parse.ts` - the Zod-to-domain-error bridge
- shadcn/ui `button`, `card`, `table`, `dialog`, `field`, `input`, `badge`, `separator`, and the
  newly added `dropdown-menu`, `radio-group` and `textarea`

### Environment

No new bindings, variables or secrets. The `DB` binding added by the auth module is sufficient.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: The correct answer is the one piece of data in this module that must not reach the
  person answering. A single careless `GET /api/mcqs/[id]` from the preview page would ship the
  whole answer key to the browser.
- **Mitigation**: The strip is a type boundary, not a habit. `McqForAttempt` has no `isCorrect`
  field, so leaking it is a compile error rather than an oversight, and `getForAttempt` is the
  only method the preview page calls for a member.

- **Risk**: SQLite cannot constrain a child row count or a per-group sum, so the database will
  accept a question with one choice or with four correct answers if anything ever writes to it
  outside the service.
- **Mitigation**: `mcqChoicesSchema` is the only gate and every write passes through it. The two
  invariants are also written as `SELECT ... HAVING` queries in Success Metrics, so a violation
  is detectable rather than merely unlikely.

- **Risk**: Replacing the choice set on every update would destroy attempt history if attempts
  pointed at choices with `ON DELETE CASCADE`.
- **Mitigation**: `mcq_attempts.choice_id` is `ON DELETE SET NULL` and every attempt carries a
  `selected_text` snapshot and its own `is_correct`. An attempt is never recomputed from the
  current choice rows.

- **Risk**: D1 has no interactive transactions, only `batch()`. A question written with two
  separate calls could leave a question row with no choices if the second call failed.
- **Mitigation**: The question row and all its choice rows go in one `db.batch()`, which D1
  runs as a single transaction.

- **Risk**: `UNIQUE (mcq_id, position)` will reject a reorder if the new rows are inserted
  before the old ones are removed.
- **Mitigation**: The delete of the existing choices is the first statement in the same batch as
  the inserts, so the constraint is never evaluated against a mixed state.

- **Risk**: Vitest under `jsdom` cannot reach `getCloudflareContext()`, so any test that
  transitively imports a repository fails at module load.
- **Mitigation**: Service tests mock `@/lib/repositories/...` at the module boundary. Nothing in
  the suite imports `src/lib/db/client.ts`.

### User Experience Risks

- **Risk**: A form with a variable number of rows is easy to get into a state the server will
  reject, and being told about it after a round trip is frustrating.
- **Mitigation**: The UI makes the invalid states unreachable. Remove is disabled at two rows,
  Add is disabled at six, and one radio group means exactly one choice is always marked correct.

- **Risk**: "Preview" means proofreading to an author and means taking the test to a learner.
  One page serving both could confuse either.
- **Mitigation**: The page adapts. An admin sees the correct choice marked and a note saying so;
  a member sees an ungraded question and finds out the answer only after submitting.

- **Risk**: Deleting a question destroys its choices and is irreversible.
- **Mitigation**: A confirmation dialog names the question and states plainly what is removed
  and what is kept.

---

## Troubleshooting Guide

### `Module not found: Can't resolve 'cn'` in a newly generated shadcn component

**Problem**: `dropdown-menu.tsx`, `radio-group.tsx` and `textarea.tsx` were generated with
`import { cn } from "cn"`, which resolves to nothing. Every existing component in
`src/components/ui/` imports from `@/lib/utils`.
**Cause**: `npx shadcn@latest` pulled 4.21.0 while the repo pins `shadcn@4.16.1`, and the newer
CLI emits a different import specifier for the `utils` alias despite `components.json` naming
`@/lib/utils`.
**Solution**: Rewrite the import to `@/lib/utils` in each generated file. Check every new
component's imports after running the CLI rather than assuming they match the repo.
**Code Reference**: `src/components/ui/dropdown-menu.tsx:5`

### `npm install @vitejs/plugin-react` fails with ERESOLVE

**Problem**: Installing the harness the testing skill prescribes aborts with
`Conflicting peer dependency: @babel/core@8.0.1`.
**Cause**: `@vitejs/plugin-react@6` depends on `@rolldown/plugin-babel`, which wants
`@babel/plugin-transform-runtime@^8.0.0-rc.1` and therefore Babel 8. `shadcn@4.16.1` brings
`@babel/preset-typescript` on Babel 7. The two cannot coexist.
**Solution**: Do not install it. Vite's esbuild transform already compiles `.tsx` using the
`jsx: "react-jsx"` setting in `tsconfig.json`, which is all a test run needs; the plugin exists
for Fast Refresh. Do not reach for `--legacy-peer-deps` to force it in.
**Code Reference**: `vitest.config.mts`

### Vite warns that the config is loaded as CommonJS

**Problem**: Every `npm test` prints "ESM syntax in a file loaded as CommonJS
(vitest.config.ts:1:1)".
**Cause**: The project has no `"type": "module"` in `package.json`, so a `.ts` config is read as
CommonJS by Vite's native config loader.
**Solution**: Name the file `vitest.config.mts`. Adding `"type": "module"` to `package.json`
would also silence it but changes how every other tool in the repo resolves modules.

### A menu item cannot be found in a component test

**Problem**: `screen.getByRole("menuitem")` throws "Unable to find an accessible element",
intermittently, even though the menu opens correctly in a browser.
**Cause**: Base UI renders menu contents into a portal only once the menu is open, and the
mount happens after the click settles. A synchronous `get*` query races it.
**Solution**: Use the async `findAllByRole` / `findByRole` form for anything inside a portal.
For the same reason, a closed menu is genuinely absent from server-rendered HTML, so the row
actions menu cannot be asserted by scanning the page source — it needs a component test.
**Code Reference**: `src/components/mcq/mcq-table.test.tsx:41`

### `Base UI: A component that acts as a button expected a native <button>`

**Problem**: A console warning on every page with a link styled as a button.
**Cause**: `<Button render={<Link href="…" />}>`. Base UI's `Button` defaults
`nativeButton` to `true`, so rendering an `<a>` strips native button semantics. Passing
`nativeButton={false}` silences the warning but then stamps `role="button"` on the anchor,
which describes a navigation control as a button to a screen reader.
**Solution**: Do not wrap a `Link` in a `Button`. Style the `Link` with `buttonVariants()` and
`cn()`, which is the shadcn idiom and yields a plain `<a>` with the correct link role. Because
an anchor has no `disabled`, a link that must be inert while a form is pending gets
`aria-disabled` plus `pointer-events-none opacity-50`.
**Code Reference**: `src/components/mcq/mcq-table.tsx:49`

### A rejected choice shows a red border and no message

**Problem**: A per-choice validation error, such as a body over 300 characters, marked the row
invalid but displayed nothing explaining why.
**Cause**: The row computed `bodyErrors` and passed it to `aria-invalid`, but the only
`FieldError` in the choice editor was the one for the choice set as a whole. The per-row
message had nowhere to render.
**Solution**: Each row is a vertical container holding the horizontal control group and its own
`FieldError`. Found by a component test, not by inspection — the field was wired up enough to
look correct.
**Code Reference**: `src/components/mcq/mcq-form.tsx:196`

### Deleting a question removed its attempts, contrary to what this document first said

**Problem**: The PRD and the delete dialog both claimed attempts survive a delete. They do not.
**Cause**: `mcq_attempts.choice_id` is `ON DELETE SET NULL`, which protects the history from a
*choice-set replacement during an edit*. `mcq_attempts.mcq_id` is `ON DELETE CASCADE`, so
deleting the question itself takes the attempts with it. The first is the interesting guarantee
and it was mistaken for the second.
**Solution**: Behaviour kept — an attempt is meaningless once its question no longer exists —
and the wording corrected in both places. The dialog now says the attempts go too.
**Code Reference**: `migrations/0004_create_mcq_tables.sql:46`

### PowerShell skips files whose path contains `[id]`

**Problem**: A bulk edit across the MCQ pages silently missed `src/app/mcq/[id]/edit/page.tsx`
and `.../preview/page.tsx`.
**Cause**: PowerShell treats `[` and `]` in `-Path` as wildcard character classes, so a Next.js
dynamic-segment directory never matches.
**Solution**: Use `-LiteralPath`, or edit those files individually. Always confirm a bulk edit
actually landed on the dynamic routes.

---

## Notes for AI Agents

When working with this PRD:
1. Start by reading the Problem and Hypothesis to understand intent
2. Use Scope (In/Out/Cut) to determine boundaries - do not build out-of-scope items
3. Respect the layering table. New database access belongs in a repository, new rules in a
   service, and new HTTP concerns in a route handler. A route handler that issues SQL is a bug.
4. This module is test-first. A new rule gets a failing test before it gets an implementation.
5. Update phase status markers as work progresses
6. Add implementation details under "Technical Implementation Details" as code is written
7. Mark acceptance criteria as complete when features work
8. Add troubleshooting entries when bugs are found and fixed
9. Use code references format: `filepath:line-number` when citing code

---

## Current Status

**Last Updated**: 2026-09-10
**Current Phase**: Phase 8 - Verification
**Status**: COMPLETED. All eight phases are implemented and verified locally. 92 unit and
component assertions pass, 81 of 81 HTTP and page assertions pass against a running server as
both roles, four SQL invariant queries return zero violating rows, and `npm run lint` and
`npm run build` are clean.

**Next Steps**:
1. Run `npm run preview` to exercise the module on the Workers runtime. `npm run dev` runs on
   Node and will not surface Workers-specific problems — the auth module lost a session to
   exactly that gap, where PBKDF2 iteration limits existed only on Workers.
2. Deploy. `migrations/0004_create_mcq_tables.sql` was applied to the remote database on
   2026-09-10 at the user's request, so the production schema now has the three MCQ tables and
   their six indexes while the deployed Worker still serves the pre-MCQ code. The schema being
   ahead is harmless — the migration only adds tables — but the two are out of step until a
   deploy happens.
3. The `/mcq` table has no pagination, search or sort. It renders every question in one query
   and one table, which is fine for tens of rows and not for hundreds.
4. Attempts are recorded and readable through `GET /api/mcqs/[id]/attempts` but have no screen.
   A results view is the obvious next feature, and the `idx_mcq_attempts_mcq_user` index is
   already there for it.
5. Nothing groups questions into a quiz yet. That is the larger missing piece: `mcqs` is a flat
   list, and a quiz would need its own table and an ordering of questions within it.
