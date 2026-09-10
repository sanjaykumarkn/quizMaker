import type { ZodType } from "zod";

import { ValidationError, type FieldErrors } from "@/lib/errors";

/**
 * Runs a schema and converts a Zod failure into the domain `ValidationError` so that callers
 * never have to know validation is implemented with Zod.
 */
export function parse<T>(schema: ZodType<T>, input: unknown): T {
	const result = schema.safeParse(input);

	if (result.success) {
		return result.data;
	}

	const fields: FieldErrors = {};
	for (const issue of result.error.issues) {
		const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_form";
		(fields[key] ??= []).push(issue.message);
	}

	const firstMessage = result.error.issues[0]?.message ?? "The submitted data is invalid.";
	throw new ValidationError(firstMessage, fields);
}
