import type { FieldErrors } from "@/lib/errors";

export interface ForgotPasswordFormState {
	status: "idle" | "submitted" | "error";
	message?: string;
	fields?: FieldErrors;
}

export const idleForgotPasswordFormState: ForgotPasswordFormState = { status: "idle" };
