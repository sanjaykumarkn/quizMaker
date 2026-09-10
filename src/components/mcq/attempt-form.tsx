"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CircleCheckIcon, CircleXIcon, LoaderCircleIcon, RotateCcwIcon } from "lucide-react";

import { submitAttemptAction } from "@/app/mcq/actions";
import { idleAttemptFormState, type AttemptFormState } from "@/app/mcq/form-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { McqForAttempt } from "@/lib/types/mcq";
import { cn } from "@/lib/utils";

interface AttemptFormProps {
	mcq: McqForAttempt;
	/**
	 * Supplied only for an administrator, for whom preview is a proofreading tool. A member's
	 * page passes nothing, and `McqForAttempt` has no way to carry the answer on its own.
	 */
	correctChoiceId?: string | null;
}

/**
 * Remounting on retry is what resets `useActionState`; there is no imperative way to clear it.
 * This is the same keying trick the users dialog uses to rebuild a form for a different row.
 */
export function AttemptForm({ mcq, correctChoiceId }: AttemptFormProps) {
	const [round, setRound] = useState(0);

	return (
		<AttemptRound
			key={round}
			mcq={mcq}
			correctChoiceId={correctChoiceId}
			onRetry={() => setRound((current) => current + 1)}
		/>
	);
}

function AttemptRound({
	mcq,
	correctChoiceId,
	onRetry,
}: AttemptFormProps & { onRetry: () => void }) {
	const [choiceId, setChoiceId] = useState("");

	const [state, formAction, isPending] = useActionState<AttemptFormState, FormData>(
		async (previousState, formData) => {
			// Mirrors `recordAttemptSchema`. Submitting nothing is caught here, so no request is
			// issued for an answer that cannot be graded.
			if (String(formData.get("choiceId") ?? "").length === 0) {
				return { status: "error", fields: { choiceId: ["Select an answer."] } };
			}
			return submitAttemptAction(previousState, formData);
		},
		idleAttemptFormState,
	);

	const outcome = state.status === "answered" ? state.outcome : undefined;
	const answered = Boolean(outcome);
	const correctBody = outcome
		? mcq.choices.find((choice) => choice.id === outcome.correctChoiceId)?.body
		: undefined;
	const choiceErrors = state.fields?.choiceId?.map((message) => ({ message }));

	return (
		<form action={formAction} noValidate className="flex flex-col gap-6">
			<input type="hidden" name="mcqId" value={mcq.id} />
			<input type="hidden" name="choiceId" value={choiceId} />

			{state.status === "error" && state.message && (
				<div role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
					{state.message}
				</div>
			)}

			<Field data-invalid={Boolean(choiceErrors)}>
				<RadioGroup
					value={choiceId}
					onValueChange={(value) => setChoiceId(String(value))}
					disabled={isPending || answered}
					className="gap-2"
				>
					{mcq.choices.map((choice) => (
						<FieldLabel key={choice.id} htmlFor={`choice-${choice.id}`}>
							<Field orientation="horizontal">
								<RadioGroupItem id={`choice-${choice.id}`} value={choice.id} />
								<span className="flex-1">{choice.body}</span>
								{/* Only ever rendered for an admin; a member's page has no answer to mark. */}
								{correctChoiceId === choice.id && <Badge variant="secondary">correct answer</Badge>}
							</Field>
						</FieldLabel>
					))}
				</RadioGroup>
				<FieldError errors={choiceErrors} />
			</Field>

			{outcome ? (
				<div className="flex flex-col gap-4">
					<div
						role="status"
						className={
							outcome.isCorrect
								? "flex items-start gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm ring-1 ring-primary/20"
								: "flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
						}
					>
						{outcome.isCorrect ? (
							<CircleCheckIcon className="mt-0.5 size-4 shrink-0" />
						) : (
							<CircleXIcon className="mt-0.5 size-4 shrink-0" />
						)}
						<span>
							{outcome.isCorrect ? (
								<>
									Correct. <span className="font-medium">{outcome.selectedText}</span> is the right
									answer.
								</>
							) : (
								<>
									Incorrect. You chose{" "}
									<span className="font-medium">{outcome.selectedText}</span>
									{correctBody ? (
										<>
											; the correct answer is <span className="font-medium">{correctBody}</span>.
										</>
									) : (
										"."
									)}
								</>
							)}
						</span>
					</div>

					<div className="flex items-center gap-2">
						<Button type="button" variant="outline" onClick={onRetry}>
							<RotateCcwIcon />
							Try again
						</Button>
						<Link href="/mcq" className={cn(buttonVariants({ variant: "ghost" }))}>
							Back to questions
						</Link>
					</div>
				</div>
			) : (
				<div className="flex items-center gap-2">
					<Button type="submit" disabled={isPending} aria-busy={isPending}>
						{isPending && <LoaderCircleIcon className="animate-spin" />}
						{isPending ? "Submitting…" : "Submit answer"}
					</Button>
					<Link
						href="/mcq"
						aria-disabled={isPending}
						className={cn(
							buttonVariants({ variant: "outline" }),
							isPending && "pointer-events-none opacity-50",
						)}
					>
						Back to questions
					</Link>
				</div>
			)}
		</form>
	);
}
