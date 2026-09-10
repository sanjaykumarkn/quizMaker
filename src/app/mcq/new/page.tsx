import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";

import { McqForm } from "@/components/mcq/mcq-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/types/user";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
	title: "New question · quizMaker",
};

/**
 * A full page rather than a dialog. A question with six choices is too tall for a modal, and
 * a URL for an in-progress edit is worth having.
 */
export default async function NewMcqPage() {
	const currentUser = await getCurrentUser();
	if (!currentUser) {
		redirect("/login");
	}
	// A member is signed in but not entitled to author, so send them to the list they can use
	// rather than to the login form they have already passed.
	if (!isAdmin(currentUser)) {
		redirect("/mcq");
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
					<CardTitle className="text-lg">New question</CardTitle>
					<CardDescription>
						Write the question, then add between two and six choices and mark the correct one.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<McqForm />
				</CardContent>
			</Card>
		</main>
	);
}
