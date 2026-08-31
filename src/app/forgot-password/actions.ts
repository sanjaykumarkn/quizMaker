"use server";

import type { ForgotPasswordFormState } from "@/app/forgot-password/form-state";

/**
 * Self-service password reset is not implemented: it needs a one-time-token table and an email
 * provider, neither of which exists in this project yet. Rather than pretend, this action
 * validates the input and returns instructions.
 *
 * It deliberately never touches the database. Looking the account up could not change the
 * outcome, and a response that varied by whether the account existed would leak which
 * usernames and email addresses are registered.
 */
export async function forgotPasswordAction(
	_previousState: ForgotPasswordFormState,
	formData: FormData,
): Promise<ForgotPasswordFormState> {
	const account = String(formData.get("account") ?? "").trim();

	if (account.length === 0) {
		return {
			status: "error",
			fields: { account: ["Enter your username or email address."] },
		};
	}

	return {
		status: "submitted",
		message:
			"Password reset is handled by an administrator. Contact yours and ask them to set a new password for your account.",
	};
}
