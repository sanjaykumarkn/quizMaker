import { describe, expect, it } from "vitest";

import { ValidationError } from "@/lib/errors";
import { MAX_CHOICES, MIN_CHOICES } from "@/lib/types/mcq";
import { parse } from "@/lib/validation/parse";
import {
	createMcqSchema,
	recordAttemptSchema,
	updateMcqSchema,
} from "@/lib/validation/mcq.schemas";

/**
 * The two invariants SQLite cannot express — "between two and six choices" and "exactly one
 * of them is correct" — live only in these schemas. If they are not enforced here they are
 * not enforced anywhere, which is why this file covers the failure cases in detail.
 */

function choice(body: string, isCorrect = false) {
	return { body, isCorrect };
}

function question(choices: { body: string; isCorrect: boolean }[]) {
	return {
		name: "Capital of France",
		description: "Pick the correct capital city.",
		choices,
	};
}

/** Builds `count` choices with the first one correct, so only the count is under test. */
function choicesOfLength(count: number) {
	return Array.from({ length: count }, (_, index) => choice(`Choice ${index + 1}`, index === 0));
}

function fieldKeys(input: unknown, schema: typeof createMcqSchema): string[] {
	try {
		parse(schema, input);
	} catch (error) {
		if (error instanceof ValidationError) {
			return Object.keys(error.fields);
		}
		throw error;
	}
	throw new Error("Expected the schema to reject this input, but it was accepted.");
}

describe("createMcqSchema", () => {
	it("accepts a question with the minimum number of choices", () => {
		const result = createMcqSchema.safeParse(question([choice("Paris", true), choice("Lyon")]));
		expect(result.success).toBe(true);
	});

	it("accepts a question with the maximum number of choices", () => {
		const result = createMcqSchema.safeParse(question(choicesOfLength(MAX_CHOICES)));
		expect(result.success).toBe(true);
	});

	it("trims the name and the description", () => {
		const result = createMcqSchema.parse({
			name: "  Capital of France  ",
			description: "  Pick one.  ",
			choices: [choice("Paris", true), choice("Lyon")],
		});
		expect(result.name).toBe("Capital of France");
		expect(result.description).toBe("Pick one.");
	});

	it("trims each choice body", () => {
		const result = createMcqSchema.parse(question([choice("  Paris  ", true), choice("Lyon")]));
		expect(result.choices[0].body).toBe("Paris");
	});

	describe("choice count", () => {
		it(`rejects fewer than ${MIN_CHOICES} choices`, () => {
			const result = createMcqSchema.safeParse(question([choice("Paris", true)]));
			expect(result.success).toBe(false);
			expect(result.error?.issues.some((issue) => /at least 2/.test(issue.message))).toBe(true);
		});

		it("rejects an empty choice list", () => {
			expect(createMcqSchema.safeParse(question([])).success).toBe(false);
		});

		it(`rejects more than ${MAX_CHOICES} choices`, () => {
			const result = createMcqSchema.safeParse(question(choicesOfLength(MAX_CHOICES + 1)));
			expect(result.success).toBe(false);
			expect(result.error?.issues.some((issue) => /at most 6/.test(issue.message))).toBe(true);
		});

		it("reports a bad choice count against the choices field, not the form", () => {
			expect(fieldKeys(question([choice("Paris", true)]), createMcqSchema)).toContain("choices");
		});
	});

	describe("exactly one correct choice", () => {
		it("rejects a question with no correct choice", () => {
			const result = createMcqSchema.safeParse(question([choice("Paris"), choice("Lyon")]));
			expect(result.success).toBe(false);
			expect(result.error?.issues.some((issue) => /exactly one/i.test(issue.message))).toBe(true);
		});

		it("rejects a question with two correct choices", () => {
			const result = createMcqSchema.safeParse(
				question([choice("Paris", true), choice("Lyon", true)]),
			);
			expect(result.success).toBe(false);
			expect(result.error?.issues.some((issue) => /exactly one/i.test(issue.message))).toBe(true);
		});

		it("reports the missing correct answer against the choices field", () => {
			expect(fieldKeys(question([choice("Paris"), choice("Lyon")]), createMcqSchema)).toContain(
				"choices",
			);
		});
	});

	describe("distinct choices", () => {
		it("rejects two identical choices", () => {
			const result = createMcqSchema.safeParse(question([choice("Paris", true), choice("Paris")]));
			expect(result.success).toBe(false);
			expect(result.error?.issues.some((issue) => /different/i.test(issue.message))).toBe(true);
		});

		it("compares choices case-insensitively", () => {
			const result = createMcqSchema.safeParse(question([choice("Paris", true), choice("PARIS")]));
			expect(result.success).toBe(false);
		});

		it("compares choices after trimming, so padding cannot smuggle a duplicate through", () => {
			const result = createMcqSchema.safeParse(question([choice("Paris", true), choice("  Paris ")]));
			expect(result.success).toBe(false);
		});
	});

	describe("required fields", () => {
		it("rejects a missing name", () => {
			expect(fieldKeys(
				{ description: "Pick one.", choices: [choice("Paris", true), choice("Lyon")] },
				createMcqSchema,
			)).toContain("name");
		});

		it("rejects a name that is only whitespace", () => {
			const result = createMcqSchema.safeParse({
				name: "   ",
				description: "Pick one.",
				choices: [choice("Paris", true), choice("Lyon")],
			});
			expect(result.success).toBe(false);
		});

		it("rejects a missing description", () => {
			expect(fieldKeys(
				{ name: "Capital", choices: [choice("Paris", true), choice("Lyon")] },
				createMcqSchema,
			)).toContain("description");
		});

		it("rejects an empty choice body and names the offending row", () => {
			const keys = fieldKeys(question([choice("", true), choice("Lyon")]), createMcqSchema);
			expect(keys).toContain("choices.0.body");
		});

		it("rejects a name longer than 120 characters", () => {
			const result = createMcqSchema.safeParse({
				name: "a".repeat(121),
				description: "Pick one.",
				choices: [choice("Paris", true), choice("Lyon")],
			});
			expect(result.success).toBe(false);
		});

		it("rejects a description longer than 500 characters", () => {
			const result = createMcqSchema.safeParse({
				name: "Capital",
				description: "a".repeat(501),
				choices: [choice("Paris", true), choice("Lyon")],
			});
			expect(result.success).toBe(false);
		});

		it("rejects a choice body longer than 300 characters", () => {
			const result = createMcqSchema.safeParse(
				question([choice("a".repeat(301), true), choice("Lyon")]),
			);
			expect(result.success).toBe(false);
		});
	});
});

