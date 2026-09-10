"use client";

import { useActionState, useEffect } from "react";
import { LoaderCircleIcon } from "lucide-react";

import { deleteMcqAction } from "@/app/mcq/actions";
import { idleMcqFormState } from "@/app/mcq/form-state";
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
import type { McqSummary } from "@/lib/types/mcq";

interface DeleteMcqDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mcq?: McqSummary;
}

export function DeleteMcqDialog({ open, onOpenChange, mcq }: DeleteMcqDialogProps) {
	const [state, formAction, isPending] = useActionState(deleteMcqAction, idleMcqFormState);

	useEffect(() => {
		if (state.status === "success") {
			onOpenChange(false);
		}
	}, [state, onOpenChange]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Delete question</DialogTitle>
					{/*
					 * Spells out that the attempt history goes too. Editing a question keeps its
					 * attempts, so it would be easy to assume deleting one does as well.
					 */}
					<DialogDescription>
						{mcq
							? `"${mcq.name}" and its ${mcq.choiceCount} choices will be removed permanently, and any attempts recorded against it are removed with it.`
							: "This question, its choices and any attempts recorded against it will be removed permanently."}
					</DialogDescription>
				</DialogHeader>

				<form key={mcq?.id} action={formAction} className="flex flex-col gap-4">
					<input type="hidden" name="id" value={mcq?.id ?? ""} />

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
							Delete question
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
