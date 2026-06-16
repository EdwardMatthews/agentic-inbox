// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Empty, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { ArrowLeftIcon, CopyIcon, KeyIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useMailboxes } from "~/queries/mailboxes";
import { useApiKeys, useCreateApiKey, useRevokeApiKey } from "~/queries/global-settings";
import type { ManagedApiKeyCreateResult } from "~/types/operations";

function copyText(value: string) {
	return navigator.clipboard.writeText(value);
}

export default function GlobalSettingsRoute() {
	const navigate = useNavigate();
	const toastManager = useKumoToastManager();
	const { data: apiKeys = [], isLoading } = useApiKeys();
	const { data: mailboxes = [] } = useMailboxes();
	const createApiKey = useCreateApiKey();
	const revokeApiKey = useRevokeApiKey();
	const [isOpen, setIsOpen] = useState(false);
	const [createdKey, setCreatedKey] = useState<ManagedApiKeyCreateResult | null>(null);
	const [form, setForm] = useState({
		name: "",
		scopes: "transactional:send",
		allowedMailboxes: "",
	});

	const scopeOptions = ["transactional:send"];

	const saveApiKey = async () => {
		try {
			const result = await createApiKey.mutateAsync({
				name: form.name,
				scopes: form.scopes.split(",").map((value) => value.trim()).filter(Boolean),
				allowedMailboxes: form.allowedMailboxes.split(",").map((value) => value.trim()).filter(Boolean),
			});
			setCreatedKey(result);
			setForm({ name: "", scopes: "transactional:send", allowedMailboxes: "" });
			toastManager.add({ title: "API key created" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handleRevoke = async (apiKeyId: string, name: string) => {
		if (!window.confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;
		try {
			await revokeApiKey.mutateAsync(apiKeyId);
			toastManager.add({ title: "API key revoked" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const suggestedMailboxList = useMemo(
		() => mailboxes.map((mailbox) => mailbox.email).join(", "),
		[mailboxes],
	);

	return (
		<div className="min-h-screen bg-kumo-recessed">
			<div className="mx-auto max-w-4xl px-4 py-8 md:px-6 md:py-12">
				<div className="mb-8 flex items-start justify-between gap-4">
					<div>
						<Button variant="ghost" size="sm" icon={<ArrowLeftIcon size={16} />} onClick={() => navigate("/")}>
							Back
						</Button>
						<h1 className="mt-4 text-2xl font-bold text-kumo-default">Global Settings</h1>
						<p className="mt-2 text-sm text-kumo-subtle max-w-2xl">
							Manage machine-to-machine API keys for external applications that need to send transactional mail through Agentic Inbox.
						</p>
					</div>
					<Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setIsOpen(true)}>
						New API key
					</Button>
				</div>

				<div className="rounded-xl border border-kumo-line bg-kumo-base p-5 mb-6">
					<h2 className="text-sm font-semibold text-kumo-default">Transactional API</h2>
					<p className="text-sm text-kumo-subtle mt-2">
						External apps should call <code>/api/v1/transactional/send</code> with either <code>Authorization: Bearer &lt;api-key&gt;</code> or <code>X-Agentic-Inbox-Api-Key</code>.
					</p>
				</div>

				{isLoading ? (
					<div className="flex justify-center py-20"><Loader size="lg" /></div>
				) : apiKeys.length > 0 ? (
					<div className="rounded-xl border border-kumo-line bg-kumo-base overflow-hidden">
						{apiKeys.map((apiKey, idx) => (
							<div key={apiKey.id} className={`grid gap-4 px-5 py-4 md:grid-cols-[minmax(0,1.4fr)_220px_160px_auto] ${idx > 0 ? "border-t border-kumo-line" : ""}`}>
								<div className="min-w-0">
									<div className="text-sm font-semibold text-kumo-default truncate">{apiKey.name}</div>
									<div className="text-sm text-kumo-subtle mt-1">Prefix: <code>{apiKey.key_prefix}</code></div>
									<div className="mt-2 flex flex-wrap gap-1">
										{apiKey.scopes.map((scope) => (
											<Badge key={scope} variant="secondary">{scope}</Badge>
										))}
									</div>
									{apiKey.allowed_mailboxes.length > 0 && (
										<div className="text-xs text-kumo-subtle mt-2 break-all">
											Allowed mailboxes: {apiKey.allowed_mailboxes.join(", ")}
										</div>
									)}
								</div>
								<div className="text-sm text-kumo-subtle">
									<div className="font-medium text-kumo-strong">Last used</div>
									<div className="mt-1">{apiKey.last_used_at || "Never"}</div>
								</div>
								<div className="text-sm text-kumo-subtle">
									<div className="font-medium text-kumo-strong">Status</div>
									<div className="mt-1">
										<Badge variant={apiKey.revoked_at ? "outline" : "secondary"}>
											{apiKey.revoked_at ? "revoked" : "active"}
										</Badge>
									</div>
								</div>
								<div className="flex justify-end">
									<Button
										variant="ghost"
										size="sm"
										shape="square"
										icon={<TrashIcon size={16} />}
										onClick={() => handleRevoke(apiKey.id, apiKey.name)}
										disabled={Boolean(apiKey.revoked_at)}
										aria-label={`Revoke ${apiKey.name}`}
									/>
								</div>
							</div>
						))}
					</div>
				) : (
					<Empty
						icon={<KeyIcon size={48} className="text-kumo-subtle" />}
						title="No API keys yet"
						description="Create an API key for a trusted external service, then use it to call the transactional send endpoint."
						contents={
							<Button variant="primary" icon={<PlusIcon size={16} />} onClick={() => setIsOpen(true)}>
								Create API key
							</Button>
						}
					/>
				)}
			</div>

			<Dialog.Root open={isOpen} onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) setCreatedKey(null);
			}}>
				<Dialog size="lg" className="p-6">
					<Dialog.Title className="text-base font-semibold mb-5">Create API key</Dialog.Title>
					<div className="space-y-4">
						<Input label="Name" placeholder="My backend app" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
						<Input label="Scopes" value={form.scopes} onChange={(e) => setForm((prev) => ({ ...prev, scopes: e.target.value }))} />
						<div className="text-xs text-kumo-subtle">
							Available scopes: {scopeOptions.join(", ")}
						</div>
						<Input
							label="Allowed mailboxes"
							placeholder={suggestedMailboxList || "noreply@example.com"}
							value={form.allowedMailboxes}
							onChange={(e) => setForm((prev) => ({ ...prev, allowedMailboxes: e.target.value }))}
						/>
						<div className="text-xs text-kumo-subtle">
							Leave empty to allow all mailboxes. Otherwise provide a comma-separated allowlist.
						</div>

						{createdKey && (
							<div className="rounded-lg border border-kumo-line bg-kumo-recessed p-4">
								<div className="text-sm font-medium text-kumo-default">Copy this key now</div>
								<p className="text-xs text-kumo-subtle mt-1">
									This is the only time the full API key will be shown.
								</p>
								<pre className="mt-3 rounded bg-kumo-base p-3 text-xs overflow-x-auto">{createdKey.apiKey}</pre>
								<div className="mt-3">
									<Button
										variant="secondary"
										size="sm"
										icon={<CopyIcon size={14} />}
										onClick={async () => {
											await copyText(createdKey.apiKey);
											toastManager.add({ title: "API key copied" });
										}}
									>
										Copy key
									</Button>
								</div>
							</div>
						)}
					</div>
					<div className="mt-6 flex justify-end gap-2">
						<Button variant="secondary" onClick={() => setIsOpen(false)}>Close</Button>
						<Button variant="primary" onClick={saveApiKey} loading={createApiKey.isPending}>
							Create key
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}

