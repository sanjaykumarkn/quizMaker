import { z } from "zod";

import { DEFAULT_USER_ROLE, USER_ROLES } from "@/lib/types/user";

/**
 * Server-side validation rules. These run on every path into the service layer, whether the
 * caller is a REST client, a Server Action, or another service, so client-side checks are a
 * convenience rather than a control.
 */

const name = (label: string) =>
	z
		.string({ error: `${label} is required.` })
		.trim()
		.min(1, `${label} is required.`)
		.max(80, `${label} must be 80 characters or fewer.`);

export const usernameSchema = z
	.string({ error: "Username is required." })
	.trim()
	.min(3, "Username must be at least 3 characters.")
	.max(40, "Username must be 40 characters or fewer.")
	.regex(/^[a-zA-Z0-9._-]+$/, "Username may contain only letters, numbers, dots, underscores and hyphens.");

export const emailSchema = z
	.string({ error: "Email is required." })
	.trim()
	.min(1, "Email is required.")
	.max(254, "Email must be 254 characters or fewer.")
	.pipe(z.email("Enter a valid email address."))
	.transform((value) => value.toLowerCase());

/**
 * SQLite cannot add a CHECK constraint to an existing table, so this schema is the only thing
 * standing between the API and an arbitrary string in the `role` column.
 */
export const roleSchema = z.enum(USER_ROLES, {
	error: "Role must be either admin or member.",
});

export const passwordSchema = z
	.string({ error: "Password is required." })
	.min(8, "Password must be at least 8 characters.")
	.max(200, "Password must be 200 characters or fewer.");

export const createUserSchema = z.object({
	firstName: name("First name"),
	lastName: name("Last name"),
	username: usernameSchema,
	email: emailSchema,
	password: passwordSchema,
	role: roleSchema.default(DEFAULT_USER_ROLE),
});

/**
 * Registration reuses the create rules but cannot choose a role: a visitor granting themselves
 * `admin` would defeat the point of having roles at all.
 */
export const registerUserSchema = createUserSchema.omit({ role: true });

export const updateUserSchema = z
	.object({
		firstName: name("First name").optional(),
		lastName: name("Last name").optional(),
		username: usernameSchema.optional(),
		email: emailSchema.optional(),
		role: roleSchema.optional(),
	})
	.refine((value) => Object.values(value).some((field) => field !== undefined), {
		message: "Provide at least one field to update.",
	});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type RegisterUserInput = z.infer<typeof registerUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
