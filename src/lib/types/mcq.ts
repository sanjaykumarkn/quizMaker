/**
 * A multiple choice question, its choices, and the record of someone answering it.
 *
 * The types here exist mainly to make one boundary hard to cross by accident. The correct
 * answer must not reach the person about to answer, so the shape they receive
 * (`McqForAttempt`) has no `isCorrect` field at all. Leaking the answer key is then a compile
 * error rather than an oversight.
 */

/**
 * SQLite cannot express "between two and six rows in a child table", so these bounds are
 * enforced by `mcqChoicesSchema` and by the choice editor. Both import them from here so the
 * rule and the UI that enforces it cannot drift apart.
 */
export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;

/** A choice as stored, including whether it is the correct answer. Admin-visible only. */
export interface McqChoiceRecord {
	id: string;
	mcqId: string;
	body: string;
	isCorrect: boolean;
	/** Zero-based. SQLite makes no promise about row order without an ORDER BY. */
	position: number;
	createdAt: string;
	updatedAt: string;
}

/** The authoring view: a question with its full choice set and the answer key. */
export interface Mcq {
	id: string;
	name: string;
	description: string;
	/** Null once the authoring account has been deleted; the question outlives it. */
	createdBy: string | null;
	createdAt: string;
	updatedAt: string;
	choices: McqChoiceRecord[];
}

/** What the `/mcq` table needs. Carries a count rather than the choices themselves. */
export interface McqSummary {
	id: string;
	name: string;
	description: string;
	choiceCount: number;
	createdAt: string;
	updatedAt: string;
}

/** A choice with the answer key removed. */
export interface AttemptChoice {
	id: string;
	body: string;
	position: number;
}

/** What anyone about to answer receives, in JSON and in rendered HTML alike. */
export interface McqForAttempt {
	id: string;
	name: string;
	description: string;
	createdAt: string;
	updatedAt: string;
	choices: AttemptChoice[];
}

/**
 * Copies an explicit allowlist of fields rather than deleting `isCorrect` from a spread, so a
 * future sensitive column on a choice is excluded by default instead of leaking until noticed.
 * This mirrors `toPublicUser` in `src/lib/types/user.ts` and exists for the same reason.
 */
export function toAttemptView(mcq: Mcq): McqForAttempt {
	return {
		id: mcq.id,
		name: mcq.name,
		description: mcq.description,
		createdAt: mcq.createdAt,
		updatedAt: mcq.updatedAt,
		choices: mcq.choices.map((choice) => ({
			id: choice.id,
			body: choice.body,
			position: choice.position,
		})),
	};
}

/**
 * A recorded answer. Never recalculated: `isCorrect` is decided once, at submission, against
 * the choice rows as they stood at that moment.
 *
 * `choiceId` becomes null when the question is edited and its choice rows are replaced.
 * `selectedText` is the snapshot that keeps the row readable after that happens.
 */
export interface McqAttempt {
	id: string;
	mcqId: string;
	userId: string;
	choiceId: string | null;
	selectedText: string;
	isCorrect: boolean;
	createdAt: string;
}

/** The answer key is part of the result, so it is revealed only after the answer is committed. */
export interface AttemptOutcome {
	attempt: McqAttempt;
	correctChoiceId: string;
}
