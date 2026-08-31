#!/usr/bin/env node
/**
 * Generates a password_hash in the same format the application produces, for seeding the
 * first user into a fresh database. Keep the parameters in sync with
 * src/lib/security/password.ts.
 *
 *   npm run hash-password -- "your password"
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 210_000;
const SALT_BYTES = 16;
const KEY_BYTES = 32;

const password = process.argv[2];

if (!password) {
	console.error('Usage: npm run hash-password -- "your password"');
	process.exit(1);
}

const salt = randomBytes(SALT_BYTES);
const derived = pbkdf2Sync(password, salt, ITERATIONS, KEY_BYTES, "sha256");

console.log(
	["pbkdf2", "sha256", ITERATIONS, salt.toString("base64"), derived.toString("base64")].join("$"),
);
