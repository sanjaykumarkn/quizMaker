import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldSeparator } from "@/components/ui/field";
import { landingPathFor } from "@/lib/auth/landing";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
	title: "Sign in · quizMaker",
};

export default async function LoginPage() {
	const currentUser = await getCurrentUser();
	if (currentUser) {
		redirect(landingPathFor(currentUser));
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-lg">Sign in to quizMaker</CardTitle>
					<CardDescription>Enter your username and password to continue.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<LoginForm />

					<div className="text-center text-sm">
						<Link
							href="/forgot-password"
							className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
						>
							Forgot your password?
						</Link>
					</div>

					<FieldSeparator />

					<p className="text-center text-sm text-muted-foreground">
						New to quizMaker?{" "}
						<Link href="/signup" className="font-medium text-foreground underline underline-offset-4">
							Create an account
						</Link>
					</p>
				</CardContent>
			</Card>
		</main>
	);
}
