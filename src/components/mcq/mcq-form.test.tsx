import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McqForm } from "@/components/mcq/mcq-form";
import { MAX_CHOICES, MIN_CHOICES, type Mcq } from "@/lib/types/mcq";

/**
 * The choice editor's job is to make the invalid states unreachable: never fewer than two
 * rows, never more than six, and never two correct answers. Those are enforced by disabling
 * controls, which only a rendered component can show.
 */

const createMcqAction = vi.fn(async () => ({ status: "success" as const }));
const updateMcqAction = vi.fn(async () => ({ status: "success" as const }));

vi.mock("@/app/mcq/actions", () => ({
	createMcqAction: (...args: unknown[]) => createMcqAction(...(args as [])),
	updateMcqAction: (...args: unknown[]) => updateMcqAction(...(args as [])),
}));

vi.mock("next/link", () => ({
	default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

function choiceInputs() {
	return screen.getAllByRole("textbox", { name: /^choice \d+$/i });
}

function addChoiceButton() {
	return screen.getByRole("button", { name: /add choice/i });
}

const storedMcq: Mcq = {
	id: "mcq-1",
	name: "Capital of France",
	description: "Which city is the capital of France?",
	createdBy: "user-1",
	createdAt: "2026-09-10 10:00:00",
	updatedAt: "2026-09-10 10:00:00",
	choices: [
		{ id: "c1", mcqId: "mcq-1", body: "Paris", isCorrect: true, position: 0, createdAt: "", updatedAt: "" },
		{ id: "c2", mcqId: "mcq-1", body: "Lyon", isCorrect: false, position: 1, createdAt: "", updatedAt: "" },
		{ id: "c3", mcqId: "mcq-1", body: "Nice", isCorrect: false, position: 2, createdAt: "", updatedAt: "" },
	],
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe("McqForm choice editor", () => {
	it("opens a new question at the minimum choice count", () => {
		render(<McqForm />);
		expect(choiceInputs()).toHaveLength(MIN_CHOICES);
	});

	it("cannot go below the minimum, so Remove is disabled at two rows", () => {
		render(<McqForm />);
		for (const button of screen.getAllByRole("button", { name: /remove choice/i })) {
			expect(button).toHaveProperty("disabled", true);
		}
	});

	it("adds a row on Add choice", async () => {
		render(<McqForm />);
		await userEvent.click(addChoiceButton());
		expect(choiceInputs()).toHaveLength(MIN_CHOICES + 1);
	});

	it("cannot go above the maximum, so Add choice is disabled at six rows", async () => {
		render(<McqForm />);
		for (let count = MIN_CHOICES; count < MAX_CHOICES; count += 1) {
			await userEvent.click(addChoiceButton());
		}

		expect(choiceInputs()).toHaveLength(MAX_CHOICES);
		expect(addChoiceButton()).toHaveProperty("disabled", true);
	});

	it("keeps what was typed in the other rows when a row is added", async () => {
		render(<McqForm />);
		await userEvent.type(choiceInputs()[0], "Paris");
		await userEvent.click(addChoiceButton());

		expect(choiceInputs()[0]).toHaveProperty("value", "Paris");
	});

	it("removes the row that was clicked, not the last one", async () => {
		render(<McqForm mcq={storedMcq} />);
		await userEvent.click(screen.getByRole("button", { name: /remove choice 1/i }));

		expect(choiceInputs().map((input) => (input as HTMLInputElement).value)).toEqual([
			"Lyon",
			"Nice",
		]);
	});

	it("prefills an existing question and preselects its correct answer", () => {
		render(<McqForm mcq={storedMcq} />);

		expect(choiceInputs().map((input) => (input as HTMLInputElement).value)).toEqual([
			"Paris",
			"Lyon",
			"Nice",
		]);
		expect(
			document.querySelector<HTMLInputElement>('input[name="correctChoice"]')?.value,
		).toBe("c1");
	});

	it("moves the correct answer when a different radio is chosen, never adding a second", async () => {
		render(<McqForm mcq={storedMcq} />);
		await userEvent.click(
			screen.getByRole("radio", { name: /mark choice 2 as the correct answer/i }),
		);

		expect(
			document.querySelector<HTMLInputElement>('input[name="correctChoice"]')?.value,
		).toBe("c2");
	});

	it("clears the answer when the row holding it is removed, rather than reassigning it", async () => {
		render(<McqForm mcq={storedMcq} />);
		await userEvent.click(screen.getByRole("button", { name: /remove choice 1/i }));

		expect(
			document.querySelector<HTMLInputElement>('input[name="correctChoice"]')?.value,
		).toBe("");
	});

	it("refuses to submit a question with no correct answer marked", async () => {
		render(<McqForm />);
		await userEvent.type(choiceInputs()[0], "Paris");
		await userEvent.type(choiceInputs()[1], "Lyon");
		await userEvent.type(screen.getByLabelText(/^name$/i), "Capital");
		await userEvent.type(screen.getByLabelText(/^description$/i), "Which one?");

		await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

		expect(await screen.findByText(/mark one choice as the correct answer/i)).toBeTruthy();
		expect(createMcqAction).not.toHaveBeenCalled();
	});

	it("refuses to submit a question with an empty choice", async () => {
		render(<McqForm />);
		await userEvent.type(screen.getByLabelText(/^name$/i), "Capital");
		await userEvent.type(screen.getByLabelText(/^description$/i), "Which one?");
		await userEvent.type(choiceInputs()[0], "Paris");
		await userEvent.click(
			screen.getByRole("radio", { name: /mark choice 1 as the correct answer/i }),
		);

		await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

		expect(await screen.findByText(/choice text is required/i)).toBeTruthy();
		expect(createMcqAction).not.toHaveBeenCalled();
	});

	it("submits a complete question", async () => {
		render(<McqForm />);
		await userEvent.type(screen.getByLabelText(/^name$/i), "Capital");
		await userEvent.type(screen.getByLabelText(/^description$/i), "Which one?");
		await userEvent.type(choiceInputs()[0], "Paris");
		await userEvent.type(choiceInputs()[1], "Lyon");
		await userEvent.click(
			screen.getByRole("radio", { name: /mark choice 1 as the correct answer/i }),
		);

		await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

		expect(createMcqAction).toHaveBeenCalled();
		expect(updateMcqAction).not.toHaveBeenCalled();
	});

	it("uses the update action when editing", async () => {
		render(<McqForm mcq={storedMcq} />);
		await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

		expect(updateMcqAction).toHaveBeenCalled();
		expect(createMcqAction).not.toHaveBeenCalled();
	});

	it("offers Save and a Cancel that navigates back without submitting", () => {
		render(<McqForm />);

		expect(screen.getByRole("button", { name: /^save$/i })).toBeTruthy();
		expect(screen.getByRole("link", { name: /^cancel$/i })).toHaveProperty(
			"href",
			expect.stringContaining("/mcq"),
		);
		expect(createMcqAction).not.toHaveBeenCalled();
	});
});
