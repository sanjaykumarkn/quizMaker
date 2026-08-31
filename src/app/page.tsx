import { redirect } from "next/navigation";

import { landingPathFor } from "@/lib/auth/landing";
import { getCurrentUser } from "@/lib/auth/session";

export default async function Home() {
	const user = await getCurrentUser();
	redirect(user ? landingPathFor(user) : "/login");
}
