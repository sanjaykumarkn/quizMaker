import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { McqTable } from "@/components/mcq/mcq-table";
import type { McqSummary } from "@/lib/types/mcq";

/**
 * The row actions menu cannot be checked against server-rendered HTML: Base UI renders the
 * menu contents into a portal only once the menu is open, so a closed menu is genuinely
 * absent from the markup. Opening it is the only honest way to assert what it offers.
 */

// A Server Action cannot be imported under jsdom; the delete dialog only needs it to exist.
vi.mock("@/app/mcq/actions", () => ({
	deleteMcqAction: vi.fn(async () => ({ status: "idle" as const })),
}));

// `next/link` expects an App Router context that a unit test does not have.
vi.mock("next/link", () => ({
	default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
		<a href={href} {...props}>
			{children}
		</a>
	),
}));

const mcqs: McqSummary[] = [
	{
		id: "mcq-1",
		name: "Capital of France",
		description: "Which city is the capital of France?",
		choiceCount: 3,
		createdAt: "2026-09-10 10:00:00",
		updatedAt: "2026-09-10 10:00:00",
	},
];

/**
 * The menu contents are mounted into a portal after the click settles, so every query for a
 * menu item has to be the async `find*` form. A synchronous `get*` races the portal and fails
 * intermittently rather than honestly.
 */
async function openRowMenu() {
	await userEvent.click(screen.getByRole("button", { name: /actions for capital of france/i }));
	return screen.findAllByRole("menuitem");
}

describe("McqTable row actions menu", () => {
	it("offers exactly Edit, Preview and Delete to an administrator", async () => {
		render(<McqTable mcqs={mcqs} canManage />);
		const items = await openRowMenu();

		expect(items.map((item) => item.textContent?.trim())).toEqual(["Edit", "Preview", "Delete"]);
	});

	it("points Edit and Preview at the right routes", async () => {
		render(<McqTable mcqs={mcqs} canManage />);
		const items = await openRowMenu();

		const hrefs = Object.fromEntries(
			items.map((item) => [item.textContent?.trim(), item.getAttribute("href")]),
		);
		expect(hrefs.Edit).toBe("/mcq/mcq-1/edit");
		expect(hrefs.Preview).toBe("/mcq/mcq-1/preview");
	});

	it("offers only Preview to a member", async () => {
		render(<McqTable mcqs={mcqs} canManage={false} />);
		const items = await openRowMenu();

		expect(items.map((item) => item.textContent?.trim())).toEqual(["Preview"]);
	});

	it("opens the delete confirmation, naming the question and its choice count", async () => {
		render(<McqTable mcqs={mcqs} canManage />);
		await openRowMenu();
		await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

		const dialog = await screen.findByRole("dialog");
		expect(dialog.textContent).toContain("Capital of France");
		expect(dialog.textContent).toContain("3 choices");
		// Deleting a question removes its attempts too, so the dialog must not claim otherwise.
		expect(dialog.textContent).toContain("attempts recorded against it are removed with it");
	});

	it("shows the Create button to an administrator only", () => {
		const { unmount } = render(<McqTable mcqs={mcqs} canManage />);
		expect(screen.getByRole("link", { name: /create/i })).toBeTruthy();
		unmount();

		render(<McqTable mcqs={mcqs} canManage={false} />);
		expect(screen.queryByRole("link", { name: /create/i })).toBeNull();
	});

	it("renders an empty state that tells each role what to do", () => {
		const { unmount } = render(<McqTable mcqs={[]} canManage />);
		expect(screen.getByText(/use create to add the first one/i)).toBeTruthy();
		unmount();

		render(<McqTable mcqs={[]} canManage={false} />);
		expect(screen.getByText(/an administrator has to add one first/i)).toBeTruthy();
	});
});
