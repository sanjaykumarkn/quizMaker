import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { UsersTable } from "@/components/users/users-table";
import { getCurrentUser } from "@/lib/auth/session";
import { usersService } from "@/lib/services/users.service";
import { isAdmin } from "@/lib/types/user";

export const metadata: Metadata = {
	title: "Users · quizMaker",
};

export default async function UsersPage() {
	// Route protection lives here rather than in middleware, which cannot reach D1 under
	// OpenNext and so could only check that a cookie exists, not that it is valid.
	const currentUser = await getCurrentUser();
	if (!currentUser) {
		redirect("/login");
	}
	// A member is signed in but not entitled to this screen, so send them to their own page
	// rather than to the login form they have already passed.
	if (!isAdmin(currentUser)) {
		redirect("/account");
	}

	const users = await usersService.list();

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 p-6 sm:p-10">
			<header className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-heading text-xl font-medium">Users</h1>
					<p className="text-sm text-muted-foreground">
						Signed in as {currentUser.firstName} {currentUser.lastName} (@{currentUser.username})
					</p>
				</div>
				<SignOutButton />
			</header>

			<UsersTable users={users} currentUserId={currentUser.id} />
		</main>
	);
}
