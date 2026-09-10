"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { AlertCircleIcon, LoaderCircleIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { createMcqAction, updateMcqAction } from "@/app/mcq/actions";
import {
	CHOICE_BODY_FIELD,
	CHOICE_KEY_FIELD,
	CORRECT_CHOICE_FIELD,
} from "@/app/mcq/form-fields";
import { idleMcqFormState, type McqFormState } from "@/app/mcq/form-state";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Field,
	FieldDescription,
	FieldError,
	FieldGroup,
	FieldLabel,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import type { FieldErrors } from "@/lib/errors";
import { MAX_CHOICES, MIN_CHOICES, type Mcq } from "@/lib/types/mcq";
import { cn } from "@/lib/utils";

interface McqFormProps {
	/** Absent for a create, present for an edit. */
	mcq?: Mcq;
}

/**
 * A row's key is what identifies it, not its index. Removing the first row must not move the
 * correct answer onto a different choice, which is exactly what index-based tracking would do.
 */
interface ChoiceRow {
	key: string;
	body: string;
}

function initialRows(mcq?: Mcq): ChoiceRow[] {
	if (mcq) {
		return mcq.choices.map((choice) => ({ key: choice.id, body: choice.body }));
	}

	// A new question opens at the minimum. Keys are deterministic rather than random so the
	// server-rendered markup and the hydrated markup agree.
	return Array.from({ length: MIN_CHOICES }, (_, index) => ({ key: `new-${index}`, body: "" }));
}

function messagesFor(fields: FieldErrors | undefined, name: string) {
	return fields?.[name]?.map((message) => ({ message }));
}

