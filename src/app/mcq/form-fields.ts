import type { McqChoiceInput } from "@/lib/validation/mcq.schemas";

/**
 * Translation between the choice editor's flat form fields and the array shape the schema
 * expects. This lives outside `actions.ts` so it can be tested directly: a `"use server"`
 * module may only export async functions, and this is the one piece of the MCQ presentation
 * layer with real room to be silently wrong.
 *
 * The editor emits one `choiceBody` and one `choiceKey` per row, in display order, plus a
 * single `correctChoice` holding the key of the selected row.
 */

export const CHOICE_BODY_FIELD = "choiceBody";
export const CHOICE_KEY_FIELD = "choiceKey";
export const CORRECT_CHOICE_FIELD = "correctChoice";

/**
 * Keys rather than indices are what make add and remove safe. With indices, removing the
 * first row would shift every later row down and quietly move the correct answer onto a
 * different choice.
 *
 * `getAll` preserves document order, so the bodies and the keys line up positionally.
 */
export function readChoiceFields(formData: FormData): McqChoiceInput[] {
	const bodies = formData.getAll(CHOICE_BODY_FIELD).map((value) => String(value));
	const keys = formData.getAll(CHOICE_KEY_FIELD).map((value) => String(value));
	const correctKey = String(formData.get(CORRECT_CHOICE_FIELD) ?? "");

	return bodies.map((body, index) => ({
		body,
		// An unselected radio leaves `correctChoice` empty, so no row is marked correct and the
		// schema reports the missing answer rather than the form guessing one. An empty key
		// cannot match an empty selection either, which would mark every row correct.
		isCorrect: correctKey.length > 0 && keys[index] === correctKey,
	}));
}
