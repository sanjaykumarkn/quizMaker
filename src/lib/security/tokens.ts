const TOKEN_BYTES = 32;

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateId(): string {
	return crypto.randomUUID();
}

/** The raw value handed to the browser in the session cookie. Never stored. */
export function generateSessionToken(): string {
	return toHex(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** What actually goes in the database, so a leaked row cannot be replayed as a cookie. */
export async function hashToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return toHex(new Uint8Array(digest));
}
