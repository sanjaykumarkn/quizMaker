import { getDb } from "@/lib/db/client";
import type { McqAttempt } from "@/lib/types/mcq";

/**
 * Data access for recorded answers. An attempt is written once and never updated: it is a
 * record of what somebody did, not a derived value. Nothing here recalculates `is_correct`.
 */

interface McqAttemptRow {
	id: string;
	mcq_id: string;
	user_id: string;
	choice_id: string | null;
	selected_text: string;
	is_correct: number;
	created_at: string;
}

const COLUMNS = "id, mcq_id, user_id, choice_id, selected_text, is_correct, created_at";

function mapRow(row: McqAttemptRow): McqAttempt {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		userId: row.user_id,
		choiceId: row.choice_id,
		selectedText: row.selected_text,
		isCorrect: Number(row.is_correct) === 1,
		createdAt: row.created_at,
	};
}

export interface InsertAttemptInput {
	id: string;
	mcqId: string;
	userId: string;
	choiceId: string;
	/** Snapshot of the chosen text, so the row survives the question being reworded. */
	selectedText: string;
	isCorrect: boolean;
}

export const mcqAttemptsRepository = {
	async insert(input: InsertAttemptInput): Promise<McqAttempt> {
		const db = await getDb();
		const { results } = await db
			.prepare(
				`INSERT INTO mcq_attempts (id, mcq_id, user_id, choice_id, selected_text, is_correct)
				 VALUES (?1, ?2, ?3, ?4, ?5, ?6)
				 RETURNING ${COLUMNS}`,
			)
			.bind(
				input.id,
				input.mcqId,
				input.userId,
				input.choiceId,
				input.selectedText,
				input.isCorrect ? 1 : 0,
			)
			.all<McqAttemptRow>();
		return mapRow(results[0]);
	},

	async listByMcq(mcqId: string): Promise<McqAttempt[]> {
		const db = await getDb();
		const { results } = await db
			.prepare(
				`SELECT ${COLUMNS} FROM mcq_attempts
				 WHERE mcq_id = ?1
				 ORDER BY created_at DESC, id DESC`,
			)
			.bind(mcqId)
			.all<McqAttemptRow>();
		return results.map(mapRow);
	},
};
