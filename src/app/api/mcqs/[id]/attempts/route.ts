import { requireAdmin, requireUser } from "@/lib/auth/session";
import { jsonOk, readJsonBody, withErrorHandling } from "@/lib/http/api";
import { mcqService } from "@/lib/services/mcq.service";

interface RouteContext {
	params: Promise<{ id: string }>;
}

/**
 * Any signed-in user may attempt a question. The user id comes from the session, never from
 * the request body, so a caller cannot record an attempt on somebody else's behalf.
 *
 * The response carries `correctChoiceId`, which is the answer key. That is safe here and only
 * here: by the time it is sent the attempt has already been written, so it cannot be used to
 * improve the answer that was just given.
 */
export const POST = withErrorHandling<RouteContext>(async (request, { params }) => {
	const user = await requireUser();
	const { id } = await params;
	const outcome = await mcqService.recordAttempt(id, user.id, await readJsonBody(request));
	return jsonOk(outcome, 201);
});

/** Reading everyone's attempts is an administrator's view of their own question. */
export const GET = withErrorHandling<RouteContext>(async (_request, { params }) => {
	await requireAdmin();
	const { id } = await params;
	return jsonOk({ attempts: await mcqService.listAttempts(id) });
});
