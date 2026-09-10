import type { FieldErrors } from "@/lib/errors";

/**
 * Kept out of `actions.ts` because a `"use server"` module may only export async functions.
 */
export interface SignupFormState {
	message?: string;
	fields?: FieldErrors;
}

export const idleSignupFormState: SignupFormState = {};
