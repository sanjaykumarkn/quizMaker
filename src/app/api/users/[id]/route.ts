import { requireAdmin } from "@/lib/auth/session";
import { jsonOk, noContent, readJsonBody, withErrorHandling } from "@/lib/http/api";
import { usersService } from "@/lib/services/users.service";

interface RouteContext {
	params: Promise<{ id: string }>;
}

export const GET = withErrorHandling<RouteContext>(async (_request, { params }) => {
	await requireAdmin();
	const { id } = await params;
	return jsonOk({ user: await usersService.getById(id) });
});

export const PATCH = withErrorHandling<RouteContext>(async (request, { params }) => {
	await requireAdmin();
	const { id } = await params;
	const user = await usersService.update(id, await readJsonBody(request));
	return jsonOk({ user });
});

/** Accepted as an alias so clients may use either verb for an update. */
export const PUT = PATCH;

export const DELETE = withErrorHandling<RouteContext>(async (_request, { params }) => {
	const actingUser = await requireAdmin();
	const { id } = await params;
	await usersService.delete(id, actingUser.id);
	return noContent();
});
