import { beforeEach, describe, expect, it, vi } from "vitest";

import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Mcq, McqAttempt } from "@/lib/types/mcq";

/**
 * The service is mocked at the repository boundary. `getCloudflareContext()` does not work
 * under jsdom, so nothing in this suite may transitively import `src/lib/db/client.ts`.
 * Every rule under test lives above the SQL boundary anyway.
 */

vi.mock("@/lib/repositories/mcqs.repository", () => ({
	mcqsRepository: {
		findById: vi.fn(),
		listSummaries: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		deleteById: vi.fn(),
	},
}));

vi.mock("@/lib/repositories/mcq-attempts.repository", () => ({
	mcqAttemptsRepository: {
		insert: vi.fn(),
		listByMcq: vi.fn(),
	},
}));

// Predictable ids make the assertions about what was written readable.
let idCounter = 0;
vi.mock("@/lib/security/tokens", () => ({
	generateId: vi.fn(() => `generated-${++idCounter}`),
}));

const { mcqsRepository } = await import("@/lib/repositories/mcqs.repository");
const { mcqAttemptsRepository } = await import("@/lib/repositories/mcq-attempts.repository");
const { mcqService } = await import("@/lib/services/mcq.service");

const TIMESTAMP = "2026-09-10 10:00:00";

function choiceRecord(id: string, body: string, isCorrect: boolean, position: number) {
	return {
		id,
		mcqId: "mcq-1",
		body,
		isCorrect,
		position,
		createdAt: TIMESTAMP,
		updatedAt: TIMESTAMP,
	};
}

function storedMcq(): Mcq {
	return {
		id: "mcq-1",
		name: "Capital of France",
		description: "Pick the correct capital city.",
		createdBy: "user-1",
		createdAt: TIMESTAMP,
		updatedAt: TIMESTAMP,
		choices: [
			choiceRecord("choice-1", "Paris", true, 0),
			choiceRecord("choice-2", "Lyon", false, 1),
			choiceRecord("choice-3", "Marseille", false, 2),
		],
	};
}

function validInput() {
	return {
		name: "Capital of France",
		description: "Pick the correct capital city.",
		choices: [
			{ body: "Paris", isCorrect: true },
			{ body: "Lyon", isCorrect: false },
		],
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	idCounter = 0;
});

describe("mcqService.create", () => {
	it("stores the question with the author who created it", async () => {
		vi.mocked(mcqsRepository.insert).mockResolvedValue(storedMcq());

		await mcqService.create(validInput(), "user-1");

		expect(mcqsRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				name: "Capital of France",
				description: "Pick the correct capital city.",
				createdBy: "user-1",
			}),
		);
	});

	it("assigns each choice the position it was submitted in", async () => {
		vi.mocked(mcqsRepository.insert).mockResolvedValue(storedMcq());

		await mcqService.create(
			{
				name: "Ordering",
				description: "Order matters.",
				choices: [
					{ body: "First", isCorrect: true },
					{ body: "Second", isCorrect: false },
					{ body: "Third", isCorrect: false },
				],
			},
			"user-1",
		);

		const written = vi.mocked(mcqsRepository.insert).mock.calls[0][0];
		expect(written.choices.map((choice) => choice.position)).toEqual([0, 1, 2]);
		expect(written.choices.map((choice) => choice.body)).toEqual(["First", "Second", "Third"]);
	});

	it("rejects an invalid choice count before touching the database", async () => {
		await expect(
			mcqService.create(
				{ name: "Bad", description: "Only one choice.", choices: [{ body: "Paris", isCorrect: true }] },
				"user-1",
			),
		).rejects.toBeInstanceOf(ValidationError);

		expect(mcqsRepository.insert).not.toHaveBeenCalled();
	});

	it("rejects a question with no correct choice before touching the database", async () => {
		await expect(
			mcqService.create(
				{
					name: "Bad",
					description: "Nothing is correct.",
					choices: [
						{ body: "Paris", isCorrect: false },
						{ body: "Lyon", isCorrect: false },
					],
				},
				"user-1",
			),
		).rejects.toBeInstanceOf(ValidationError);

		expect(mcqsRepository.insert).not.toHaveBeenCalled();
	});
});

