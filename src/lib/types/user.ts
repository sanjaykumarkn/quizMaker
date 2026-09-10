/**
 * `admin` may manage every account; `member` may only sign in and see their own profile.
 * Self-registration always produces a `member`.
 */
export const USER_ROLES = ["admin", "member"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DEFAULT_USER_ROLE: UserRole = "member";

/**
 * `UserRecord` is the internal entity and carries `passwordHash`. It must never cross the
 * API or presentation boundary. Everything outside the service layer receives `PublicUser`.
 */
export interface UserRecord {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
	role: UserRole;
	createdAt: string;
	updatedAt: string;
}

export type PublicUser = Omit<UserRecord, "passwordHash">;

/**
 * Copies an explicit allowlist of fields rather than deleting `passwordHash` from a spread,
 * so a future sensitive column is excluded by default instead of leaking until noticed.
 */
export function toPublicUser(user: UserRecord): PublicUser {
	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName,
		username: user.username,
		email: user.email,
		role: user.role,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
}

export function isAdmin(user: Pick<PublicUser, "role"> | null | undefined): boolean {
	return user?.role === "admin";
}

export interface SessionRecord {
	id: string;
	userId: string;
	tokenHash: string;
	expiresAt: string;
	createdAt: string;
}
