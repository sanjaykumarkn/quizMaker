import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, readJsonBody, withErrorHandling } from "@/lib/http/api";
import { usersService } from "@/lib/services/users.service";

/**
 * User management is administrator-only. Anyone may register an account, so "signed in" says
 * nothing about whether the caller should see other people's records.
 */

export const GET = withErrorHandling(async () => {
	await requireAdmin();
	return jsonOk({ users: await usersService.list() });
});

export const POST = withErrorHandling(async (request: Request) => {
	await requireAdmin();
	const user = await usersService.create(await readJsonBody(request));
	return jsonOk({ user }, 201);
});
