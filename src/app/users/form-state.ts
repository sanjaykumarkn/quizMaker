import type { FieldErrors } from "@/lib/errors";

/**
 * Shared shape of the user-management form results. This lives outside `actions.ts` because a
 * `"use server"` module may only export async functions, and the initial state is a value.
 */
export interface UserFormState {
	status: "idle" | "success" | "error";
	message?: string;
	fields?: FieldErrors;
}

export const idleUserFormState: UserFormState = { status: "idle" };
