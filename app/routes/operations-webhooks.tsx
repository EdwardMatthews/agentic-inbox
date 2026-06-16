// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Empty, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { PlusIcon, TrashIcon, WebhooksLogoIcon } from "@phosphor-icons/react";
import { useState } from "react";
import {
	useCreateOperationsWebhook,
	useDeleteOperationsWebhook,
	useOperationsWebhooks,
	useUpdateOperationsWebhook,
} from "~/queries/operations";
import type { OperationsWebhook } from "~/types/operations";

export default function OperationsWebhooksRoute() {
	const toastManager = useKumoToastManager();
	const { data: webhooks = [], isLoading } = useOperationsWebhooks();
	const createWebhook = useCreateOperationsWebhook();
	const updateWebhook = useUpdateOperationsWebhook();
	const deleteWebhook = useDeleteOperationsWebhook();
	const [editingWebhook, setEditingWebhook] = useState<OperationsWebhook | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [form, setForm] = useState({
		name: "",
		url: "",
		secret: "",
		eventTypes: "*",
		enabled: true,
	});

	const openCreate = () => {
		setEditingWebhook(null);
		setForm({ name: "", url: "", secret: "", eventTypes: "*", enabled: true });
		setIsOpen(true);
	};

	const openEdit = (webhook: OperationsWebhook) => {
		setEditingWebhook(webhook);
		setForm({
			name: webhook.name,
			url: webhook.url,
			secret: webhook.secret || "",
			eventTypes: webhook.event_types.join(", "),
			enabled: webhook.enabled,
		});
		setIsOpen(true);
	};

	const saveWebhook = async () => {
		const body = {
			name: form.name,
			url: form.url,
			secret: form.secret || null,
			eventTypes: form.eventTypes.split(",").map((value) => value.trim()).filter(Boolean),
			enabled: form.enabled,
		};

		try {
			if (editingWebhook) {
				await updateWebhook.mutateAsync({ webhookId: editingWebhook.id, body });
				toastManager.add({ title: "Webhook updated" });
			} else {
				await createWebhook.mutateAsync(body);
				toastManager.add({ title: "Webhook created" });
			}
			setIsOpen(false);
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handleDelete = async (webhook: OperationsWebhook) => {
		if (!window.confirm(`Delete webhook "${webhook.name}"?`)) return;
		try {
			await deleteWebhook.mutateAsync(webhook.id);
			toastManager.add({ title: "Webhook deleted" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	return (
		<div className="space-y-5">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold text-kumo-default">Webhooks</h2>
					<p className="text-sm text-kumo-subtle mt-1">
						Receive real-time event callbacks for campaign lifecycle, delivery attempts, opens, clicks, and unsubscribes.
					</p>
				</div>
				<Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate}>
					New webhook
				</Button>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-16"><Loader size="lg" /></div>
			) : webhooks.length > 0 ? (
				<div className="space-y-4">
					{webhooks.map((webhook) => (
						<div key={webhook.id} className="rounded-xl border border-kumo-line bg-kumo-base p-5">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<div className="text-base font-semibold text-kumo-default">{webhook.name}</div>
										<Badge variant={webhook.enabled ? "secondary" : "outline"}>
											{webhook.enabled ? "enabled" : "disabled"}
										</Badge>
									</div>
									<div className="text-sm text-kumo-subtle mt-1 break-all">{webhook.url}</div>
									<div className="text-xs text-kumo-subtle mt-3">
										Events: {webhook.event_types.join(", ")}
									</div>
								</div>
								<div className="flex gap-2">
									<Button variant="secondary" size="sm" onClick={() => openEdit(webhook)}>
										Edit
									</Button>
									<Button
										variant="ghost"
										size="sm"
										shape="square"
										icon={<TrashIcon size={16} />}
										onClick={() => handleDelete(webhook)}
										aria-label={`Delete ${webhook.name}`}
									/>
								</div>
							</div>
						</div>
					))}
				</div>
			) : (
				<Empty
					icon={<WebhooksLogoIcon size={48} className="text-kumo-subtle" />}
					title="No webhooks yet"
					description="Create a webhook to push campaign and recipient events into your automation stack."
					contents={
						<Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate}>
							Create webhook
						</Button>
					}
				/>
			)}

			<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
				<Dialog size="lg" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">
						{editingWebhook ? "Edit webhook" : "New webhook"}
					</Dialog.Title>
					<div className="space-y-4">
						<Input label="Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
						<Input label="URL" value={form.url} onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))} />
						<Input label="Secret header value" value={form.secret} onChange={(e) => setForm((prev) => ({ ...prev, secret: e.target.value }))} />
						<Input label="Event types" placeholder="*, send_succeeded, opened" value={form.eventTypes} onChange={(e) => setForm((prev) => ({ ...prev, eventTypes: e.target.value }))} />
						<label className="flex items-center gap-3 rounded-md border border-kumo-line px-3 py-2 text-sm text-kumo-default">
							<input type="checkbox" checked={form.enabled} onChange={(e) => setForm((prev) => ({ ...prev, enabled: e.target.checked }))} />
							Enabled
						</label>
					</div>
					<div className="flex justify-end gap-2 mt-6">
						<Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
						<Button variant="primary" onClick={saveWebhook} loading={createWebhook.isPending || updateWebhook.isPending}>
							Save webhook
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
