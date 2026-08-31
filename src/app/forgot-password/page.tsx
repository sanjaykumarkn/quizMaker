import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "Forgot password · quizMaker",
};

export default function ForgotPasswordPage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<CardTitle className="text-lg">Forgot your password?</CardTitle>
					<CardDescription>
						Passwords are stored as one-way hashes and cannot be recovered, only replaced.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<ForgotPasswordForm />

					<p className="text-center text-sm text-muted-foreground">
						<Link href="/login" className="font-medium text-foreground underline underline-offset-4">
							Back to sign in
						</Link>
					</p>
				</CardContent>
			</Card>
		</main>
	);
}
