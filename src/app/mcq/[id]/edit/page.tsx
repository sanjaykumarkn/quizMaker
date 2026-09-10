import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { McqForm } from "@/components/mcq/mcq-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/errors";
import { mcqService } from "@/lib/services/mcq.service";
import type { Mcq } from "@/lib/types/mcq";
import { isAdmin } from "@/lib/types/user";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Edit question · quizMaker",
};

interface EditMcqPageProps {
	params: Promise<{ id: string }>;
}

export default async function EditMcqPage({ params }: EditMcqPageProps) {
	const currentUser = await getCurrentUser();
	if (!currentUser) {
		redirect("/login");
	}
	if (!isAdmin(currentUser)) {
		redirect("/mcq");
	}

	const { id } = await params;

	// The service speaks in domain errors; a page has to speak in HTTP. Only a missing question
	// becomes a 404 — anything else is a real failure and should not be disguised as one.
	let mcq: Mcq;
	try {
		mcq = await mcqService.getById(id);
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
					<CardTitle className="text-lg">Edit question</CardTitle>
					<CardDescription>
						Saving replaces the whole choice set. Attempts already recorded are kept as they were.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<McqForm mcq={mcq} />
				</CardContent>
			</Card>
		</main>
	);
}
