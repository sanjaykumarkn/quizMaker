import { setSessionCookie } from "@/lib/auth/session";
import { jsonOk, readJsonBody, withErrorHandling } from "@/lib/http/api";
import { authService } from "@/lib/services/auth.service";

/**
 * Public counterpart to `POST /api/users`. Both create a user through the same service; this
 * one requires no session and signs the caller in, which is why it lives under `/api/auth`
 * rather than alongside the administrative user routes.
 */
export const POST = withErrorHandling(async (request: Request) => {
	const { user, token, expiresAt } = await authService.register(await readJsonBody(request));
	await setSessionCookie(token, expiresAt);
	return jsonOk({ user }, 201);
});
