-- Migration number: 0004 	 2026-09-10T00:00:00.000Z
-- The first content in the application. Three tables: the question, its choices, and the
-- record of people answering it.

-- `created_by` is SET NULL rather than CASCADE on purpose: deleting the administrator who
-- wrote a question must not delete the question. The content outlives the account.
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

-- The foreign key tying a choice to its question. CASCADE is correct here, unlike on
-- attempts: a choice genuinely cannot outlive the question it belongs to.
--
-- SQLite cannot express "between two and six rows in a child table", nor "exactly one row
-- per group has is_correct = 1". Both invariants are enforced by mcqChoicesSchema in
-- src/lib/validation/mcq.schemas.ts, which every write passes through.
--
-- `position` is zero-based. SQLite makes no promise about row order without an ORDER BY, so
-- the display order has to be stored rather than assumed.
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

-- An attempt is a historical fact and is never recalculated. `is_correct` is decided once, at
-- submission, against the choice rows as they stood at that moment.
--
-- `choice_id` is SET NULL, not CASCADE. Editing a question replaces its choice rows, and
-- CASCADE here would silently delete the attempt history of everyone who had already
-- answered. `selected_text` snapshots what the user clicked so the row still reads sensibly
-- once `choice_id` is gone.
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
