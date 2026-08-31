"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/session";
import { AppError, type FieldErrors } from "@/lib/errors";
import { usersService } from "@/lib/services/users.service";
import type { UserFormState } from "@/app/users/form-state";

/**
 * Server Actions for user management. Authorization happens here, at the entry point, then
 * all rules are delegated to `usersService` so the REST API and the UI cannot diverge.
 *
 * Only async functions may be exported from a `"use server"` module; shared values belong in
 * `form-state.ts`.
 */

function toErrorState(error: unknown): UserFormState {
	if (error instanceof AppError) {
		return {
			status: "error",
			message: error.message,
			fields: "fields" in error ? (error.fields as FieldErrors) : undefined,
		};
	}

	console.error("Unhandled user management failure", error);
	return { status: "error", message: "Something went wrong. Please try again." };
}

function text(formData: FormData, key: string): string {
	return String(formData.get(key) ?? "");
}

export async function createUserAction(
	_previousState: UserFormState,
	formData: FormData,
): Promise<UserFormState> {
	try {
		await requireAdmin();
		await usersService.create({
			firstName: text(formData, "firstName"),
			lastName: text(formData, "lastName"),
			username: text(formData, "username"),
			email: text(formData, "email"),
			password: text(formData, "password"),
			role: text(formData, "role"),
		});
	} catch (error) {
		return toErrorState(error);
	}

	revalidatePath("/users");
	return { status: "success", message: "User created." };
}

export async function updateUserAction(
	_previousState: UserFormState,
	formData: FormData,
): Promise<UserFormState> {
	try {
		await requireAdmin();
		await usersService.update(text(formData, "id"), {
			firstName: text(formData, "firstName"),
			lastName: text(formData, "lastName"),
			username: text(formData, "username"),
			email: text(formData, "email"),
			role: text(formData, "role"),
		});
	} catch (error) {
		return toErrorState(error);
	}

	revalidatePath("/users");
	return { status: "success", message: "User updated." };
}

export async function deleteUserAction(
	_previousState: UserFormState,
	formData: FormData,
): Promise<UserFormState> {
	try {
		const actingUser = await requireAdmin();
		await usersService.delete(text(formData, "id"), actingUser.id);
	} catch (error) {
		return toErrorState(error);
	}

	revalidatePath("/users");
	return { status: "success", message: "User deleted." };
}
