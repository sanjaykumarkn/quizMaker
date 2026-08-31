"use server";

import { redirect } from "next/navigation";

import type { SignupFormState } from "@/app/signup/form-state";
import { landingPathFor } from "@/lib/auth/landing";
import { setSessionCookie } from "@/lib/auth/session";
import { AppError, type FieldErrors } from "@/lib/errors";
import { authService } from "@/lib/services/auth.service";

/**
 * Public registration. Unlike the actions under `/users`, this one deliberately does not call
 * `requireUser`: it is the one path that must work for someone with no session.
 */
export async function signupAction(
	_previousState: SignupFormState,
	formData: FormData,
): Promise<SignupFormState> {
	const value = (key: string) => String(formData.get(key) ?? "");

	let session;
	try {
		session = await authService.register({
			firstName: value("firstName"),
			lastName: value("lastName"),
			username: value("username"),
			email: value("email"),
			password: value("password"),
		});
	} catch (error) {
		if (error instanceof AppError) {
			return {
				message: error.message,
				fields: "fields" in error ? (error.fields as FieldErrors) : undefined,
			};
		}

		console.error("Unhandled signup failure", error);
		return { message: "Something went wrong. Please try again." };
	}

	// Outside the catch: `redirect` signals by throwing and must not be swallowed above.
	await setSessionCookie(session.token, session.expiresAt);
	redirect(landingPathFor(session.user));
}
