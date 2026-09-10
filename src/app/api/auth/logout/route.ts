import { clearSessionCookie, readSessionToken } from "@/lib/auth/session";
import { jsonOk, withErrorHandling } from "@/lib/http/api";
import { authService } from "@/lib/services/auth.service";

export const POST = withErrorHandling(async () => {
	await authService.logout(await readSessionToken());
	await clearSessionCookie();
	return jsonOk({ success: true });
});
