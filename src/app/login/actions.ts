"use server";

import { redirect } from "next/navigation";

import { landingPathFor } from "@/lib/auth/landing";
import { clearSessionCookie, readSessionToken, setSessionCookie } from "@/lib/auth/session";
import { AppError, type FieldErrors } from "@/lib/errors";
import { authService } from "@/lib/services/auth.service";

/**
 * Server Actions for the login screen. Like the route handlers, they are thin adapters: they
 * read the form, hand it to the auth service, and translate failures into form state.
 */

export interface LoginFormState {
	message?: string;
	fields?: FieldErrors;
}

export async function loginAction(
	_previousState: LoginFormState,
	formData: FormData,
): Promise<LoginFormState> {
	const username = String(formData.get("username") ?? "");
	const password = String(formData.get("password") ?? "");

	let session;
	try {
		session = await authService.login({ username, password });
	} catch (error) {
		if (error instanceof AppError) {
			return {
				message: error.message,
				fields: "fields" in error ? (error.fields as FieldErrors) : undefined,
			};
		}

		console.error("Unhandled login failure", error);
		return { message: "Something went wrong. Please try again." };
	}

	// Outside the catch: `redirect` signals by throwing, so it must not be swallowed above.
	await setSessionCookie(session.token, session.expiresAt);
	redirect(landingPathFor(session.user));
}

export async function logoutAction(): Promise<void> {
	await authService.logout(await readSessionToken());
	await clearSessionCookie();
	redirect("/login");
}
