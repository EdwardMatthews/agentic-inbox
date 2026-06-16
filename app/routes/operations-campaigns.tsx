// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Empty, Input, Loader, Pagination, Select, useKumoToastManager } from "@cloudflare/kumo";
import { BroadcastIcon, ClockCountdownIcon, PauseIcon, PlayIcon, PlusIcon, StopIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { useMailboxes } from "~/queries/mailboxes";
import {
	useCreateOperationsCampaign,
	useOperationsCampaigns,
	useOperationsCustomers,
	useOperationsRecipients,
	useOperationsTemplates,
	useUpdateOperationsCampaign,
	usePauseOperationsCampaign,
	useResumeOperationsCampaign,
	useStartOperationsCampaign,
	useCancelOperationsCampaign,
} from "~/queries/operations";
import type { CampaignAudience, OperationsCampaign } from "~/types/operations";

const RECIPIENTS_PAGE_SIZE = 50;

function toDatetimeLocalValue(value: string | null | undefined) {
	if (!value) return "";
	const date = new Date(value);
	const tzOffset = date.getTimezoneOffset() * 60_000;
	return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function OperationsCampaignsRoute() {
	const toastManager = useKumoToastManager();
	const { data: campaigns = [], isLoading } = useOperationsCampaigns();
	const { data: mailboxes = [] } = useMailboxes();
	const { data: templates = [] } = useOperationsTemplates();
	const { data: customersData } = useOperationsCustomers({ page: "1", limit: "200" });
	const createCampaign = useCreateOperationsCampaign();
	const updateCampaign = useUpdateOperationsCampaign();
	const startCampaign = useStartOperationsCampaign();
	const pauseCampaign = usePauseOperationsCampaign();
	const resumeCampaign = useResumeOperationsCampaign();
	const cancelCampaign = useCancelOperationsCampaign();

	const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
	const [recipientsPage, setRecipientsPage] = useState(1);
	const { data: recipientsData } = useOperationsRecipients(selectedCampaignId || undefined, recipientsPage);

	const [editingCampaign, setEditingCampaign] = useState<OperationsCampaign | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [form, setForm] = useState({
		name: "",
		mailboxId: mailboxes[0]?.email || "",
		templateId: "",
		subjectTemplate: "",
		htmlTemplate: "",
		textTemplate: "",
		audienceMode: "all",
		customerIds: "",
		tag: "",
		scheduledAt: "",
		throttlePerMinute: "10",
		trackOpens: true,
		trackClicks: true,
	});

	const customerOptions = customersData?.customers ?? [];

	const openCreate = () => {
		setEditingCampaign(null);
		setForm({
			name: "",
			mailboxId: mailboxes[0]?.email || "",
			templateId: "",
			subjectTemplate: "",
			htmlTemplate: "",
			textTemplate: "",
			audienceMode: "all",
			customerIds: "",
			tag: "",
			scheduledAt: "",
			throttlePerMinute: "10",
			trackOpens: true,
			trackClicks: true,
		});
		setIsOpen(true);
	};

	const openEdit = (campaign: OperationsCampaign) => {
		setEditingCampaign(campaign);
		setForm({
			name: campaign.name,
			mailboxId: campaign.mailbox_id,
			templateId: campaign.template_id || "",
			subjectTemplate: campaign.subject_template || "",
			htmlTemplate: campaign.html_template || "",
			textTemplate: campaign.text_template || "",
			audienceMode: campaign.audience.mode,
			customerIds: campaign.audience.customerIds?.join(", ") || "",
			tag: campaign.audience.tag || "",
			scheduledAt: toDatetimeLocalValue(campaign.scheduled_at),
			throttlePerMinute: String(campaign.throttle_per_minute),
			trackOpens: campaign.track_opens,
			trackClicks: campaign.track_clicks,
		});
		setIsOpen(true);
	};

	const saveCampaign = async () => {
		const audience: CampaignAudience =
			form.audienceMode === "customerIds"
				? {
					mode: "customerIds",
					customerIds: form.customerIds.split(",").map((id) => id.trim()).filter(Boolean),
				}
				: form.audienceMode === "tag"
					? { mode: "tag", tag: form.tag.trim() }
					: { mode: "all" };

		try {
			const body = {
				name: form.name,
				mailboxId: form.mailboxId,
				templateId: form.templateId || null,
				subjectTemplate: form.subjectTemplate || null,
				htmlTemplate: form.htmlTemplate || null,
				textTemplate: form.textTemplate || null,
				audience,
				scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
				throttlePerMinute: Number(form.throttlePerMinute || 10),
				trackOpens: form.trackOpens,
				trackClicks: form.trackClicks,
			};
			if (editingCampaign) {
				await updateCampaign.mutateAsync({ campaignId: editingCampaign.id, body });
				toastManager.add({ title: "Campaign updated" });
			} else {
				await createCampaign.mutateAsync(body);
				toastManager.add({ title: "Campaign created" });
			}
			setIsOpen(false);
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handleStart = async (campaign: OperationsCampaign, scheduledAt?: string | null) => {
		try {
			await startCampaign.mutateAsync({
				campaignId: campaign.id,
				body: scheduledAt ? { scheduledAt } : undefined,
			});
			toastManager.add({ title: "Campaign queued" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handlePause = async (campaign: OperationsCampaign) => {
		try {
			await pauseCampaign.mutateAsync(campaign.id);
			toastManager.add({ title: "Campaign paused" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handleResume = async (campaign: OperationsCampaign) => {
		try {
			await resumeCampaign.mutateAsync(campaign.id);
			toastManager.add({ title: "Campaign resumed" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handleCancel = async (campaign: OperationsCampaign) => {
		if (!window.confirm(`Cancel campaign "${campaign.name}"?`)) return;
		try {
			await cancelCampaign.mutateAsync(campaign.id);
			toastManager.add({ title: "Campaign cancelled" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	return (
		<div className="space-y-5">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold text-kumo-default">Campaigns</h2>
					<p className="text-sm text-kumo-subtle mt-1">
						Build scheduled, queued campaigns on top of your existing mailbox send infrastructure.
					</p>
				</div>
				<Button
					variant="primary"
					icon={<PlusIcon size={16} />}
					onClick={openCreate}
					disabled={mailboxes.length === 0}
				>
					New campaign
				</Button>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-16"><Loader size="lg" /></div>
			) : campaigns.length > 0 ? (
				<div className="space-y-4">
					{campaigns.map((campaign) => (
						<div key={campaign.id} className="rounded-xl border border-kumo-line bg-kumo-base p-5">
							<div className="flex flex-wrap items-start justify-between gap-4">
								<div className="min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<h3 className="text-lg font-semibold text-kumo-default">{campaign.name}</h3>
										<Badge variant="secondary">{campaign.status}</Badge>
										<Badge variant="outline">{campaign.mailbox_id}</Badge>
									</div>
									<div className="text-sm text-kumo-subtle mt-2">
										Scheduled: {campaign.scheduled_at || "Immediate"} · Throttle: {campaign.throttle_per_minute}/min
									</div>
									{campaign.last_error && (
										<div className="text-sm text-kumo-error mt-2">Last error: {campaign.last_error}</div>
									)}
								</div>
								<div className="flex flex-wrap gap-2">
									<Button
										variant="secondary"
										size="sm"
										icon={<PlayIcon size={14} />}
										onClick={() => handleStart(campaign, campaign.scheduled_at)}
										disabled={startCampaign.isPending}
									>
										Queue
									</Button>
									<Button
										variant="secondary"
										size="sm"
										onClick={() => openEdit(campaign)}
									>
										Edit
									</Button>
									<Button
										variant="secondary"
										size="sm"
										icon={<PauseIcon size={14} />}
										onClick={() => handlePause(campaign)}
										disabled={pauseCampaign.isPending || campaign.status !== "sending"}
									>
										Pause
									</Button>
									<Button
										variant="secondary"
										size="sm"
										icon={<ClockCountdownIcon size={14} />}
										onClick={() => handleResume(campaign)}
										disabled={resumeCampaign.isPending || campaign.status !== "paused"}
									>
										Resume
									</Button>
									<Button
										variant="ghost"
										size="sm"
										icon={<StopIcon size={14} />}
										onClick={() => handleCancel(campaign)}
										disabled={cancelCampaign.isPending || campaign.status === "cancelled" || campaign.status === "completed"}
									>
										Cancel
									</Button>
								</div>
							</div>

							<div className="grid gap-4 mt-4 md:grid-cols-4">
								<div className="rounded-lg border border-kumo-line p-3">
									<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Recipients</div>
									<div className="text-2xl font-semibold text-kumo-default mt-1">{campaign.total_recipients}</div>
								</div>
								<div className="rounded-lg border border-kumo-line p-3">
									<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Sent</div>
									<div className="text-2xl font-semibold text-kumo-default mt-1">{campaign.sent_recipients}</div>
								</div>
								<div className="rounded-lg border border-kumo-line p-3">
									<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Opens</div>
									<div className="text-2xl font-semibold text-kumo-default mt-1">{campaign.open_events}</div>
								</div>
								<div className="rounded-lg border border-kumo-line p-3">
									<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Clicks</div>
									<div className="text-2xl font-semibold text-kumo-default mt-1">{campaign.click_events}</div>
								</div>
							</div>

							<div className="flex justify-between items-center mt-4">
								<Button
									variant="ghost"
									size="sm"
									onClick={() => {
										setRecipientsPage(1);
										setSelectedCampaignId((prev) => prev === campaign.id ? null : campaign.id);
									}}
								>
									{selectedCampaignId === campaign.id ? "Hide recipients" : "View recipients"}
								</Button>
								<div className="text-xs text-kumo-subtle">
									Audience mode: {campaign.audience.mode}
								</div>
							</div>

							{selectedCampaignId === campaign.id && (
								<div className="mt-4 rounded-lg border border-kumo-line overflow-hidden">
									{recipientsData ? (
										<>
											<div className="divide-y divide-kumo-line">
												{recipientsData.recipients.map((recipient) => (
													<div key={recipient.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.4fr)_140px_160px_160px]">
														<div className="min-w-0">
															<div className="text-sm font-medium text-kumo-default truncate">{recipient.name}</div>
															<div className="text-sm text-kumo-subtle truncate">{recipient.email}</div>
														</div>
														<div className="text-sm text-kumo-subtle">
															<div className="font-medium text-kumo-strong">Status</div>
															<div className="mt-1">{recipient.status}</div>
														</div>
														<div className="text-sm text-kumo-subtle">
															<div className="font-medium text-kumo-strong">Sent at</div>
															<div className="mt-1">{recipient.sent_at || "-"}</div>
														</div>
														<div className="text-sm text-kumo-subtle">
															<div className="font-medium text-kumo-strong">Error</div>
															<div className="mt-1">{recipient.error_message || "-"}</div>
														</div>
													</div>
												))}
											</div>
											{recipientsData.totalCount > RECIPIENTS_PAGE_SIZE && (
												<div className="border-t border-kumo-line py-3 flex justify-center">
													<Pagination
														page={recipientsPage}
														setPage={setRecipientsPage}
														perPage={RECIPIENTS_PAGE_SIZE}
														totalCount={recipientsData.totalCount}
													/>
												</div>
											)}
										</>
									) : (
										<div className="flex justify-center py-8"><Loader size="lg" /></div>
									)}
								</div>
							)}
						</div>
					))}
				</div>
			) : (
				<Empty
					icon={<BroadcastIcon size={48} className="text-kumo-subtle" />}
					title="No campaigns yet"
					description={mailboxes.length === 0
						? "Create a mailbox first. Campaigns send through an existing mailbox and do not replace normal mailbox delivery."
						: "Create your first campaign to start batch or scheduled sending through an existing mailbox."}
					contents={
						<Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate} disabled={mailboxes.length === 0}>
							Create campaign
						</Button>
					}
				/>
			)}

			<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
				<Dialog size="lg" className="p-6 max-h-[90vh] overflow-y-auto">
					<Dialog.Title className="text-base font-semibold mb-5">
						{editingCampaign ? "Edit campaign" : "New campaign"}
					</Dialog.Title>
					<div className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							<Input label="Campaign name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
							<Select
								label="Mailbox"
								value={form.mailboxId}
								onValueChange={(value) => setForm((prev) => ({ ...prev, mailboxId: value || "" }))}
							>
								{mailboxes.map((mailbox) => (
									<Select.Option key={mailbox.email} value={mailbox.email}>
										{mailbox.email}
									</Select.Option>
								))}
							</Select>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<Select
								label="Template"
								value={form.templateId}
								onValueChange={(value) => setForm((prev) => ({ ...prev, templateId: value || "" }))}
							>
								<Select.Option value="">No linked template</Select.Option>
								{templates.map((template) => (
									<Select.Option key={template.id} value={template.id}>
										{template.name}
									</Select.Option>
								))}
							</Select>
							<Input
								label="Schedule time"
								type="datetime-local"
								value={form.scheduledAt}
								onChange={(e) => setForm((prev) => ({ ...prev, scheduledAt: e.target.value }))}
							/>
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<Input
								label="Subject override"
								value={form.subjectTemplate}
								onChange={(e) => setForm((prev) => ({ ...prev, subjectTemplate: e.target.value }))}
							/>
							<Input
								label="Throttle per minute"
								type="number"
								value={form.throttlePerMinute}
								onChange={(e) => setForm((prev) => ({ ...prev, throttlePerMinute: e.target.value }))}
							/>
						</div>
						<div>
							<label className="text-sm font-medium text-kumo-default block mb-1.5">HTML override</label>
							<textarea
								value={form.htmlTemplate}
								onChange={(e) => setForm((prev) => ({ ...prev, htmlTemplate: e.target.value }))}
								className="w-full min-h-[160px] rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label className="text-sm font-medium text-kumo-default block mb-1.5">Text override</label>
							<textarea
								value={form.textTemplate}
								onChange={(e) => setForm((prev) => ({ ...prev, textTemplate: e.target.value }))}
								className="w-full min-h-[100px] rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm"
							/>
						</div>
						<div className="grid gap-4 md:grid-cols-3">
							<Select
								label="Audience mode"
								value={form.audienceMode}
								onValueChange={(value) => setForm((prev) => ({ ...prev, audienceMode: value || "all" }))}
							>
								<Select.Option value="all">All active customers</Select.Option>
								<Select.Option value="customerIds">Specific customer IDs</Select.Option>
								<Select.Option value="tag">Tag filter</Select.Option>
							</Select>
							{form.audienceMode === "customerIds" ? (
								<div className="md:col-span-2">
									<Input
										label="Customer IDs"
										placeholder={customerOptions.slice(0, 3).map((customer) => customer.id).join(", ")}
										value={form.customerIds}
										onChange={(e) => setForm((prev) => ({ ...prev, customerIds: e.target.value }))}
									/>
								</div>
							) : form.audienceMode === "tag" ? (
								<div className="md:col-span-2">
									<Input
										label="Tag"
										placeholder="vip"
										value={form.tag}
										onChange={(e) => setForm((prev) => ({ ...prev, tag: e.target.value }))}
									/>
								</div>
							) : (
								<div className="md:col-span-2 rounded-md border border-dashed border-kumo-line px-3 py-2 text-sm text-kumo-subtle">
									All customers with status <code>active</code> will be queued when the campaign starts.
								</div>
							)}
						</div>
						<div className="grid gap-4 md:grid-cols-2">
							<label className="flex items-center gap-3 rounded-md border border-kumo-line px-3 py-2 text-sm text-kumo-default">
								<input type="checkbox" checked={form.trackOpens} onChange={(e) => setForm((prev) => ({ ...prev, trackOpens: e.target.checked }))} />
								Track opens
							</label>
							<label className="flex items-center gap-3 rounded-md border border-kumo-line px-3 py-2 text-sm text-kumo-default">
								<input type="checkbox" checked={form.trackClicks} onChange={(e) => setForm((prev) => ({ ...prev, trackClicks: e.target.checked }))} />
								Track clicks
							</label>
						</div>
					</div>
					<div className="flex justify-end gap-2 mt-6">
						<Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
						<Button variant="primary" onClick={saveCampaign} loading={createCampaign.isPending || updateCampaign.isPending}>
							{editingCampaign ? "Update campaign" : "Save campaign"}
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