describe("mcqService.getById", () => {
	it("returns the stored question with its answer key", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());

		const mcq = await mcqService.getById("mcq-1");

		expect(mcq.choices.find((choice) => choice.isCorrect)?.body).toBe("Paris");
	});

	it("throws MCQ_NOT_FOUND for an unknown id", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(null);

		await expect(mcqService.getById("nope")).rejects.toMatchObject({
			code: "MCQ_NOT_FOUND",
			status: 404,
		});
	});
});

describe("mcqService.getForAttempt", () => {
	it("returns the question without the answer key", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());

		const view = await mcqService.getForAttempt("mcq-1");

		expect(view.choices).toHaveLength(3);
		expect(JSON.stringify(view)).not.toContain("isCorrect");
	});

	it("throws MCQ_NOT_FOUND for an unknown id", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(null);

		await expect(mcqService.getForAttempt("nope")).rejects.toBeInstanceOf(NotFoundError);
	});
});

describe("mcqService.update", () => {
	it("writes only the supplied fields", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqsRepository.update).mockResolvedValue(storedMcq());

		await mcqService.update("mcq-1", { name: "Renamed" });

		expect(mcqsRepository.update).toHaveBeenCalledWith("mcq-1", {
			name: "Renamed",
			description: undefined,
			choices: undefined,
		});
	});

	it("replaces the whole choice set when choices are supplied", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqsRepository.update).mockResolvedValue(storedMcq());

		await mcqService.update("mcq-1", {
			choices: [
				{ body: "Berlin", isCorrect: true },
				{ body: "Bonn", isCorrect: false },
			],
		});

		const [, fields] = vi.mocked(mcqsRepository.update).mock.calls[0];
		expect(fields.choices).toHaveLength(2);
		expect(fields.choices?.map((choice) => choice.body)).toEqual(["Berlin", "Bonn"]);
	});

	it("rejects an empty body", async () => {
		await expect(mcqService.update("mcq-1", {})).rejects.toBeInstanceOf(ValidationError);
		expect(mcqsRepository.update).not.toHaveBeenCalled();
	});

	it("rejects a replacement choice set that breaks the rules", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());

		await expect(
			mcqService.update("mcq-1", {
				choices: [
					{ body: "Berlin", isCorrect: true },
					{ body: "Bonn", isCorrect: true },
				],
			}),
		).rejects.toBeInstanceOf(ValidationError);

		expect(mcqsRepository.update).not.toHaveBeenCalled();
	});

	it("throws MCQ_NOT_FOUND for an unknown id", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(null);

		await expect(mcqService.update("nope", { name: "Renamed" })).rejects.toMatchObject({
			code: "MCQ_NOT_FOUND",
		});
	});
});

describe("mcqService.delete", () => {
	it("deletes an existing question", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqsRepository.deleteById).mockResolvedValue(true);

		await mcqService.delete("mcq-1");

		expect(mcqsRepository.deleteById).toHaveBeenCalledWith("mcq-1");
	});

	it("throws MCQ_NOT_FOUND for an unknown id", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(null);

		await expect(mcqService.delete("nope")).rejects.toMatchObject({ code: "MCQ_NOT_FOUND" });
		expect(mcqsRepository.deleteById).not.toHaveBeenCalled();
	});
});

