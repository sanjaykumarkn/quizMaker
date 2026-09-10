import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/types/user";

export const metadata: Metadata = {
	title: "Your account · quizMaker",
};

/**
 * The landing page for members, who have no access to user management. It shows only the
 * signed-in user's own record, which they are always entitled to see.
 */
export default async function AccountPage() {
	const user = await getCurrentUser();
	if (!user) {
		redirect("/login");
	}

	const details: [string, string][] = [
		["Name", `${user.firstName} ${user.lastName}`],
		["Username", user.username],
		["Email", user.email],
	];

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 p-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">Your account</CardTitle>
					<CardDescription>Signed in to quizMaker.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<dl className="flex flex-col gap-3 text-sm">
						{details.map(([label, value]) => (
							<div key={label} className="flex items-baseline justify-between gap-4">
								<dt className="text-muted-foreground">{label}</dt>
								<dd className="font-medium">{value}</dd>
							</div>
						))}
						<div className="flex items-baseline justify-between gap-4">
							<dt className="text-muted-foreground">Role</dt>
							<dd>
								<Badge variant={isAdmin(user) ? "default" : "secondary"}>{user.role}</Badge>
							</dd>
						</div>
					</dl>

					{isAdmin(user) ? (
						<p className="text-sm text-muted-foreground">
							You have administrator access.{" "}
							<Link href="/users" className="font-medium text-foreground underline underline-offset-4">
								Manage users
							</Link>
						</p>
					) : (
						<p className="text-sm text-muted-foreground">
							Only administrators can manage user accounts. Contact one if you need your details or
							password changed.
						</p>
					)}

					<SignOutButton />
				</CardContent>
			</Card>
		</main>
	);
}
