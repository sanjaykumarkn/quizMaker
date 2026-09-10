"use client";

import Link from "next/link";
import { useState } from "react";
import { EllipsisIcon, EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { DeleteMcqDialog } from "@/components/mcq/delete-mcq-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { McqSummary } from "@/lib/types/mcq";
import { cn } from "@/lib/utils";

interface McqTableProps {
	mcqs: McqSummary[];
	/** True for an admin. Members may preview a question but not author or remove one. */
	canManage: boolean;
}

function formatDate(value: string): string {
	const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
	return Number.isNaN(date.getTime())
		? value
		: date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function McqTable({ mcqs, canManage }: McqTableProps) {
	const [deleting, setDeleting] = useState<McqSummary | undefined>(undefined);

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{mcqs.length} {mcqs.length === 1 ? "question" : "questions"}
				</p>
				{/*
				 * A Link styled with `buttonVariants` rather than a Button rendering a Link. Base UI
				 * stamps role="button" on whatever it renders, which would describe a navigation
				 * control as a button to a screen reader.
				 */}
				{canManage && (
					<Link href="/mcq/new" className={cn(buttonVariants())}>
						<PlusIcon />
						Create
					</Link>
				)}
			</div>

			<div className="rounded-xl ring-1 ring-foreground/10">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Description</TableHead>
							<TableHead>Choices</TableHead>
							<TableHead>Created</TableHead>
							<TableHead>Updated</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{mcqs.length === 0 && (
							<TableRow>
								<TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
									{canManage
										? "No questions yet. Use Create to add the first one."
										: "No questions yet. An administrator has to add one first."}
								</TableCell>
							</TableRow>
						)}

						{mcqs.map((mcq) => (
							<TableRow key={mcq.id}>
								<TableCell className="font-medium">{mcq.name}</TableCell>
								<TableCell className="max-w-md text-muted-foreground">
									<span className="line-clamp-2">{mcq.description}</span>
								</TableCell>
								<TableCell className="text-muted-foreground">{mcq.choiceCount}</TableCell>
								<TableCell className="text-muted-foreground">{formatDate(mcq.createdAt)}</TableCell>
								<TableCell className="text-muted-foreground">{formatDate(mcq.updatedAt)}</TableCell>
								<TableCell className="text-right">
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon-sm"
													aria-label={`Actions for ${mcq.name}`}
												/>
											}
										>
											<EllipsisIcon />
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											{/*
											 * Preview comes first for a member, because it is their only
											 * action. Rendering the item as a Link keeps it keyboard and
											 * middle-click friendly rather than a div with an onClick.
											 */}
											{canManage && (
												<DropdownMenuItem render={<Link href={`/mcq/${mcq.id}/edit`} />}>
													<PencilIcon />
													Edit
												</DropdownMenuItem>
											)}
											<DropdownMenuItem render={<Link href={`/mcq/${mcq.id}/preview`} />}>
												<EyeIcon />
												Preview
											</DropdownMenuItem>
											{canManage && (
												<>
													<DropdownMenuSeparator />
													<DropdownMenuItem
														variant="destructive"
														onClick={() => setDeleting(mcq)}
													>
														<Trash2Icon />
														Delete
													</DropdownMenuItem>
												</>
											)}
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<DeleteMcqDialog
				open={Boolean(deleting)}
				onOpenChange={(open) => !open && setDeleting(undefined)}
				mcq={deleting}
			/>
		</div>
	);
}