describe("mcqService.recordAttempt", () => {
	function attemptRow(overrides: Partial<McqAttempt> = {}): McqAttempt {
		return {
			id: "attempt-1",
			mcqId: "mcq-1",
			userId: "user-2",
			choiceId: "choice-1",
			selectedText: "Paris",
			isCorrect: true,
			createdAt: TIMESTAMP,
			...overrides,
		};
	}

	it("records a correct answer as correct", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqAttemptsRepository.insert).mockResolvedValue(attemptRow());

		await mcqService.recordAttempt("mcq-1", "user-2", { choiceId: "choice-1" });

		expect(mcqAttemptsRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ choiceId: "choice-1", isCorrect: true }),
		);
	});

	it("records a wrong answer as incorrect", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqAttemptsRepository.insert).mockResolvedValue(
			attemptRow({ choiceId: "choice-2", selectedText: "Lyon", isCorrect: false }),
		);

		await mcqService.recordAttempt("mcq-1", "user-2", { choiceId: "choice-2" });

		expect(mcqAttemptsRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ choiceId: "choice-2", isCorrect: false }),
		);
	});

	it("grades from the stored choice, not from anything the caller sent", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqAttemptsRepository.insert).mockResolvedValue(attemptRow());

		// A tampered client claiming its wrong answer is correct changes nothing.
		await mcqService.recordAttempt("mcq-1", "user-2", {
			choiceId: "choice-2",
			isCorrect: true,
		});

		expect(mcqAttemptsRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ isCorrect: false }),
		);
	});

	it("snapshots the chosen text so the record survives an edit of the question", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqAttemptsRepository.insert).mockResolvedValue(attemptRow());

		await mcqService.recordAttempt("mcq-1", "user-2", { choiceId: "choice-1" });

		expect(mcqAttemptsRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ selectedText: "Paris" }),
		);
	});

	it("attributes the attempt to the signed-in user", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqAttemptsRepository.insert).mockResolvedValue(attemptRow());

		await mcqService.recordAttempt("mcq-1", "user-2", { choiceId: "choice-1" });

		expect(mcqAttemptsRepository.insert).toHaveBeenCalledWith(
			expect.objectContaining({ userId: "user-2" }),
		);
	});

	it("returns the correct choice id, so the answer is revealed only after committing", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqAttemptsRepository.insert).mockResolvedValue(
			attemptRow({ choiceId: "choice-2", selectedText: "Lyon", isCorrect: false }),
		);

		const outcome = await mcqService.recordAttempt("mcq-1", "user-2", { choiceId: "choice-2" });

		expect(outcome.correctChoiceId).toBe("choice-1");
		expect(outcome.attempt.isCorrect).toBe(false);
	});

	it("rejects a choice id belonging to another question and records nothing", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());

		await expect(
			mcqService.recordAttempt("mcq-1", "user-2", { choiceId: "choice-from-elsewhere" }),
		).rejects.toMatchObject({ code: "CHOICE_NOT_FOUND", status: 404 });

		expect(mcqAttemptsRepository.insert).not.toHaveBeenCalled();
	});

	it("rejects a missing choice id", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());

		await expect(mcqService.recordAttempt("mcq-1", "user-2", {})).rejects.toBeInstanceOf(
			ValidationError,
		);

		expect(mcqAttemptsRepository.insert).not.toHaveBeenCalled();
	});

	it("throws MCQ_NOT_FOUND when the question does not exist", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(null);

		await expect(
			mcqService.recordAttempt("nope", "user-2", { choiceId: "choice-1" }),
		).rejects.toMatchObject({ code: "MCQ_NOT_FOUND" });
	});
});

describe("mcqService.listAttempts", () => {
	it("returns the attempts for a question", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(storedMcq());
		vi.mocked(mcqAttemptsRepository.listByMcq).mockResolvedValue([]);

		await mcqService.listAttempts("mcq-1");

		expect(mcqAttemptsRepository.listByMcq).toHaveBeenCalledWith("mcq-1");
	});

	it("throws MCQ_NOT_FOUND rather than an empty list for an unknown question", async () => {
		vi.mocked(mcqsRepository.findById).mockResolvedValue(null);

		await expect(mcqService.listAttempts("nope")).rejects.toMatchObject({
			code: "MCQ_NOT_FOUND",
		});
		expect(mcqAttemptsRepository.listByMcq).not.toHaveBeenCalled();
	});
});

describe("mcqService.list", () => {
	it("returns the summaries the repository provides", async () => {
		vi.mocked(mcqsRepository.listSummaries).mockResolvedValue([
			{
				id: "mcq-1",
				name: "Capital of France",
				description: "Pick one.",
				choiceCount: 3,
				createdAt: TIMESTAMP,
				updatedAt: TIMESTAMP,
			},
		]);

		const summaries = await mcqService.list();

		expect(summaries).toHaveLength(1);
		expect(summaries[0].choiceCount).toBe(3);
	});
});
