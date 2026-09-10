/**
 * Where a signed-in user belongs. Every post-authentication redirect goes through here rather
 * than hard-coding a path.
 *
 * This took a `user` until questions existed, because there was nothing an admin and a member
 * could usefully share: an admin went to `/users` and a member to `/account`. `/mcq` is the one
 * screen both audiences have a reason to open — an admin authors there and a member attempts
 * there — so the destination no longer depends on the role. `/users` and `/account` are still
 * reachable from its header.
 */
export function landingPathFor(): string {
	return "/mcq";
}
