import { z } from "zod";

import { MAX_CHOICES, MIN_CHOICES } from "@/lib/types/mcq";

/**
 * Server-side validation for questions and attempts. These schemas are the only gate on the
 * two invariants SQLite cannot express — a choice count between two and six, and exactly one
 * correct choice per question — so every write path goes through them. The choice editor
 * enforces the same rules in the browser, but that is a convenience, not a control.
 */

export const mcqNameSchema = z
	.string({ error: "Name is required." })
	.trim()
	.min(1, "Name is required.")
	.max(120, "Name must be 120 characters or fewer.");

export const mcqDescriptionSchema = z
	.string({ error: "Description is required." })
	.trim()
	.min(1, "Description is required.")
	.max(500, "Description must be 500 characters or fewer.");

export const mcqChoiceSchema = z.object({
	body: z
		.string({ error: "Choice text is required." })
		.trim()
		.min(1, "Choice text is required.")
		.max(300, "A choice must be 300 characters or fewer."),
	isCorrect: z.boolean({ error: "Mark exactly one choice as the correct answer." }),
});

/**
 * The messages attach to the `choices` path rather than to a single row, because "there are
 * too few of you" and "none of you is correct" are properties of the set, not of any one
 * choice. The form renders them next to the choice editor as a whole.
 */
export const mcqChoicesSchema = z
	.array(mcqChoiceSchema)
	.min(MIN_CHOICES, `A question needs at least ${MIN_CHOICES} choices.`)
	.max(MAX_CHOICES, `A question can have at most ${MAX_CHOICES} choices.`)
	.refine((choices) => choices.filter((choice) => choice.isCorrect).length === 1, {
		message: "Exactly one choice must be marked as the correct answer.",
	})
	.refine(
		(choices) =>
			new Set(choices.map((choice) => choice.body.trim().toLowerCase())).size === choices.length,
		{
			// Two choices that read the same make the question unanswerable rather than merely
			// untidy: a learner picking the "wrong" duplicate is marked incorrect for the right
			// answer.
			message: "Each choice must be different.",
		},
	);

export const createMcqSchema = z.object({
	name: mcqNameSchema,
	description: mcqDescriptionSchema,
	choices: mcqChoicesSchema,
});

/**
 * `choices` is all-or-nothing. A partial choice list is not a concept: the count rule and the
 * single-correct rule can only be checked against a complete set, so supplying `choices`
 * replaces every row.
 */
export const updateMcqSchema = z
	.object({
		name: mcqNameSchema.optional(),
		description: mcqDescriptionSchema.optional(),
		choices: mcqChoicesSchema.optional(),
	})
	.refine((value) => Object.values(value).some((field) => field !== undefined), {
		message: "Provide at least one field to update.",
	});

/**
 * An attempt submits only which choice was picked. Anything the client might claim about
 * whether that choice is correct is ignored, because grading happens in the service.
 */
export const recordAttemptSchema = z.object({
	choiceId: z
		.string({ error: "Select an answer." })
		.trim()
		.min(1, "Select an answer."),
});

export type McqChoiceInput = z.infer<typeof mcqChoiceSchema>;
export type CreateMcqInput = z.infer<typeof createMcqSchema>;
export type UpdateMcqInput = z.infer<typeof updateMcqSchema>;
export type RecordAttemptInput = z.infer<typeof recordAttemptSchema>;