export function McqForm({ mcq }: McqFormProps) {
	const isEdit = Boolean(mcq);

	const [rows, setRows] = useState<ChoiceRow[]>(() => initialRows(mcq));
	const [correctKey, setCorrectKey] = useState<string>(
		() => mcq?.choices.find((choice) => choice.isCorrect)?.id ?? "",
	);
	const nextRowNumber = useRef(rows.length);

	/**
	 * Mirrors the server rules in `createMcqSchema`. The server stays the authority; this only
	 * saves a round trip, and keeps what the author typed on screen.
	 */
	const [state, formAction, isPending] = useActionState<McqFormState, FormData>(
		async (previousState, formData) => {
			const fields: FieldErrors = {};

			if (formData.get("name")?.toString().trim().length === 0) {
				fields.name = ["Name is required."];
			}
			if (formData.get("description")?.toString().trim().length === 0) {
				fields.description = ["Description is required."];
			}
			rows.forEach((row, index) => {
				if (row.body.trim().length === 0) {
					fields[`choices.${index}.body`] = ["Choice text is required."];
				}
			});
			if (correctKey.length === 0) {
				fields.choices = ["Mark one choice as the correct answer."];
			}

			if (Object.keys(fields).length > 0) {
				return { status: "error", fields };
			}

			return isEdit ? updateMcqAction(previousState, formData) : createMcqAction(previousState, formData);
		},
		idleMcqFormState,
	);

	function addRow() {
		setRows((current) =>
			current.length >= MAX_CHOICES
				? current
				: [...current, { key: `new-${nextRowNumber.current++}`, body: "" }],
		);
	}

	function removeRow(key: string) {
		setRows((current) => (current.length <= MIN_CHOICES ? current : current.filter((row) => row.key !== key)));
		// Removing the row that held the answer leaves the question with none, which is a
		// deliberate prompt to choose again rather than a silent reassignment.
		if (key === correctKey) {
			setCorrectKey("");
		}
	}

	function setBody(key: string, body: string) {
		setRows((current) => current.map((row) => (row.key === key ? { ...row, body } : row)));
	}

	const nameErrors = messagesFor(state.fields, "name");
	const descriptionErrors = messagesFor(state.fields, "description");
	const choicesErrors = messagesFor(state.fields, "choices");
	const formErrors = messagesFor(state.fields, "_form");
	const showBanner = state.status === "error" && Boolean(state.message) && !state.fields;

	return (
		<form action={formAction} noValidate className="flex flex-col gap-6">
			{isEdit && <input type="hidden" name="id" value={mcq?.id} />}

			{(showBanner || formErrors) && (
				<div
					role="alert"
					className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
				>
					<AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
					<span>{formErrors?.[0]?.message ?? state.message}</span>
				</div>
			)}

			<FieldGroup>
				<Field data-invalid={Boolean(nameErrors)}>
					<FieldLabel htmlFor="name">Name</FieldLabel>
					<Input
						id="name"
						name="name"
						defaultValue={mcq?.name}
						maxLength={120}
						required
						disabled={isPending}
						aria-invalid={Boolean(nameErrors)}
					/>
					<FieldDescription>A short label for this question, shown in the list.</FieldDescription>
					<FieldError errors={nameErrors} />
				</Field>

				<Field data-invalid={Boolean(descriptionErrors)}>
					<FieldLabel htmlFor="description">Description</FieldLabel>
					<Textarea
						id="description"
						name="description"
						defaultValue={mcq?.description}
						maxLength={500}
						rows={3}
						required
						disabled={isPending}
						aria-invalid={Boolean(descriptionErrors)}
					/>
					<FieldDescription>The question itself, as the person answering will read it.</FieldDescription>
					<FieldError errors={descriptionErrors} />
				</Field>
			</FieldGroup>

			<FieldSet data-invalid={Boolean(choicesErrors)}>
				<FieldLegend variant="label">Choices</FieldLegend>
				<FieldDescription>
					Between {MIN_CHOICES} and {MAX_CHOICES} choices. Select the radio button next to the
					correct answer.
				</FieldDescription>

				{/*
				 * One radio group across every row, so marking a second choice correct unmarks the
				 * first. Two correct answers is not a state this form can reach.
				 *
				 * The value travels in a hidden input rather than through the group's own `name`,
				 * matching how the users dialog carries its Select value: it reaches FormData
				 * regardless of how the Base UI control handles form integration.
				 */}
				<input type="hidden" name={CORRECT_CHOICE_FIELD} value={correctKey} />
				<RadioGroup
					value={correctKey}
					onValueChange={(value) => setCorrectKey(String(value))}
					disabled={isPending}
					className="gap-3"
				>
					{rows.map((row, index) => {
						const bodyErrors = messagesFor(state.fields, `choices.${index}.body`);
						return (
							// A row is two stacked pieces: the controls, and the message belonging to
							// this choice. Without the second, a rejected row would show a red border
							// and no reason for it.
							<div key={row.key} className="flex flex-col gap-1">
								<Field orientation="horizontal" data-invalid={Boolean(bodyErrors)}>
									<RadioGroupItem
										value={row.key}
										aria-label={`Mark choice ${index + 1} as the correct answer`}
									/>
									<input type="hidden" name={CHOICE_KEY_FIELD} value={row.key} />
									<Input
										name={CHOICE_BODY_FIELD}
										value={row.body}
										onChange={(event) => setBody(row.key, event.target.value)}
										placeholder={`Choice ${index + 1}`}
										maxLength={300}
										disabled={isPending}
										aria-invalid={Boolean(bodyErrors)}
										aria-label={`Choice ${index + 1}`}
									/>
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										aria-label={`Remove choice ${index + 1}`}
										// Disabled at the minimum, so an invalid choice count is not a
										// state the form can express.
										disabled={isPending || rows.length <= MIN_CHOICES}
										onClick={() => removeRow(row.key)}
									>
										<Trash2Icon className="text-destructive" />
									</Button>
								</Field>
								<FieldError errors={bodyErrors} className="pl-6" />
							</div>
						);
					})}
				</RadioGroup>

				<FieldError errors={choicesErrors} />

				<div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={addRow}
						disabled={isPending || rows.length >= MAX_CHOICES}
					>
						<PlusIcon />
						Add choice
					</Button>
					{rows.length >= MAX_CHOICES && (
						<span className="ml-3 text-sm text-muted-foreground">
							A question can have at most {MAX_CHOICES} choices.
						</span>
					)}
				</div>
			</FieldSet>

			<div className="flex items-center gap-2">
				{/* Locked while pending, so a double click creates one question rather than two. */}
				<Button type="submit" disabled={isPending} aria-busy={isPending}>
					{isPending && <LoaderCircleIcon className="animate-spin" />}
					{isPending ? "Saving…" : "Save"}
				</Button>
				{/*
				 * Cancel navigates, so it is a Link styled as a button rather than a Button that
				 * renders one. While the save is in flight it is made inert rather than merely
				 * greyed out, since an anchor has no `disabled`.
				 */}
				<Link
					href="/mcq"
					aria-disabled={isPending}
					className={cn(
						buttonVariants({ variant: "outline" }),
						isPending && "pointer-events-none opacity-50",
					)}
				>
					Cancel
				</Link>
			</div>
		</form>
	);
}
