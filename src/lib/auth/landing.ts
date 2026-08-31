import { isAdmin, type PublicUser } from "@/lib/types/user";

/**
 * Where a signed-in user belongs. Members have no business on the management screen, so every
 * post-authentication redirect goes through here rather than hard-coding `/users`.
 */
export function landingPathFor(user: Pick<PublicUser, "role">): string {
	return isAdmin(user) ? "/users" : "/account";
}
