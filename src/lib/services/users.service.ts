import { ConflictError, NotFoundError } from "@/lib/errors";
import { usersRepository, type UpdateUserFields } from "@/lib/repositories/users.repository";
import { hashPassword } from "@/lib/security/password";
import { generateId } from "@/lib/security/tokens";
import { DEFAULT_USER_ROLE, toPublicUser, type PublicUser, type UserRecord } from "@/lib/types/user";
import { parse } from "@/lib/validation/parse";
import { createUserSchema, registerUserSchema, updateUserSchema } from "@/lib/validation/user.schemas";

/**
 * Business rules for user records. Every entry point returns `PublicUser`, so `password_hash`
 * cannot reach an API response or a rendered page even by accident.
 */

async function assertUsernameAvailable(username: string, exceptUserId?: string): Promise<void> {
	const existing = await usersRepository.findByUsername(username);
	if (existing && existing.id !== exceptUserId) {
		throw new ConflictError("DUPLICATE_USERNAME", "That username is already taken.", {
			username: ["That username is already taken."],
		});
	}
}

async function assertEmailAvailable(email: string, exceptUserId?: string): Promise<void> {
	const existing = await usersRepository.findByEmail(email);
	if (existing && existing.id !== exceptUserId) {
		throw new ConflictError("DUPLICATE_EMAIL", "That email address is already registered.", {
			email: ["That email address is already registered."],
		});
	}
}

function userNotFound(): NotFoundError {
	return new NotFoundError("USER_NOT_FOUND", "That user does not exist.");
}

/**
 * Refuses to remove the last remaining administrator. Without this, deleting or demoting one
 * account could leave a database in which nobody can reach user management at all, recoverable
 * only with direct SQL.
 */
async function assertNotLastAdmin(target: UserRecord, action: "delete" | "demote"): Promise<void> {
	if (target.role !== "admin") {
		return;
	}

	if ((await usersRepository.countAdmins()) > 1) {
		return;
	}

	throw new ConflictError(
		"LAST_ADMIN",
		action === "delete"
			? "This is the only administrator. Promote another user before deleting this one."
			: "This is the only administrator. Promote another user before changing this role.",
		{ role: ["At least one administrator must remain."] },
	);
}

export const usersService = {
	async create(input: unknown): Promise<PublicUser> {
		const data = parse(createUserSchema, input);

		await assertUsernameAvailable(data.username);
		await assertEmailAvailable(data.email);

		// The plain password lives only in this scope and is discarded once derived.
		const passwordHash = await hashPassword(data.password);

		const created = await usersRepository.insert({
			id: generateId(),
			firstName: data.firstName,
			lastName: data.lastName,
			username: data.username,
			email: data.email,
			passwordHash,
			role: data.role,
		});

		return toPublicUser(created);
	},

	/**
	 * Self-registration. Separate from `create` only because the caller may not choose a role;
	 * `registerUserSchema` has no `role` field, so one cannot be smuggled in through the body.
	 */
	async register(input: unknown): Promise<PublicUser> {
		const data = parse(registerUserSchema, input);
		return this.create({ ...data, role: DEFAULT_USER_ROLE });
	},

	async list(): Promise<PublicUser[]> {
		const users = await usersRepository.listAll();
		return users.map(toPublicUser);
	},

	async getById(id: string): Promise<PublicUser> {
		const user = await usersRepository.findById(id);
		if (!user) {
			throw userNotFound();
		}
		return toPublicUser(user);
	},

	async update(id: string, input: unknown): Promise<PublicUser> {
		const data = parse(updateUserSchema, input);

		const existing = await usersRepository.findById(id);
		if (!existing) {
			throw userNotFound();
		}

		if (data.username !== undefined) {
			await assertUsernameAvailable(data.username, id);
		}
		if (data.email !== undefined) {
			await assertEmailAvailable(data.email, id);
		}
		if (data.role !== undefined && data.role !== existing.role) {
			await assertNotLastAdmin(existing, "demote");
		}

		const fields: UpdateUserFields = {
			firstName: data.firstName,
			lastName: data.lastName,
			username: data.username,
			email: data.email,
			role: data.role,
		};

		const updated = await usersRepository.update(id, fields);
		if (!updated) {
			throw userNotFound();
		}

		return toPublicUser(updated);
	},

	/**
	 * `actingUserId` is the authorization input: a user may not delete their own account,
	 * which would leave the caller holding a session for a row that no longer exists.
	 */
	async delete(id: string, actingUserId: string): Promise<void> {
		if (id === actingUserId) {
			throw new ConflictError("CANNOT_DELETE_SELF", "You cannot delete your own account.");
		}

		const existing = await usersRepository.findById(id);
		if (!existing) {
			throw userNotFound();
		}

		await assertNotLastAdmin(existing, "delete");

		const deleted = await usersRepository.deleteById(id);
		if (!deleted) {
			throw userNotFound();
		}
	},
};
