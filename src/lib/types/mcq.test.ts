import { describe, expect, it } from "vitest";

import { MAX_CHOICES, MIN_CHOICES, toAttemptView, type Mcq } from "@/lib/types/mcq";

/**
 * The correct answer is the one field in this module that must not reach the person about to
 * answer. `toAttemptView` is the strip, so it is worth testing on its own rather than only
 * through the service.
 */

const mcq: Mcq = {
	id: "mcq-1",
	name: "Capital of France",
	// Deliberately free of the word "correct" so the leakage assertion below is testing the
	// payload's field names rather than tripping over the question text.
	description: "Pick the capital city.",
	createdBy: "user-1",
	createdAt: "2026-09-10 10:00:00",
	updatedAt: "2026-09-10 10:00:00",
	choices: [
		{
			id: "choice-1",
			mcqId: "mcq-1",
			body: "Paris",
			isCorrect: true,
			position: 0,
			createdAt: "2026-09-10 10:00:00",
			updatedAt: "2026-09-10 10:00:00",
		},
		{
			id: "choice-2",
			mcqId: "mcq-1",
			body: "Lyon",
			isCorrect: false,
			position: 1,
			createdAt: "2026-09-10 10:00:00",
			updatedAt: "2026-09-10 10:00:00",
		},
	],
};

describe("choice bounds", () => {
	it("allows between two and six choices", () => {
		expect(MIN_CHOICES).toBe(2);
		expect(MAX_CHOICES).toBe(6);
	});
});

describe("toAttemptView", () => {
	it("keeps the question text and every choice", () => {
		const view = toAttemptView(mcq);
		expect(view.name).toBe("Capital of France");
		expect(view.description).toBe("Pick the capital city.");
		expect(view.choices).toHaveLength(2);
		expect(view.choices.map((choice) => choice.body)).toEqual(["Paris", "Lyon"]);
	});

	it("removes isCorrect from every choice", () => {
		for (const choice of toAttemptView(mcq).choices) {
			expect(choice).not.toHaveProperty("isCorrect");
		}
	});

	it("leaves no trace of the answer key anywhere in the serialized payload", () => {
		// Serializing is what a page or a JSON response actually does, so this catches the
		// answer key hiding in a field the per-choice check above does not look at.
		const serialized = JSON.stringify(toAttemptView(mcq));
		expect(serialized).not.toContain("isCorrect");
		expect(serialized).not.toContain("correct");
	});

	it("preserves choice order", () => {
		const view = toAttemptView(mcq);
		expect(view.choices.map((choice) => choice.position)).toEqual([0, 1]);
	});

	it("does not mutate the question it was given", () => {
		toAttemptView(mcq);
		expect(mcq.choices[0].isCorrect).toBe(true);
	});
});
