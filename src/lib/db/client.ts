import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * The single point of access to D1. Only repositories may import this module; nothing above
 * the repository layer should know which database backs the application.
 */
export async function getDb(): Promise<D1Database> {
	const { env } = await getCloudflareContext({ async: true });
	const db = env.DB;

	if (!db) {
		throw new Error(
			'D1 binding "DB" is not available. Check the d1_databases block in wrangler.jsonc and run `npm run cf-typegen`.',
		);
	}

	return db;
}
