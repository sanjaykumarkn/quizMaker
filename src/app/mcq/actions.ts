"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { readChoiceFields } from "@/app/mcq/form-fields";
import type { AttemptFormState, McqFormState } from "@/app/mcq/form-state";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { AppError, type FieldErrors } from "@/lib/errors";
import { mcqService } from "@/lib/services/mcq.service";

/**
 * Server Actions for questions and attempts. Authorization happens here, at the entry point,
 * and every rule is delegated to `mcqService` so the REST API and the UI cannot diverge.
 *
 * Only async functions may be exported from a `"use server"` module; shared values belong in
 * `form-state.ts`.
 */

function toErrorState(error: unknown): McqFormState {
	if (error instanceof AppError) {
		return {
			status: "error",
			message: error.message,
			fields: "fields" in error ? (error.fields as FieldErrors) : undefined,
		};
	}

	console.error("Unhandled question management failure", error);
	return { status: "error", message: "Something went wrong. Please try again." };
}

function text(formData: FormData, key: string): string {
	return String(formData.get(key) ?? "");
}

export async function createMcqAction(
	_previousState: McqFormState,
	formData: FormData,
): Promise<McqFormState> {
	try {
		const author = await requireAdmin();
		await mcqService.create(
			{
				name: text(formData, "name"),
				description: text(formData, "description"),
				choices: readChoiceFields(formData),
			},
			author.id,
		);
	} catch (error) {
		return toErrorState(error);
	}

	// Outside the try: `redirect` signals by throwing, so catching it here would swallow the
	// navigation and report a made-up failure instead.
	revalidatePath("/mcq");
	redirect("/mcq");
}

export async function updateMcqAction(
	_previousState: McqFormState,
	formData: FormData,
): Promise<McqFormState> {
	const id = text(formData, "id");

	try {
		await requireAdmin();
		await mcqService.update(id, {
			name: text(formData, "name"),
			description: text(formData, "description"),
			choices: readChoiceFields(formData),
		});
	} catch (error) {
		return toErrorState(error);
	}

	revalidatePath("/mcq");
	revalidatePath(`/mcq/${id}/preview`);
	redirect("/mcq");
}

export async function deleteMcqAction(
	_previousState: McqFormState,
	formData: FormData,
): Promise<McqFormState> {
	try {
		await requireAdmin();
		await mcqService.delete(text(formData, "id"));
	} catch (error) {
		return toErrorState(error);
	}

	revalidatePath("/mcq");
	return { status: "success", message: "Question deleted." };
}

/**
 * Recording an answer. The user comes from the session, never from the form, so a caller
 * cannot attribute an attempt to somebody else. The correct choice is returned only in the
 * result, once the attempt has already been written.
 */
export async function submitAttemptAction(
	_previousState: AttemptFormState,
	formData: FormData,
): Promise<AttemptFormState> {
	try {
		const user = await requireUser();
		const mcqId = text(formData, "mcqId");
		const { attempt, correctChoiceId } = await mcqService.recordAttempt(mcqId, user.id, {
			choiceId: text(formData, "choiceId"),
		});

		revalidatePath(`/mcq/${mcqId}/preview`);

		return {
			status: "answered",
			outcome: {
				isCorrect: attempt.isCorrect,
				selectedText: attempt.selectedText,
				correctChoiceId,
			},
		};
	} catch (error) {
		const { message, fields } = toErrorState(error);
		return { status: "error", message, fields };
	}
}
