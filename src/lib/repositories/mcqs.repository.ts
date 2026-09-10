import { getDb } from "@/lib/db/client";
import { generateId } from "@/lib/security/tokens";
import type { Mcq, McqChoiceRecord, McqSummary } from "@/lib/types/mcq";

/**
 * Data access for questions and their choices. One repository owns both tables on purpose: a
 * choice has no independent lifecycle. It cannot exist without its question, is never
 * addressed on its own, and is always written as part of a whole question. Splitting it out
 * would invent an aggregate boundary the domain does not have, and would make it possible to
 * write four choices with no correct answer among them.
 *
 * This layer applies no business rules. It does not check the choice count and it does not
 * check that exactly one choice is correct; that is the service's job.
 */

interface McqRow {
	id: string;
	name: string;
	description: string;
	created_by: string | null;
	created_at: string;
	updated_at: string;
}

interface McqChoiceRow {
	id: string;
	mcq_id: string;
	body: string;
	is_correct: number;
	position: number;
	created_at: string;
	updated_at: string;
}

interface McqSummaryRow extends McqRow {
	choice_count: number;
}

const MCQ_COLUMNS = "id, name, description, created_by, created_at, updated_at";
const CHOICE_COLUMNS = "id, mcq_id, body, is_correct, position, created_at, updated_at";

