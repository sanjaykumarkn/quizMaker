"use client";

import { useActionState, useEffect, useState } from "react";
import { LoaderCircleIcon } from "lucide-react";

import { createUserAction, updateUserAction } from "@/app/users/actions";
import { idleUserFormState, type UserFormState } from "@/app/users/form-state";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { FieldErrors } from "@/lib/errors";
import { DEFAULT_USER_ROLE, type PublicUser, type UserRole } from "@/lib/types/user";

interface UserFormDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	/** Absent for a create, present for an edit. Editing never touches the password. */
	user?: PublicUser;
}

function messagesFor(fields: FieldErrors | undefined, name: string) {
	return fields?.[name]?.map((message) => ({ message }));
}

export function UserFormDialog({ open, onOpenChange, user }: UserFormDialogProps) {
	const isEdit = Boolean(user);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{isEdit ? "Edit user" : "Add user"}</DialogTitle>
					<DialogDescription>
						{isEdit
							? "Update this user's details. Leave the username and email unique."
							: "Create a new user. The password is hashed before it is stored."}
					</DialogDescription>
				</DialogHeader>

				{/*
				 * Keyed by user so the whole form, including its action state and role selector,
				 * is rebuilt when a different row is opened. This is what makes the initial
				 * values correct without synchronising anything in an effect.
				 */}
				<UserForm key={user?.id ?? "new"} user={user} onDone={() => onOpenChange(false)} />
			</DialogContent>
		</Dialog>
	);
}

function UserForm({ user, onDone }: { user?: PublicUser; onDone: () => void }) {
	const isEdit = Boolean(user);
	const [state, formAction, isPending] = useActionState<UserFormState, FormData>(
		isEdit ? updateUserAction : createUserAction,
		idleUserFormState,
	);
	const [role, setRole] = useState<UserRole>(user?.role ?? DEFAULT_USER_ROLE);

	useEffect(() => {
		if (state.status === "success") {
			onDone();
		}
	}, [state, onDone]);

	const formErrors = messagesFor(state.fields, "_form");
	const showBanner = state.status === "error" && Boolean(state.message) && !state.fields;

	return (
		<form action={formAction} noValidate className="flex flex-col gap-4">
			{isEdit && <input type="hidden" name="id" value={user?.id} />}

			{(showBanner || formErrors) && (
				<div
					role="alert"
					className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					{formErrors?.[0]?.message ?? state.message}
				</div>
			)}

			<FieldGroup>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field data-invalid={Boolean(messagesFor(state.fields, "firstName"))}>
						<FieldLabel htmlFor="firstName">First name</FieldLabel>
						<Input
							id="firstName"
							name="firstName"
							defaultValue={user?.firstName}
							required
							disabled={isPending}
							aria-invalid={Boolean(messagesFor(state.fields, "firstName"))}
						/>
						<FieldError errors={messagesFor(state.fields, "firstName")} />
					</Field>

					<Field data-invalid={Boolean(messagesFor(state.fields, "lastName"))}>
						<FieldLabel htmlFor="lastName">Last name</FieldLabel>
						<Input
							id="lastName"
							name="lastName"
							defaultValue={user?.lastName}
							required
							disabled={isPending}
							aria-invalid={Boolean(messagesFor(state.fields, "lastName"))}
						/>
						<FieldError errors={messagesFor(state.fields, "lastName")} />
					</Field>
				</div>

				<Field data-invalid={Boolean(messagesFor(state.fields, "username"))}>
					<FieldLabel htmlFor="username">Username</FieldLabel>
					<Input
						id="username"
						name="username"
						autoCapitalize="none"
						spellCheck={false}
						defaultValue={user?.username}
						required
						disabled={isPending}
						aria-invalid={Boolean(messagesFor(state.fields, "username"))}
					/>
					<FieldError errors={messagesFor(state.fields, "username")} />
				</Field>

				<Field data-invalid={Boolean(messagesFor(state.fields, "email"))}>
					<FieldLabel htmlFor="email">Email</FieldLabel>
					<Input
						id="email"
						name="email"
						type="email"
						autoCapitalize="none"
						spellCheck={false}
						defaultValue={user?.email}
						required
						disabled={isPending}
						aria-invalid={Boolean(messagesFor(state.fields, "email"))}
					/>
					<FieldError errors={messagesFor(state.fields, "email")} />
				</Field>

				<Field data-invalid={Boolean(messagesFor(state.fields, "role"))}>
					<FieldLabel htmlFor="role">Role</FieldLabel>
					{/* A hidden input carries the value so it reaches FormData regardless of how the
							    Base UI select handles form integration. */}
					<input type="hidden" name="role" value={role} />
					<Select value={role} onValueChange={(value) => setRole(value as UserRole)}>
						<SelectTrigger id="role" className="w-full" disabled={isPending}>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="member">member</SelectItem>
							<SelectItem value="admin">admin</SelectItem>
						</SelectContent>
					</Select>
					<FieldDescription>
						Administrators can manage every account. Members can only sign in.
					</FieldDescription>
					<FieldError errors={messagesFor(state.fields, "role")} />
				</Field>

				{!isEdit && (
					<Field data-invalid={Boolean(messagesFor(state.fields, "password"))}>
						<FieldLabel htmlFor="password">Password</FieldLabel>
						<Input
							id="password"
							name="password"
							type="password"
							autoComplete="new-password"
							required
							disabled={isPending}
							aria-invalid={Boolean(messagesFor(state.fields, "password"))}
						/>
						<FieldError errors={messagesFor(state.fields, "password")} />
					</Field>
				)}
			</FieldGroup>

			<DialogFooter>
				<DialogClose render={<Button type="button" variant="outline" disabled={isPending} />}>
					Cancel
				</DialogClose>
				<Button type="submit" disabled={isPending} aria-busy={isPending}>
					{isPending && <LoaderCircleIcon className="animate-spin" />}
					{isEdit ? "Save changes" : "Create user"}
				</Button>
			</DialogFooter>
		</form>
	);
}
