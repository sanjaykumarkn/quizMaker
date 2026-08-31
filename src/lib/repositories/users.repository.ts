import { getDb } from "@/lib/db/client";
import { ConflictError } from "@/lib/errors";
import type { UserRecord, UserRole } from "@/lib/types/user";

/**
 * Data access for users. This layer owns every SQL statement touching the table and applies
 * no business rules: it does not validate, does not hash, and does not decide who may act.
 */

interface UserRow {
	id: string;
	first_name: string;
	last_name: string;
	username: string;
	email: string;
	password_hash: string;
	role: string;
	created_at: string;
	updated_at: string;
}

const COLUMNS =
	"id, first_name, last_name, username, email, password_hash, role, created_at, updated_at";

function mapRow(row: UserRow): UserRecord {
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		username: row.username,
		email: row.email,
		passwordHash: row.password_hash,
		role: row.role === "admin" ? "admin" : "member",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Closes the gap between "check availability" and "write": two concurrent requests can both
 * pass the service-level check, and only the constraint catches the loser.
 */
function translateUniqueViolation(error: unknown): never {
	const message = error instanceof Error ? error.message : String(error);

	if (message.includes("users.username")) {
		throw new ConflictError("DUPLICATE_USERNAME", "That username is already taken.", {
			username: ["That username is already taken."],
		});
	}
	if (message.includes("users.email")) {
		throw new ConflictError("DUPLICATE_EMAIL", "That email address is already registered.", {
			email: ["That email address is already registered."],
		});
	}

	throw error;
}

export interface InsertUserInput {
	id: string;
	firstName: string;
	lastName: string;
	username: string;
	email: string;
	passwordHash: string;
	role: UserRole;
}

export interface UpdateUserFields {
	firstName?: string;
	lastName?: string;
	username?: string;
	email?: string;
	role?: UserRole;
}

export const usersRepository = {
	async findById(id: string): Promise<UserRecord | null> {
		const db = await getDb();
		const { results } = await db
			.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?1 LIMIT 1`)
			.bind(id)
			.all<UserRow>();
		return results[0] ? mapRow(results[0]) : null;
	},

	async findByUsername(username: string): Promise<UserRecord | null> {
		const db = await getDb();
		const { results } = await db
			.prepare(`SELECT ${COLUMNS} FROM users WHERE username = ?1 LIMIT 1`)
			.bind(username)
			.all<UserRow>();
		return results[0] ? mapRow(results[0]) : null;
	},

	async findByEmail(email: string): Promise<UserRecord | null> {
		const db = await getDb();
		const { results } = await db
			.prepare(`SELECT ${COLUMNS} FROM users WHERE email = ?1 LIMIT 1`)
			.bind(email)
			.all<UserRow>();
		return results[0] ? mapRow(results[0]) : null;
	},

	async listAll(): Promise<UserRecord[]> {
		const db = await getDb();
		const { results } = await db
			.prepare(`SELECT ${COLUMNS} FROM users ORDER BY created_at DESC, id DESC`)
			.all<UserRow>();
		return results.map(mapRow);
	},

	async insert(input: InsertUserInput): Promise<UserRecord> {
		const db = await getDb();
		try {
			const { results } = await db
				.prepare(
					`INSERT INTO users (id, first_name, last_name, username, email, password_hash, role)
					 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
					 RETURNING ${COLUMNS}`,
				)
				.bind(
					input.id,
					input.firstName,
					input.lastName,
					input.username,
					input.email,
					input.passwordHash,
					input.role,
				)
				.all<UserRow>();
			return mapRow(results[0]);
		} catch (error) {
			translateUniqueViolation(error);
		}
	},

	/**
	 * Only the supplied fields are written. `updated_at` is set explicitly because SQLite has
	 * no ON UPDATE CURRENT_TIMESTAMP.
	 */
	async update(id: string, fields: UpdateUserFields): Promise<UserRecord | null> {
		const columnByField: Record<keyof UpdateUserFields, string> = {
			firstName: "first_name",
			lastName: "last_name",
			username: "username",
			email: "email",
			role: "role",
		};

		const assignments: string[] = [];
		const values: unknown[] = [];

		for (const [field, column] of Object.entries(columnByField) as [keyof UpdateUserFields, string][]) {
			const value = fields[field];
			if (value !== undefined) {
				values.push(value);
				assignments.push(`${column} = ?${values.length}`);
			}
		}

		if (assignments.length === 0) {
			return this.findById(id);
		}

		assignments.push("updated_at = CURRENT_TIMESTAMP");
		values.push(id);

		const db = await getDb();
		try {
			const { results } = await db
				.prepare(
					`UPDATE users SET ${assignments.join(", ")} WHERE id = ?${values.length} RETURNING ${COLUMNS}`,
				)
				.bind(...values)
				.all<UserRow>();
			return results[0] ? mapRow(results[0]) : null;
		} catch (error) {
			translateUniqueViolation(error);
		}
	},

	async deleteById(id: string): Promise<boolean> {
		const db = await getDb();
		const result = await db.prepare("DELETE FROM users WHERE id = ?1").bind(id).run();
		return (result.meta.changes ?? 0) > 0;
	},

	async count(): Promise<number> {
		const db = await getDb();
		const { results } = await db.prepare("SELECT COUNT(*) AS total FROM users").all<{ total: number }>();
		return results[0]?.total ?? 0;
	},

	/** Used to refuse any change that would leave the system with nobody able to manage users. */
	async countAdmins(): Promise<number> {
		const db = await getDb();
		const { results } = await db
			.prepare("SELECT COUNT(*) AS total FROM users WHERE role = 'admin'")
			.all<{ total: number }>();
		return results[0]?.total ?? 0;
	},
};
