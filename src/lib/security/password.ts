/**
 * PBKDF2-SHA256 password hashing on the WebCrypto API available in the Workers runtime.
 * bcrypt and argon2 need native modules that Workers cannot load.
 *
 * Stored format, self-describing so the parameters can be raised without a migration:
 *   pbkdf2$sha256$<iterations>$<base64 salt>$<base64 derived key>
 */

const ALGORITHM = "pbkdf2";
const DIGEST = "sha256";
/**
 * The Workers runtime rejects PBKDF2 above 100k iterations, so this is a hard ceiling rather
 * than a tuning choice. Node has no such limit, which is why `next dev` accepts a higher value
 * and only the deployed Worker fails. Below current OWASP guidance; see the PRD.
 */
const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
		"deriveBits",
	]);

	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
		key,
		KEY_BITS,
	);

	return new Uint8Array(bits);
}

/** Length-independent, non-short-circuiting comparison. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.length !== b.length) {
		return false;
	}
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) {
		diff |= a[i] ^ b[i];
	}
	return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	const derived = await derive(password, salt, ITERATIONS);
	return [ALGORITHM, DIGEST, ITERATIONS, toBase64(salt), toBase64(derived)].join("$");
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
	const parts = storedHash.split("$");
	if (parts.length !== 5) {
		return false;
	}

	const [algorithm, digest, iterationsRaw, saltRaw, keyRaw] = parts;
	const iterations = Number.parseInt(iterationsRaw, 10);
	if (algorithm !== ALGORITHM || digest !== DIGEST || !Number.isFinite(iterations) || iterations <= 0) {
		return false;
	}

	try {
		const derived = await derive(password, fromBase64(saltRaw), iterations);
		return timingSafeEqual(derived, fromBase64(keyRaw));
	} catch {
		return false;
	}
}

/**
 * Burns roughly the same time as a real verification. Called when no user matches, so that
 * response timing does not reveal whether an account exists.
 */
export async function simulatePasswordVerification(): Promise<void> {
	const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
	await derive("timing-equalizer", salt, ITERATIONS);
}
