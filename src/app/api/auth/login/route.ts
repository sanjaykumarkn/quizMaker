import { setSessionCookie } from "@/lib/auth/session";
import { jsonOk, readJsonBody, withErrorHandling } from "@/lib/http/api";
import { authService } from "@/lib/services/auth.service";

export const POST = withErrorHandling(async (request: Request) => {
	const { user, token, expiresAt } = await authService.login(await readJsonBody(request));
	await setSessionCookie(token, expiresAt);
	return jsonOk({ user });
});
