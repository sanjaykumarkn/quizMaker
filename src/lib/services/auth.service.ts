import { InvalidCredentialsError } from "@/lib/errors";
import { sessionsRepository } from "@/lib/repositories/sessions.repository";
import { usersRepository } from "@/lib/repositories/users.repository";
import { simulatePasswordVerification, verifyPassword } from "@/lib/security/password";
import { generateId, generateSessionToken, hashToken } from "@/lib/security/tokens";
import { usersService } from "@/lib/services/users.service";
import { toPublicUser, type PublicUser } from "@/lib/types/user";
import { loginSchema } from "@/lib/validation/auth.schemas";
import { parse } from "@/lib/validation/parse";

/**
 * Authentication is kept separate from user management on purpose: this module decides
 * *who* someone is, while `users.service.ts` decides what a user record may look like.
 */

export const SESSION_TTL_SECONDS = 60 * 60 * 8;

export interface LoginResult {
	user: PublicUser;
	token: string;
	expiresAt: Date;
}

/** D1 compares DATETIME columns as strings, so sessions are stored in SQLite's own format. */
function toSqliteDateTime(date: Date): string {
	return date.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Issues a session for an already-identified user. Callers are responsible for having
 * established identity first, whether by verifying a password or by creating the account.
 */
async function issueSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
	const token = generateSessionToken();
	const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

	// Opportunistic housekeeping: expired rows can never authenticate anything, and issuing a
	// session is a low-frequency event, so this keeps the table bounded without a cron job.
	await sessionsRepository.deleteExpired();

	await sessionsRepository.insert({
		id: generateId(),
		userId,
		tokenHash: await hashToken(token),
		expiresAt: toSqliteDateTime(expiresAt),
	});

	return { token, expiresAt };
}

export const authService = {
	/**
	 * Verifies credentials and issues a session. Failure is a single error type regardless of
	 * cause, and an unknown username still pays the cost of a derivation so that timing does
	 * not distinguish the two cases.
	 */
	async login(input: unknown): Promise<LoginResult> {
		const credentials = parse(loginSchema, input);

		const user = await usersRepository.findByUsername(credentials.username);
		if (!user) {
			await simulatePasswordVerification();
			throw new InvalidCredentialsError();
		}

		const passwordMatches = await verifyPassword(credentials.password, user.passwordHash);
		if (!passwordMatches) {
			throw new InvalidCredentialsError();
		}

		const { token, expiresAt } = await issueSession(user.id);
		return { user: toPublicUser(user), token, expiresAt };
	},

	/**
	 * Public self-registration. Creates the account through the same service that the
	 * authenticated admin path uses, so validation, uniqueness and hashing rules are identical,
	 * then signs the new user in without a second password derivation.
	 */
	async register(input: unknown): Promise<LoginResult> {
		const user = await usersService.register(input);
		const { token, expiresAt } = await issueSession(user.id);
		return { user, token, expiresAt };
	},

	/** Resolves a cookie value to the current user, or null if absent, unknown or expired. */
	async resolveSession(token: string | undefined): Promise<PublicUser | null> {
		if (!token) {
			return null;
		}

		const active = await sessionsRepository.findActiveWithUser(await hashToken(token));
		return active ? toPublicUser(active.user) : null;
	},

	/** Idempotent, so logging out twice or with a stale cookie is not an error. */
	async logout(token: string | undefined): Promise<void> {
		if (!token) {
			return;
		}
		await sessionsRepository.deleteByTokenHash(await hashToken(token));
	},

	async logoutEverywhere(userId: string): Promise<void> {
		await sessionsRepository.deleteByUserId(userId);
	},
};
