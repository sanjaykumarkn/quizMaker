-- Migration number: 0003 	 2026-08-31T00:00:00.000Z
-- Public signup made "is signed in" too weak a rule for user management: any visitor could
-- register and then edit or delete every account. Roles separate the two audiences.
--
-- SQLite cannot add a CHECK constraint to an existing table, so the allowed values are
-- enforced by the Zod schema in src/lib/validation/user.schemas.ts.
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member';

-- Keep existing databases usable: without this the local database would have no admin at all
-- and user management would be unreachable. Promotes the first account created.
UPDATE users
SET role = 'admin'
WHERE id = (SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1);

CREATE INDEX idx_users_role ON users(role);
