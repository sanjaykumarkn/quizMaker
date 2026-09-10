import { requireUser } from "@/lib/auth/session";
import { jsonOk, withErrorHandling } from "@/lib/http/api";

export const GET = withErrorHandling(async () => {
	return jsonOk({ user: await requireUser() });
});
