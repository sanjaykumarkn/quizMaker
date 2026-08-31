"use client";

import { useActionState, useEffect } from "react";
import { LoaderCircleIcon } from "lucide-react";

import { deleteUserAction } from "@/app/users/actions";
import { idleUserFormState } from "@/app/users/form-state";
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
import type { PublicUser } from "@/lib/types/user";

interface DeleteUserDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user?: PublicUser;
}

export function DeleteUserDialog({ open, onOpenChange, user }: DeleteUserDialogProps) {
	const [state, formAction, isPending] = useActionState(deleteUserAction, idleUserFormState);

	useEffect(() => {
		if (state.status === "success") {
			onOpenChange(false);
		}
	}, [state, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete user</DialogTitle>
					<DialogDescription>
						{user
							? `${user.firstName} ${user.lastName} (@${user.username}) will be removed permanently, along with any active sessions.`
							: "This user will be removed permanently."}
					</DialogDescription>
				</DialogHeader>

				<form key={user?.id} action={formAction} className="flex flex-col gap-4">
					<input type="hidden" name="id" value={user?.id ?? ""} />

					{state.status === "error" && state.message && (
						<div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{state.message}
						</div>
					)}

					<DialogFooter>
						<DialogClose render={<Button type="button" variant="outline" disabled={isPending} />}>
							Cancel
						</DialogClose>
						<Button type="submit" variant="destructive" disabled={isPending} aria-busy={isPending}>
							{isPending && <LoaderCircleIcon className="animate-spin" />}
							Delete user
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
