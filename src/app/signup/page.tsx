import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SignupForm } from "@/components/auth/signup-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { landingPathFor } from "@/lib/auth/landing";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = {
	title: "Create an account · quizMaker",
};

export default async function SignupPage() {
	const currentUser = await getCurrentUser();
	if (currentUser) {
		redirect(landingPathFor(currentUser));
	}

	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle className="text-lg">Create your quizMaker account</CardTitle>
					<CardDescription>All fields are required. You will be signed in automatically.</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<SignupForm />

					<p className="text-center text-sm text-muted-foreground">
						Already have an account?{" "}
						<Link href="/login" className="font-medium text-foreground underline underline-offset-4">
							Sign in
						</Link>
					</p>
				</CardContent>
			</Card>
		</main>
	);
}
