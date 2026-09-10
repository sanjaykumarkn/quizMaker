"use client";

import { useActionState, useState } from "react";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";

import { loginAction, type LoginFormState } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { FieldErrors } from "@/lib/errors";

const initialState: LoginFormState = {};

/**
 * Client-side checks that run before anything is sent. They mirror the server rules in
 * `loginSchema`; the server remains the authority, this only saves a round trip.
 */
function validate(formData: FormData): FieldErrors | null {
	const username = String(formData.get("username") ?? "").trim();
	const password = String(formData.get("password") ?? "");
	const fields: FieldErrors = {};

	if (username.length === 0) {
		fields.username = ["Username is required."];
	} else if (username.length < 3) {
		fields.username = ["Username must be at least 3 characters."];
	}

	if (password.length === 0) {
		fields.password = ["Password is required."];
	}

	return Object.keys(fields).length > 0 ? fields : null;
}

function messagesFor(fields: FieldErrors | undefined, name: string) {
	return fields?.[name]?.map((message) => ({ message }));
}

export function LoginForm() {
	// Controlled so the username survives a failed attempt: React resets uncontrolled fields
	// in a form driven by an action.
	const [username, setUsername] = useState("");
	const [state, formAction, isPending] = useActionState(
		async (previousState: LoginFormState, formData: FormData) => {
			const clientErrors = validate(formData);
			if (clientErrors) {
				return { fields: clientErrors };
			}
			return loginAction(previousState, formData);
		},
		initialState,
	);

	const usernameErrors = messagesFor(state.fields, "username");
	const passwordErrors = messagesFor(state.fields, "password");
	// A message with no field attached is the generic credential failure.
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
				<Field data-invalid={Boolean(usernameErrors)}>
					<FieldLabel htmlFor="username">Username</FieldLabel>
					<Input
						id="username"
						name="username"
						type="text"
						autoComplete="username"
						autoCapitalize="none"
						spellCheck={false}
						required
						value={username}
						onChange={(event) => setUsername(event.target.value)}
						aria-invalid={Boolean(usernameErrors)}
						disabled={isPending}
					/>
					<FieldError errors={usernameErrors} />
				</Field>

				<Field data-invalid={Boolean(passwordErrors)}>
					<FieldLabel htmlFor="password">Password</FieldLabel>
					<Input
						id="password"
						name="password"
						type="password"
						autoComplete="current-password"
						required
						aria-invalid={Boolean(passwordErrors)}
						disabled={isPending}
					/>
					<FieldError errors={passwordErrors} />
				</Field>
			</FieldGroup>

			{/* Disabled while pending, so a second click cannot issue a second login. */}
			<Button type="submit" size="lg" disabled={isPending} aria-busy={isPending}>
				{isPending && <LoaderCircleIcon className="animate-spin" />}
				{isPending ? "Signing in…" : "Sign in"}
			</Button>
		</form>
	);
}
