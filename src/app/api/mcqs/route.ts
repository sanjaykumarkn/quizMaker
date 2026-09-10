import { requireAdmin, requireUser } from "@/lib/auth/session";
import { jsonOk, readJsonBody, withErrorHandling } from "@/lib/http/api";
import { mcqService } from "@/lib/services/mcq.service";

/**
 * Reading questions is open to any signed-in user, because anyone may attempt them. Authoring
 * is administrator-only, which is the same split the `/mcq` screen applies.
 */

export const GET = withErrorHandling(async () => {
	await requireUser();
	return jsonOk({ mcqs: await mcqService.list() });
});

export const POST = withErrorHandling(async (request: Request) => {
	const author = await requireAdmin();
	const mcq = await mcqService.create(await readJsonBody(request), author.id);
	return jsonOk({ mcq }, 201);
});
