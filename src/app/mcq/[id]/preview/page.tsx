import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { AttemptForm } from "@/components/mcq/attempt-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { mcqService } from "@/lib/services/mcq.service";
import { toAttemptView, type McqForAttempt } from "@/lib/types/mcq";
import { isAdmin } from "@/lib/types/user";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Preview question · quizMaker",
};

interface PreviewMcqPageProps {
	params: Promise<{ id: string }>;
}

/**
 * One page, two audiences. "Preview" means proofreading to the author and means taking the
 * test to a learner, so the page adapts rather than pretending they are the same.
 *
 * The important half is what a member does *not* receive. Their question comes from
 * `getForAttempt`, whose return type has no `isCorrect` field, so the answer key is absent
 * from the rendered HTML and not merely hidden by CSS.
 */
export default async function PreviewMcqPage({ params }: PreviewMcqPageProps) {
	const currentUser = await getCurrentUser();
	if (!currentUser) {
		redirect("/login");
	}

	const { id } = await params;
	const admin = isAdmin(currentUser);

	let question: McqForAttempt;
	let correctChoiceId: string | null = null;

	try {
		if (admin) {
			const mcq = await mcqService.getById(id);
			question = toAttemptView(mcq);
			correctChoiceId = mcq.choices.find((choice) => choice.isCorrect)?.id ?? null;
		} else {
			question = await mcqService.getForAttempt(id);
		}
	} catch (error) {
		if (error instanceof NotFoundError) {
			notFound();
		}
		throw error;
	}

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6 sm:p-10">
			<Link
				href="/mcq"
				className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "self-start")}
			>
				<ArrowLeftIcon />
				Questions
			</Link>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">{question.name}</CardTitle>
					<CardDescription>{question.description}</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					{admin && (
						<p className="text-sm text-muted-foreground">
							You are previewing your own question, so the correct answer is marked. Answering
							still records an attempt.
						</p>
					)}
					<AttemptForm mcq={question} correctChoiceId={correctChoiceId} />
				</CardContent>
			</Card>
		</main>
	);
}
