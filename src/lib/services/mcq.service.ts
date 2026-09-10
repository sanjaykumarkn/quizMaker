import { NotFoundError } from "@/lib/errors";
import { mcqAttemptsRepository } from "@/lib/repositories/mcq-attempts.repository";
import {
	mcqsRepository,
	type InsertChoiceInput,
	type UpdateMcqFields,
} from "@/lib/repositories/mcqs.repository";
import { generateId } from "@/lib/security/tokens";
import {
	toAttemptView,
	type AttemptOutcome,
	type Mcq,
	type McqAttempt,
	type McqForAttempt,
	type McqSummary,
} from "@/lib/types/mcq";
import { createMcqSchema, recordAttemptSchema, updateMcqSchema } from "@/lib/validation/mcq.schemas";
import { parse } from "@/lib/validation/parse";
import type { McqChoiceInput } from "@/lib/validation/mcq.schemas";

/**
 * Business rules for questions and attempts. Two of them are worth naming, because they are
 * the reason this layer exists rather than the API calling the repository directly:
 *
 * 1. A question always has between two and six choices, exactly one of which is correct.
 *    SQLite cannot express either constraint, so the schema and this service are the only gate.
 * 2. An answer is graded here, on the server, against the stored choice. Nothing the caller
 *    sends about correctness is read.
 */

function mcqNotFound(): NotFoundError {
	return new NotFoundError("MCQ_NOT_FOUND", "That question does not exist.");
}

/** Every method that acts on an existing question starts here, so 404 is decided in one place. */
async function requireMcq(id: string): Promise<Mcq> {
	const mcq = await mcqsRepository.findById(id);
	if (!mcq) {
		throw mcqNotFound();
	}
	return mcq;
}

/**
 * Position is the array index, so the order the author submitted is the order that gets
 * stored. Nothing else decides it.
 */
function toInsertChoices(choices: McqChoiceInput[]): InsertChoiceInput[] {
	return choices.map((choice, index) => ({
		body: choice.body,
		isCorrect: choice.isCorrect,
		position: index,
	}));
}

export const mcqService = {
	async create(input: unknown, authorId: string | null): Promise<Mcq> {
		const data = parse(createMcqSchema, input);

		return mcqsRepository.insert({
			id: generateId(),
			name: data.name,
			description: data.description,
			createdBy: authorId,
			choices: toInsertChoices(data.choices),
		});
	},

	async list(): Promise<McqSummary[]> {
		return mcqsRepository.listSummaries();
	},

	/** The authoring view, including the answer key. Callers must gate this on `requireAdmin`. */
	async getById(id: string): Promise<Mcq> {
		return requireMcq(id);
	},

	/**
	 * The view for anyone about to answer. `McqForAttempt` has no `isCorrect` field, so the
	 * answer key cannot reach the browser through this path even by accident.
	 */
	async getForAttempt(id: string): Promise<McqForAttempt> {
		return toAttemptView(await requireMcq(id));
	},

	async update(id: string, input: unknown): Promise<Mcq> {
		const data = parse(updateMcqSchema, input);

		await requireMcq(id);

		const fields: UpdateMcqFields = {
			name: data.name,
			description: data.description,
			choices: data.choices === undefined ? undefined : toInsertChoices(data.choices),
		};

		const updated = await mcqsRepository.update(id, fields);
		if (!updated) {
			throw mcqNotFound();
		}
		return updated;
	},

	async delete(id: string): Promise<void> {
		await requireMcq(id);

		const deleted = await mcqsRepository.deleteById(id);
		if (!deleted) {
			throw mcqNotFound();
		}
	},

	/**
	 * Grading. The only input taken from the caller is which choice they picked; whether that
	 * choice is correct is read from the database. A client claiming its wrong answer is right
	 * changes nothing.
	 *
	 * A `choiceId` that does not belong to this question is a 404 rather than a silent wrong
	 * answer, because it can only come from a tampered or stale client and recording it as an
	 * incorrect attempt would put a fiction in the history.
	 */
	async recordAttempt(mcqId: string, userId: string, input: unknown): Promise<AttemptOutcome> {
		const { choiceId } = parse(recordAttemptSchema, input);

		const mcq = await requireMcq(mcqId);

		const chosen = mcq.choices.find((choice) => choice.id === choiceId);
		if (!chosen) {
			throw new NotFoundError("CHOICE_NOT_FOUND", "That choice does not belong to this question.");
		}

		const correct = mcq.choices.find((choice) => choice.isCorrect);
		if (!correct) {
			// Unreachable through any validated write path, so it is a data-integrity failure
			// rather than a user error. Better to say so than to mark every answer wrong.
			throw new Error(`Question ${mcqId} has no correct choice, so it cannot be graded.`);
		}

		const attempt = await mcqAttemptsRepository.insert({
			id: generateId(),
			mcqId,
			userId,
			choiceId: chosen.id,
			selectedText: chosen.body,
			isCorrect: chosen.isCorrect,
		});

		return { attempt, correctChoiceId: correct.id };
	},

	/** An unknown question is a 404, not an empty list, so a typo is distinguishable. */
	async listAttempts(mcqId: string): Promise<McqAttempt[]> {
		await requireMcq(mcqId);
		return mcqAttemptsRepository.listByMcq(mcqId);
	},
};
