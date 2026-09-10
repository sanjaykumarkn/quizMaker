import type { FieldErrors } from "@/lib/errors";

/**
 * Shared shapes for the MCQ forms. These live outside `actions.ts` because a `"use server"`
 * module may only export async functions, and an initial state is a value.
 */

export interface McqFormState {
	status: "idle" | "success" | "error";
	message?: string;
	fields?: FieldErrors;
}

export const idleMcqFormState: McqFormState = { status: "idle" };

/** The answer key arrives only in `outcome`, which exists only after an attempt is written. */
export interface AttemptOutcomeView {
	isCorrect: boolean;
	selectedText: string;
	correctChoiceId: string;
}

export interface AttemptFormState {
	status: "idle" | "answered" | "error";
	message?: string;
	fields?: FieldErrors;
	outcome?: AttemptOutcomeView;
}

export const idleAttemptFormState: AttemptFormState = { status: "idle" };
