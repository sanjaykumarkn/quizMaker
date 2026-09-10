import { describe, expect, it } from "vitest";

import {
	CHOICE_BODY_FIELD,
	CHOICE_KEY_FIELD,
	CORRECT_CHOICE_FIELD,
	readChoiceFields,
} from "@/app/mcq/form-fields";

/**
 * The only logic between the choice editor and the schema. Its failure mode is quiet and
 * expensive: marking the wrong choice correct produces a question that grades every learner
 * incorrectly for the right answer, with nothing to see in the UI.
 */

function form(rows: { key: string; body: string }[], correctKey = ""): FormData {
	const formData = new FormData();
	for (const row of rows) {
		formData.append(CHOICE_BODY_FIELD, row.body);
		formData.append(CHOICE_KEY_FIELD, row.key);
	}
	formData.set(CORRECT_CHOICE_FIELD, correctKey);
	return formData;
}

describe("readChoiceFields", () => {
	it("pairs each body with its own key", () => {
		const choices = readChoiceFields(
			form([
				{ key: "a", body: "Paris" },
				{ key: "b", body: "Lyon" },
			]),
			
		);
		expect(choices.map((choice) => choice.body)).toEqual(["Paris", "Lyon"]);
	});

	it("marks the selected row correct and no other", () => {
		const choices = readChoiceFields(
			form(
				[
					{ key: "a", body: "Paris" },
					{ key: "b", body: "Lyon" },
					{ key: "c", body: "Nice" },
				],
				"b",
			),
		);
		expect(choices.map((choice) => choice.isCorrect)).toEqual([false, true, false]);
	});

	it("keeps the answer on the right row after an earlier row is removed", () => {
		// The editor removed the first row; "b" is still the answer even though it is now
		// index 0. Index-based tracking would have moved the answer to "c".
		const choices = readChoiceFields(
			form(
				[
					{ key: "b", body: "Lyon" },
					{ key: "c", body: "Nice" },
				],
				"b",
			),
		);
		expect(choices).toEqual([
			{ body: "Lyon", isCorrect: true },
			{ body: "Nice", isCorrect: false },
		]);
	});

	it("preserves the submitted order, which becomes the stored position", () => {
		const choices = readChoiceFields(
			form(
				[
					{ key: "c", body: "Third" },
					{ key: "a", body: "First" },
					{ key: "b", body: "Second" },
				],
				"a",
			),
		);
		expect(choices.map((choice) => choice.body)).toEqual(["Third", "First", "Second"]);
	});

	it("marks nothing correct when no radio was selected", () => {
		const choices = readChoiceFields(
			form([
				{ key: "a", body: "Paris" },
				{ key: "b", body: "Lyon" },
			]),
		);
		expect(choices.every((choice) => !choice.isCorrect)).toBe(true);
	});

	it("marks nothing correct when the selection names a row that is gone", () => {
		const choices = readChoiceFields(
			form(
				[
					{ key: "a", body: "Paris" },
					{ key: "b", body: "Lyon" },
				],
				"removed-row",
			),
		);
		expect(choices.every((choice) => !choice.isCorrect)).toBe(true);
	});

	it("does not mark every row correct when both the key and the selection are empty", () => {
		// A blank `correctChoice` must not match a blank key. Without the length guard this
		// returns every choice marked correct, which the schema would reject but for the wrong
		// reason, and which would be a genuine bug if the guard moved.
		const choices = readChoiceFields(form([{ key: "", body: "Paris" }, { key: "", body: "Lyon" }]));
		expect(choices.every((choice) => !choice.isCorrect)).toBe(true);
	});

	it("returns nothing when the form carries no choices at all", () => {
		expect(readChoiceFields(new FormData())).toEqual([]);
	});

	it("keeps untrimmed text as typed, leaving trimming to the schema", () => {
		const choices = readChoiceFields(form([{ key: "a", body: "  Paris  " }], "a"));
		expect(choices[0].body).toBe("  Paris  ");
	});
});
