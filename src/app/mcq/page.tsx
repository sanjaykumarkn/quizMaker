import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { UserIcon, UsersIcon } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { McqTable } from "@/components/mcq/mcq-table";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { mcqService } from "@/lib/services/mcq.service";
import { isAdmin } from "@/lib/types/user";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
	title: "Questions · quizMaker",
};

/**
 * The landing screen after signing in, for both roles. Members reach it too, because anyone
 * may attempt a question; the table hides the authoring actions from them rather than the
 * whole page.
 */
export default async function McqPage() {
	// Route protection lives here rather than in middleware, which cannot reach D1 under
	// OpenNext and so could only check that a cookie exists, not that it is valid.
	const currentUser = await getCurrentUser();
	if (!currentUser) {
		redirect("/login");
	}

	const mcqs = await mcqService.list();
	const admin = isAdmin(currentUser);

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-6 sm:p-10">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-heading text-xl font-medium">Questions</h1>
					<p className="text-sm text-muted-foreground">
						Signed in as {currentUser.firstName} {currentUser.lastName} (@{currentUser.username})
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Link
						href="/account"
						className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
					>
						<UserIcon />
						Account
					</Link>
					{admin && (
						<Link href="/users" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
							<UsersIcon />
							Users
						</Link>
					)}
					<SignOutButton />
				</div>
			</header>

			<McqTable mcqs={mcqs} canManage={admin} />
		</main>
	);
}
