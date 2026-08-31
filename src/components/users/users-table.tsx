"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { UserFormDialog } from "@/components/users/user-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { PublicUser } from "@/lib/types/user";

interface UsersTableProps {
	users: PublicUser[];
	currentUserId: string;
}

function formatDate(value: string): string {
	const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
	return Number.isNaN(date.getTime())
		? value
		: date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function UsersTable({ users, currentUserId }: UsersTableProps) {
	const [editing, setEditing] = useState<PublicUser | undefined>(undefined);
	const [formOpen, setFormOpen] = useState(false);
	const [deleting, setDeleting] = useState<PublicUser | undefined>(undefined);

	function openCreate() {
		setEditing(undefined);
		setFormOpen(true);
	}

	function openEdit(user: PublicUser) {
		setEditing(user);
		setFormOpen(true);
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					{users.length} {users.length === 1 ? "user" : "users"}
				</p>
				<Button onClick={openCreate}>
					<PlusIcon />
					Add user
				</Button>
			</div>

			<div className="rounded-xl ring-1 ring-foreground/10">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Username</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Created</TableHead>
							<TableHead className="text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{users.length === 0 && (
							<TableRow>
								<TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
									No users yet.
								</TableCell>
							</TableRow>
						)}

						{users.map((user) => {
							const isSelf = user.id === currentUserId;
							return (
								<TableRow key={user.id}>
									<TableCell className="font-medium">
										{user.firstName} {user.lastName}
										{isSelf && (
											<Badge variant="secondary" className="ml-2">
												You
											</Badge>
										)}
									</TableCell>
									<TableCell className="text-muted-foreground">@{user.username}</TableCell>
									<TableCell className="text-muted-foreground">{user.email}</TableCell>
									<TableCell>
										<Badge variant={user.role === "admin" ? "default" : "secondary"}>{user.role}</Badge>
									</TableCell>
									<TableCell className="text-muted-foreground">{formatDate(user.createdAt)}</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-1">
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={`Edit ${user.username}`}
												onClick={() => openEdit(user)}
											>
												<PencilIcon />
											</Button>
											<Button
												variant="ghost"
												size="icon-sm"
												aria-label={`Delete ${user.username}`}
												disabled={isSelf}
												onClick={() => setDeleting(user)}
											>
												<Trash2Icon className="text-destructive" />
											</Button>
										</div>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			</div>

			<UserFormDialog open={formOpen} onOpenChange={setFormOpen} user={editing} />
			<DeleteUserDialog
				open={Boolean(deleting)}
				onOpenChange={(open) => !open && setDeleting(undefined)}
				user={deleting}
			/>
		</div>
	);
}
