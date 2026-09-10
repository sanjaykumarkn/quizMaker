"use client";

import { useActionState, useState } from "react";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

import { signupAction } from "@/app/signup/actions";
import { idleSignupFormState, type SignupFormState } from "@/app/signup/form-state";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/errors";

/**
 * Mirrors the server rules in `createUserSchema`. The server still validates everything;
 * this only avoids a round trip for obvious mistakes.
 */
function validate(values: Record<string, string>): FieldErrors | null {
	const fields: FieldErrors = {};

	if (values.firstName.trim().length === 0) {
		fields.firstName = ["First name is required."];
	}
	if (values.lastName.trim().length === 0) {
		fields.lastName = ["Last name is required."];
	}

	const username = values.username.trim();
	if (username.length === 0) {
		fields.username = ["Username is required."];
	} else if (username.length < 3) {
		fields.username = ["Username must be at least 3 characters."];
	} else if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
		fields.username = ["Username may contain only letters, numbers, dots, underscores and hyphens."];
	}

	const email = values.email.trim();
	if (email.length === 0) {
		fields.email = ["Email is required."];
	} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		fields.email = ["Enter a valid email address."];
	}

	if (values.password.length === 0) {
		fields.password = ["Password is required."];
	} else if (values.password.length < 8) {
		fields.password = ["Password must be at least 8 characters."];
	} else if (values.confirmPassword !== values.password) {
		fields.confirmPassword = ["Passwords do not match."];
	}

	return Object.keys(fields).length > 0 ? fields : null;
}

function messagesFor(fields: FieldErrors | undefined, name: string) {
	return fields?.[name]?.map((message) => ({ message }));
}

export function SignupForm() {
	// Controlled so nothing is lost when React resets the form after a failed submission.
	const [values, setValues] = useState({
		firstName: "",
		lastName: "",
		username: "",
		email: "",
		password: "",
		confirmPassword: "",
	});

	const [state, formAction, isPending] = useActionState(
		async (previousState: SignupFormState, formData: FormData) => {
			const clientErrors = validate(values);
			if (clientErrors) {
				return { fields: clientErrors };
			}
			return signupAction(previousState, formData);
		},
		idleSignupFormState,
	);

	const set = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) =>
		setValues((current) => ({ ...current, [key]: event.target.value }));

	const showBanner = Boolean(state.message) && !state.fields;

	return (
		<form action={formAction} noValidate className="flex flex-col gap-5">
			{showBanner && (
				<div
					role="alert"
					className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					<AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
					<span>{state.message}</span>
				</div>
			)}

			<FieldGroup>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field data-invalid={Boolean(messagesFor(state.fields, "firstName"))}>
						<FieldLabel htmlFor="firstName">First name</FieldLabel>
						<Input
							id="firstName"
							name="firstName"
							autoComplete="given-name"
							value={values.firstName}
							onChange={set("firstName")}
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
							autoComplete="family-name"
							value={values.lastName}
							onChange={set("lastName")}
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
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						value={values.username}
						onChange={set("username")}
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
						autoComplete="email"
						autoCapitalize="none"
						spellCheck={false}
						value={values.email}
						onChange={set("email")}
						disabled={isPending}
						aria-invalid={Boolean(messagesFor(state.fields, "email"))}
					/>
					<FieldError errors={messagesFor(state.fields, "email")} />
				</Field>

				<Field data-invalid={Boolean(messagesFor(state.fields, "password"))}>
					<FieldLabel htmlFor="password">Password</FieldLabel>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete="new-password"
						value={values.password}
						onChange={set("password")}
						disabled={isPending}
						aria-invalid={Boolean(messagesFor(state.fields, "password"))}
					/>
					<FieldError errors={messagesFor(state.fields, "password")} />
				</Field>

				<Field data-invalid={Boolean(messagesFor(state.fields, "confirmPassword"))}>
					<FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
					{/* Confirmation is a client-side concern only; the server never receives it. */}
					<Input
						id="confirmPassword"
						type="password"
						autoComplete="new-password"
						value={values.confirmPassword}
						onChange={set("confirmPassword")}
						disabled={isPending}
						aria-invalid={Boolean(messagesFor(state.fields, "confirmPassword"))}
					/>
					<FieldError errors={messagesFor(state.fields, "confirmPassword")} />
				</Field>
			</FieldGroup>

			<Button type="submit" size="lg" disabled={isPending} aria-busy={isPending}>
				{isPending && <LoaderCircleIcon className="animate-spin" />}
				{isPending ? "Creating account…" : "Create account"}
			</Button>
		</form>
	);
}