describe("updateMcqSchema", () => {
	it("accepts a name on its own", () => {
		const result = updateMcqSchema.safeParse({ name: "New name" });
		expect(result.success).toBe(true);
	});

	it("accepts a description on its own", () => {
		expect(updateMcqSchema.safeParse({ description: "New description" }).success).toBe(true);
	});

	it("rejects an empty body", () => {
		const result = updateMcqSchema.safeParse({});
		expect(result.success).toBe(false);
		expect(result.error?.issues.some((issue) => /at least one field/i.test(issue.message))).toBe(
			true,
		);
	});

	it("applies the full choice rules when choices are supplied", () => {
		expect(updateMcqSchema.safeParse({ choices: [choice("Paris", true)] }).success).toBe(false);
		expect(
			updateMcqSchema.safeParse({ choices: [choice("Paris"), choice("Lyon")] }).success,
		).toBe(false);
		expect(
			updateMcqSchema.safeParse({ choices: [choice("Paris", true), choice("Lyon")] }).success,
		).toBe(true);
	});

	it("leaves omitted fields undefined rather than defaulting them", () => {
		const result = updateMcqSchema.parse({ name: "New name" });
		expect(result.description).toBeUndefined();
		expect(result.choices).toBeUndefined();
	});
});

describe("recordAttemptSchema", () => {
	it("accepts a choice id", () => {
		expect(recordAttemptSchema.safeParse({ choiceId: "choice-1" }).success).toBe(true);
	});

	it("rejects a missing choice id", () => {
		expect(recordAttemptSchema.safeParse({}).success).toBe(false);
	});

	it("rejects an empty choice id", () => {
		expect(recordAttemptSchema.safeParse({ choiceId: "" }).success).toBe(false);
	});

	it("rejects a choice id that is only whitespace", () => {
		expect(recordAttemptSchema.safeParse({ choiceId: "   " }).success).toBe(false);
	});
});
