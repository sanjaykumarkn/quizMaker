import { z } from "zod";

/**
 * Login validation is intentionally looser than user creation: it only checks that something
 * was supplied. Applying the username or password format rules here would let an attacker
 * infer which values could possibly exist.
 */
export const loginSchema = z.object({
	username: z
		.string({ error: "Username is required." })
		.trim()
		.min(1, "Username is required."),
	password: z
		.string({ error: "Password is required." })
		.min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof loginSchema>;
