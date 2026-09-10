"use client";

import { useActionState } from "react";
import { LogOutIcon } from "lucide-react";

import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";

export function SignOutButton() {
	const [, formAction, isPending] = useActionState(async () => {
		await logoutAction();
	}, undefined);

	return (
		<form action={formAction}>
			<Button type="submit" variant="outline" disabled={isPending}>
				<LogOutIcon />
				{isPending ? "Signing out…" : "Sign out"}
			</Button>
		</form>
	);
}