function mapChoiceRow(row: McqChoiceRow): McqChoiceRecord {
	return {
		id: row.id,
		mcqId: row.mcq_id,
		body: row.body,
		// An explicit comparison, not a truthiness check. SQLite has no boolean type, and a
		// truthy test would quietly accept a string the day a row is edited by hand.
		isCorrect: Number(row.is_correct) === 1,
		position: Number(row.position),
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function mapMcqRow(row: McqRow, choices: McqChoiceRecord[]): Mcq {
	return {
		id: row.id,
		name: row.name,
		description: row.description,
		createdBy: row.created_by,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		choices,
	};
}

/** What the service hands over: text, correctness and the position it should display at. */
export interface InsertChoiceInput {
	body: string;
	isCorrect: boolean;
	position: number;
}

export interface InsertMcqInput {
	id: string;
	name: string;
	description: string;
	createdBy: string | null;
	choices: InsertChoiceInput[];
}

export interface UpdateMcqFields {
	name?: string;
	description?: string;
	/** When present, the entire choice set is replaced. */
	choices?: InsertChoiceInput[];
}

async function findChoices(db: D1Database, mcqId: string): Promise<McqChoiceRecord[]> {
	// ORDER BY position on every read. Without it the display order is whatever SQLite finds
	// convenient, which is stable in practice and therefore a bug that hides.
	const { results } = await db
		.prepare(`SELECT ${CHOICE_COLUMNS} FROM mcq_choices WHERE mcq_id = ?1 ORDER BY position ASC`)
		.bind(mcqId)
		.all<McqChoiceRow>();
	return results.map(mapChoiceRow);
}

/**
 * Choice ids are minted here rather than in the service. The service decides how many choices
 * there are and what order they sit in; which primary keys they get is storage identity and
 * nothing above this layer refers to them before they exist.
 */
function insertChoiceStatements(
	db: D1Database,
	mcqId: string,
	choices: InsertChoiceInput[],
): D1PreparedStatement[] {
	return choices.map((choice) =>
		db
			.prepare(
				`INSERT INTO mcq_choices (id, mcq_id, body, is_correct, position)
				 VALUES (?1, ?2, ?3, ?4, ?5)`,
			)
			.bind(generateId(), mcqId, choice.body, choice.isCorrect ? 1 : 0, choice.position),
	);
}

export const mcqsRepository = {
	async findById(id: string): Promise<Mcq | null> {
		const db = await getDb();
		const { results } = await db
			.prepare(`SELECT ${MCQ_COLUMNS} FROM mcqs WHERE id = ?1 LIMIT 1`)
			.bind(id)
			.all<McqRow>();

		const row = results[0];
		if (!row) {
			return null;
		}

		return mapMcqRow(row, await findChoices(db, id));
	},

	/**
	 * The list screen needs a choice count, not the choices. A LEFT JOIN keeps a question with
	 * no choices visible, which should be impossible but should not be invisible if it happens.
	 */
	async listSummaries(): Promise<McqSummary[]> {
		const db = await getDb();
		const { results } = await db
			.prepare(
				`SELECT m.id, m.name, m.description, m.created_by, m.created_at, m.updated_at,
				        COUNT(c.id) AS choice_count
				 FROM mcqs m
				 LEFT JOIN mcq_choices c ON c.mcq_id = m.id
				 GROUP BY m.id
				 ORDER BY m.created_at DESC, m.id DESC`,
			)
			.all<McqSummaryRow>();

		return results.map((row) => ({
			id: row.id,
			name: row.name,
			description: row.description,
			choiceCount: Number(row.choice_count),
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
	},

	/**
	 * The question row and all of its choices go in one `db.batch()`, which D1 runs as a single
	 * transaction. D1 has no interactive transactions, so two separate calls could leave a
	 * question with no choices if the second one failed.
	 */
	async insert(input: InsertMcqInput): Promise<Mcq> {
		const db = await getDb();

		await db.batch([
			db
				.prepare(
					"INSERT INTO mcqs (id, name, description, created_by) VALUES (?1, ?2, ?3, ?4)",
				)
				.bind(input.id, input.name, input.description, input.createdBy),
			...insertChoiceStatements(db, input.id, input.choices),
		]);

		const created = await this.findById(input.id);
		if (!created) {
			throw new Error(`Question ${input.id} vanished immediately after being inserted.`);
		}
		return created;
	},

	/**
	 * Only the supplied fields are written. `updated_at` is set explicitly because SQLite has
	 * no ON UPDATE CURRENT_TIMESTAMP.
	 *
	 * A supplied choice set replaces every existing row. The delete is the first statement in
	 * the same batch as the inserts, so `UNIQUE (mcq_id, position)` is never evaluated against
	 * a mixed state of old and new positions.
	 */
	async update(id: string, fields: UpdateMcqFields): Promise<Mcq | null> {
		const db = await getDb();
		const statements: D1PreparedStatement[] = [];

		const assignments: string[] = [];
		const values: unknown[] = [];

		if (fields.name !== undefined) {
			values.push(fields.name);
			assignments.push(`name = ?${values.length}`);
		}
		if (fields.description !== undefined) {
			values.push(fields.description);
			assignments.push(`description = ?${values.length}`);
		}

		// Always touch `updated_at`, including when only the choices changed: replacing the
		// answers is a change to the question as far as anyone reading the list is concerned.
		assignments.push("updated_at = CURRENT_TIMESTAMP");
		values.push(id);

		statements.push(
			db
				.prepare(`UPDATE mcqs SET ${assignments.join(", ")} WHERE id = ?${values.length}`)
				.bind(...values),
		);

		if (fields.choices !== undefined) {
			statements.push(db.prepare("DELETE FROM mcq_choices WHERE mcq_id = ?1").bind(id));
			statements.push(...insertChoiceStatements(db, id, fields.choices));
		}

		await db.batch(statements);

		return this.findById(id);
	},

	/** Choices cascade. Attempts are kept, with `choice_id` set to NULL. */
	async deleteById(id: string): Promise<boolean> {
		const db = await getDb();
		const result = await db.prepare("DELETE FROM mcqs WHERE id = ?1").bind(id).run();
		return (result.meta.changes ?? 0) > 0;
	},

	async count(): Promise<number> {
		const db = await getDb();
		const { results } = await db
			.prepare("SELECT COUNT(*) AS total FROM mcqs")
			.all<{ total: number }>();
		return results[0]?.total ?? 0;
	},
};
