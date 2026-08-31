import { cookies } from "next/headers";

import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { authService, SESSION_TTL_SECONDS } from "@/lib/services/auth.service";
import { isAdmin, type PublicUser } from "@/lib/types/user";

/**
 * Bridges the HTTP cookie jar and the auth service. This is the seam where authorization
 * belongs: `requireUser` currently asserts only "signed in", and a role check would be
 * layered on here rather than inside the services.
 */

export const SESSION_COOKIE = "qm_session";

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set(SESSION_COOKIE, token, {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		expires: expiresAt,
		maxAge: SESSION_TTL_SECONDS,
	});
}

export async function clearSessionCookie(): Promise<void> {
	const cookieStore = await cookies();
	cookieStore.set(SESSION_COOKIE, "", {
		httpOnly: true,
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
		path: "/",
		maxAge: 0,
	});
}

export async function readSessionToken(): Promise<string | undefined> {
	const cookieStore = await cookies();
	return cookieStore.get(SESSION_COOKIE)?.value;
}

/** Returns the signed-in user, or null. Use in pages that render for both audiences. */
export async function getCurrentUser(): Promise<PublicUser | null> {
	return authService.resolveSession(await readSessionToken());
}

/** Throws `UnauthenticatedError`, which the API layer maps to 401. */
export async function requireUser(): Promise<PublicUser> {
	const user = await getCurrentUser();
	if (!user) {
		throw new UnauthenticatedError();
	}
	return user;
}

/**
 * Authorization for user management. Signing in is no longer sufficient: registration is open
 * to anyone, so a `member` must not be able to read, edit or delete other people's accounts.
 *
 * The distinction between the two failures matters. 401 means "nobody is signed in, go and
 * authenticate"; 403 means "you are known, and the answer is still no".
 */
export async function requireAdmin(): Promise<PublicUser> {
	const user = await requireUser();
	if (!isAdmin(user)) {
		throw new ForbiddenError("NOT_AN_ADMIN", "You need administrator access to manage users.");
	}
	return user;
}
