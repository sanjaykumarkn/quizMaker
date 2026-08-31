"use client";

import { useActionState, useState } from "react";
import { CheckCircle2Icon, LoaderCircleIcon } from "lucide-react";

import { forgotPasswordAction } from "@/app/forgot-password/actions";
import { idleForgotPasswordFormState } from "@/app/forgot-password/form-state";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function ForgotPasswordForm() {
	const [account, setAccount] = useState("");
	const [state, formAction, isPending] = useActionState(
		forgotPasswordAction,
		idleForgotPasswordFormState,
	);

	if (state.status === "submitted") {
		return (
			<div
				role="status"
				className="flex items-start gap-2 rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground"
			>
				<CheckCircle2Icon className="mt-0.5 size-4 shrink-0 text-foreground" />
				<span>{state.message}</span>
			</div>
		);
	}

	const errors = state.fields?.account?.map((message) => ({ message }));

	return (
		<form action={formAction} noValidate className="flex flex-col gap-5">
			<Field data-invalid={Boolean(errors)}>
				<FieldLabel htmlFor="account">Username or email</FieldLabel>
				<Input
					id="account"
					name="account"
					autoComplete="username"
					autoCapitalize="none"
					spellCheck={false}
					value={account}
					onChange={(event) => setAccount(event.target.value)}
					disabled={isPending}
					aria-invalid={Boolean(errors)}
				/>
				<FieldDescription>Tell us which account you cannot get into.</FieldDescription>
				<FieldError errors={errors} />
			</Field>

			<Button type="submit" size="lg" disabled={isPending} aria-busy={isPending}>
				{isPending && <LoaderCircleIcon className="animate-spin" />}
				{isPending ? "Submitting…" : "Continue"}
			</Button>
		</form>
	);
}
