import { requireAdmin, requireUser } from "@/lib/auth/session";
import { jsonOk, noContent, readJsonBody, withErrorHandling } from "@/lib/http/api";
import { mcqService } from "@/lib/services/mcq.service";
import { isAdmin } from "@/lib/types/user";

interface RouteContext {
	params: Promise<{ id: string }>;
}

/**
 * The only role-aware read in the application. An admin is authoring and needs the answer key;
 * a member is about to answer and must not have it. The two shapes come from two different
 * service methods rather than from one method that filters, so the member's payload cannot
 * accidentally acquire an `isCorrect` field later.
 */
export const GET = withErrorHandling<RouteContext>(async (_request, { params }) => {
	const user = await requireUser();
	const { id } = await params;

	if (isAdmin(user)) {
		return jsonOk({ mcq: await mcqService.getById(id) });
	}

	return jsonOk({ mcq: await mcqService.getForAttempt(id) });
});

export const PATCH = withErrorHandling<RouteContext>(async (request, { params }) => {
	await requireAdmin();
	const { id } = await params;
	const mcq = await mcqService.update(id, await readJsonBody(request));
	return jsonOk({ mcq });
});

/** Accepted as an alias so clients may use either verb for an update. */
export const PUT = PATCH;

export const DELETE = withErrorHandling<RouteContext>(async (_request, { params }) => {
	await requireAdmin();
	const { id } = await params;
	await mcqService.delete(id);
	return noContent();
});
