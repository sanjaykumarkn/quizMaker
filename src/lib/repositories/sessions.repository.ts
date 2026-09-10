import { getDb } from "@/lib/db/client";
import type { SessionRecord, UserRecord } from "@/lib/types/user";

interface SessionRow {
	id: string;
	user_id: string;
	token_hash: string;
	expires_at: string;
	created_at: string;
}

interface SessionWithUserRow extends SessionRow {
	u_id: string;
	u_first_name: string;
	u_last_name: string;
	u_username: string;
	u_email: string;
	u_password_hash: string;
	u_role: string;
	u_created_at: string;
	u_updated_at: string;
}

function mapSession(row: SessionRow): SessionRecord {
	return {
		id: row.id,
		userId: row.user_id,
		tokenHash: row.token_hash,
		expiresAt: row.expires_at,
		createdAt: row.created_at,
	};
}

export interface InsertSessionInput {
	id: string;
	userId: string;
	tokenHash: string;
	expiresAt: string;
}

export const sessionsRepository = {
	async insert(input: InsertSessionInput): Promise<SessionRecord> {
		const db = await getDb();
		const { results } = await db
			.prepare(
				`INSERT INTO sessions (id, user_id, token_hash, expires_at)
				 VALUES (?1, ?2, ?3, ?4)
				 RETURNING id, user_id, token_hash, expires_at, created_at`,
			)
			.bind(input.id, input.userId, input.tokenHash, input.expiresAt)
			.all<SessionRow>();
		return mapSession(results[0]);
	},

	/**
	 * One round trip for the common "who is this request from" question. Expired rows are
	 * filtered in SQL so a stale session can never resolve to a user.
	 */
	async findActiveWithUser(
		tokenHash: string,
	): Promise<{ session: SessionRecord; user: UserRecord } | null> {
		const db = await getDb();
		const { results } = await db
			.prepare(
				`SELECT
					 s.id, s.user_id, s.token_hash, s.expires_at, s.created_at,
					 u.id AS u_id, u.first_name AS u_first_name, u.last_name AS u_last_name,
					 u.username AS u_username, u.email AS u_email, u.password_hash AS u_password_hash,
					 u.role AS u_role, u.created_at AS u_created_at, u.updated_at AS u_updated_at
				 FROM sessions s
				 JOIN users u ON u.id = s.user_id
				 WHERE s.token_hash = ?1 AND s.expires_at > CURRENT_TIMESTAMP
				 LIMIT 1`,
			)
			.bind(tokenHash)
			.all<SessionWithUserRow>();

		const row = results[0];
		if (!row) {
			return null;
		}

		return {
			session: mapSession(row),
			user: {
				id: row.u_id,
				firstName: row.u_first_name,
				lastName: row.u_last_name,
				username: row.u_username,
				email: row.u_email,
				passwordHash: row.u_password_hash,
				role: row.u_role === "admin" ? "admin" : "member",
				createdAt: row.u_created_at,
				updatedAt: row.u_updated_at,
			},
		};
	},

	async deleteByTokenHash(tokenHash: string): Promise<void> {
		const db = await getDb();
		await db.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(tokenHash).run();
	},

	async deleteByUserId(userId: string): Promise<void> {
		const db = await getDb();
		await db.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(userId).run();
	},

	async deleteExpired(): Promise<void> {
		const db = await getDb();
		await db.prepare("DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();
	},
};
