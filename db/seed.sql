-- Local development seed. Not a migration: run it explicitly with `npm run db:seed`.
--
-- Creates the bootstrap user so there is something to log in as on a fresh database.
-- Users are created through the app after that, never with SQL, since only the service
-- layer knows how to hash a password.
--
--   username: admin
--   password: Password123!
--
-- The hash below was produced with `npm run hash-password -- "Password123!"`.
-- Change these credentials before using this anywhere but a local machine.

INSERT OR IGNORE INTO users (id, first_name, last_name, username, email, password_hash, role)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Ada',
  'Admin',
  'admin',
  'admin@example.com',
  'pbkdf2$sha256$210000$YBsXDJFHjDEofhzSsAn4Hg==$iUOVFCJf15QofVmaq/PWlqhxh4jGp/xLqXkTELKw+Lo=',
  'admin'
);
