// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Empty, Input, Loader, Select, useKumoToastManager } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon, UserIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import {
	useCreateOperationsCustomer,
	useDeleteOperationsCustomer,
	useOperationsCustomers,
	useUpdateOperationsCustomer,
} from "~/queries/operations";
import type { OperationsCustomer } from "~/types/operations";

function tagString(tags: string[]) {
	return tags.join(", ");
}

export default function OperationsCustomersRoute() {
	const toastManager = useKumoToastManager();
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("");
	const [editingCustomer, setEditingCustomer] = useState<OperationsCustomer | null>(null);
	const [isOpen, setIsOpen] = useState(false);

	const params = useMemo(() => ({
		...(search ? { query: search } : {}),
		...(status ? { status } : {}),
		page: "1",
		limit: "100",
	}), [search, status]);

	const { data, isLoading } = useOperationsCustomers(params);
	const createCustomer = useCreateOperationsCustomer();
	const updateCustomer = useUpdateOperationsCustomer();
	const deleteCustomer = useDeleteOperationsCustomer();

	const [form, setForm] = useState({
		email: "",
		name: "",
		firstName: "",
		lastName: "",
		status: "active",
		tags: "",
	});

	const openCreate = () => {
		setEditingCustomer(null);
		setForm({
			email: "",
			name: "",
			firstName: "",
			lastName: "",
			status: "active",
			tags: "",
		});
		setIsOpen(true);
	};

	const openEdit = (customer: OperationsCustomer) => {
		setEditingCustomer(customer);
		setForm({
			email: customer.email,
			name: customer.name,
			firstName: customer.first_name || "",
			lastName: customer.last_name || "",
			status: customer.status,
			tags: tagString(customer.tags),
		});
		setIsOpen(true);
	};

	const saveCustomer = async () => {
		const body = {
			email: form.email,
			name: form.name,
			firstName: form.firstName || undefined,
			lastName: form.lastName || undefined,
			status: form.status as OperationsCustomer["status"],
			tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
		};
		try {
			if (editingCustomer) {
				await updateCustomer.mutateAsync({ customerId: editingCustomer.id, body });
				toastManager.add({ title: "Customer updated" });
			} else {
				await createCustomer.mutateAsync(body);
				toastManager.add({ title: "Customer created" });
			}
			setIsOpen(false);
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handleDelete = async (customer: OperationsCustomer) => {
		if (!window.confirm(`Delete customer ${customer.email}?`)) return;
		try {
			await deleteCustomer.mutateAsync(customer.id);
			toastManager.add({ title: "Customer deleted" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	return (
		<div className="space-y-5">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold text-kumo-default">Customers</h2>
					<p className="text-sm text-kumo-subtle mt-1">
						Manage recipients, tags, lifecycle status, and unsubscribes for campaign audiences.
					</p>
				</div>
				<Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate}>
					New customer
				</Button>
			</div>

			<div className="grid gap-3 md:grid-cols-[1fr_200px]">
				<Input
					label="Search"
					placeholder="Search by email or name"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<Select
					label="Status"
					value={status}
					onValueChange={(value) => setStatus(value || "")}
				>
					<Select.Option value="">All statuses</Select.Option>
					<Select.Option value="active">Active</Select.Option>
					<Select.Option value="paused">Paused</Select.Option>
					<Select.Option value="unsubscribed">Unsubscribed</Select.Option>
				</Select>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-16"><Loader size="lg" /></div>
			) : data && data.customers.length > 0 ? (
				<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
					{data.customers.map((customer, idx) => (
						<div
							key={customer.id}
							className={`grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.6fr)_140px_200px_auto] ${idx > 0 ? "border-t border-kumo-line" : ""}`}
						>
							<div className="min-w-0">
								<div className="text-sm font-semibold text-kumo-default truncate">
									{customer.name}
								</div>
								<div className="text-sm text-kumo-subtle truncate">{customer.email}</div>
								{customer.tags.length > 0 && (
									<div className="flex flex-wrap gap-1 mt-2">
										{customer.tags.map((tag) => (
											<Badge key={tag} variant="outline">{tag}</Badge>
										))}
									</div>
								)}
							</div>
							<div className="text-sm text-kumo-subtle">
								<div className="font-medium text-kumo-strong">Status</div>
								<div className="mt-1">
									<Badge variant={customer.status === "active" ? "secondary" : "outline"}>
										{customer.status}
									</Badge>
								</div>
							</div>
							<div className="text-sm text-kumo-subtle">
								<div className="font-medium text-kumo-strong">Last activity</div>
								<div className="mt-1">{customer.last_activity_at || "Never"}</div>
							</div>
							<div className="flex items-start justify-end gap-2">
								<Button variant="secondary" size="sm" onClick={() => openEdit(customer)}>
									Edit
								</Button>
								<Button
									variant="ghost"
									size="sm"
									shape="square"
									icon={<TrashIcon size={16} />}
									onClick={() => handleDelete(customer)}
									aria-label={`Delete ${customer.email}`}
								/>
							</div>
						</div>
					))}
				</div>
			) : (
				<Empty
					icon={<UserIcon size={48} className="text-kumo-subtle" />}
					title="No customers yet"
					description="Create customers first so campaigns can target real recipient audiences."
					contents={
						<Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate}>
							Create customer
						</Button>
					}
				/>
			)}

			<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
				<Dialog size="lg" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">
						{editingCustomer ? "Edit customer" : "New customer"}
					</Dialog.Title>
					<div className="grid gap-4 md:grid-cols-2">
						<Input label="Email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
						<Input label="Display name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
						<Input label="First name" value={form.firstName} onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))} />
						<Input label="Last name" value={form.lastName} onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))} />
						<Select
							label="Status"
							value={form.status}
							onValueChange={(value) => setForm((prev) => ({ ...prev, status: value || "active" }))}
						>
							<Select.Option value="active">Active</Select.Option>
							<Select.Option value="paused">Paused</Select.Option>
							<Select.Option value="unsubscribed">Unsubscribed</Select.Option>
						</Select>
						<Input label="Tags" placeholder="vip, onboarding" value={form.tags} onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))} />
					</div>
					<div className="flex justify-end gap-2 mt-6">
						<Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
						<Button variant="primary" onClick={saveCustomer} loading={createCustomer.isPending || updateCustomer.isPending}>
							Save customer
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
