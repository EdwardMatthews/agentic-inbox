// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Dialog, Empty, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import { EyeIcon, FilesIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import EmailIframe from "~/components/EmailIframe";
import { useMailboxes } from "~/queries/mailboxes";
import {
	useCreateOperationsTemplate,
	useDeleteOperationsTemplate,
	useOperationsTemplates,
	usePreviewOperationsTemplate,
	useUpdateOperationsTemplate,
} from "~/queries/operations";
import type { OperationsTemplate } from "~/types/operations";

export default function OperationsTemplatesRoute() {
	const toastManager = useKumoToastManager();
	const { data: templates = [], isLoading } = useOperationsTemplates();
	const { data: mailboxes = [] } = useMailboxes();
	const createTemplate = useCreateOperationsTemplate();
	const updateTemplate = useUpdateOperationsTemplate();
	const deleteTemplate = useDeleteOperationsTemplate();
	const previewTemplate = usePreviewOperationsTemplate();
	const [editingTemplate, setEditingTemplate] = useState<OperationsTemplate | null>(null);
	const [isOpen, setIsOpen] = useState(false);
	const [preview, setPreview] = useState<{ subject: string; html: string; text: string } | null>(null);
	const [previewMode, setPreviewMode] = useState<"rendered" | "source">("rendered");
	const [form, setForm] = useState({
		name: "",
		description: "",
		subjectTemplate: "",
		htmlTemplate: "",
		textTemplate: "",
		previewData: "{}",
	});

	const firstMailboxId = mailboxes[0]?.email || "";

	const openCreate = () => {
		setEditingTemplate(null);
		setPreview(null);
		setPreviewMode("rendered");
		setForm({
			name: "",
			description: "",
			subjectTemplate: "",
			htmlTemplate: "",
			textTemplate: "",
			previewData: "{}",
		});
		setIsOpen(true);
	};

	const openEdit = (template: OperationsTemplate) => {
		setEditingTemplate(template);
		setPreview(null);
		setPreviewMode("rendered");
		setForm({
			name: template.name,
			description: template.description || "",
			subjectTemplate: template.subject_template,
			htmlTemplate: template.html_template,
			textTemplate: template.text_template,
			previewData: JSON.stringify(template.preview_data || {}, null, 2),
		});
		setIsOpen(true);
	};

	const parsedPreviewData = useMemo(() => {
		try {
			return JSON.parse(form.previewData || "{}");
		} catch {
			return {};
		}
	}, [form.previewData]);

	const saveTemplate = async () => {
		const body = {
			name: form.name,
			description: form.description || undefined,
			subjectTemplate: form.subjectTemplate,
			htmlTemplate: form.htmlTemplate,
			textTemplate: form.textTemplate,
			previewData: parsedPreviewData,
		};

		try {
			if (editingTemplate) {
				await updateTemplate.mutateAsync({ templateId: editingTemplate.id, body });
				toastManager.add({ title: "Template updated" });
			} else {
				await createTemplate.mutateAsync(body);
				toastManager.add({ title: "Template created" });
			}
			setIsOpen(false);
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const runPreview = async () => {
		if (!firstMailboxId) {
			toastManager.add({ title: "Create a mailbox first to preview templates.", variant: "error" });
			return;
		}

		try {
			const result = await previewTemplate.mutateAsync({
				templateId: editingTemplate?.id,
				mailboxId: firstMailboxId,
				subjectTemplate: form.subjectTemplate,
				htmlTemplate: form.htmlTemplate,
				textTemplate: form.textTemplate,
				previewData: parsedPreviewData,
				trackOpens: true,
				trackClicks: true,
			});
			setPreview(result);
			setPreviewMode("rendered");
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	const handleDelete = async (template: OperationsTemplate) => {
		if (!window.confirm(`Delete template "${template.name}"?`)) return;
		try {
			await deleteTemplate.mutateAsync(template.id);
			toastManager.add({ title: "Template deleted" });
		} catch (e) {
			toastManager.add({ title: (e as Error).message, variant: "error" });
		}
	};

	return (
		<div className="space-y-5">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold text-kumo-default">Templates</h2>
					<p className="text-sm text-kumo-subtle mt-1">
						Store reusable subject, HTML, and text layouts with variable interpolation for campaigns.
					</p>
				</div>
				<Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate}>
					New template
				</Button>
			</div>

			{isLoading ? (
				<div className="flex justify-center py-16"><Loader size="lg" /></div>
			) : templates.length > 0 ? (
				<div className="grid gap-4 lg:grid-cols-2">
					{templates.map((template) => (
						<div key={template.id} className="rounded-xl border border-kumo-line bg-kumo-base p-5">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<div className="text-base font-semibold text-kumo-default truncate">
										{template.name}
									</div>
									{template.description && (
										<div className="text-sm text-kumo-subtle mt-1">{template.description}</div>
									)}
								</div>
								<Badge variant="outline">Template</Badge>
							</div>
							<div className="mt-4 space-y-2 text-sm">
								<div>
									<div className="text-kumo-subtle">Subject</div>
									<div className="font-medium text-kumo-strong truncate">{template.subject_template}</div>
								</div>
								<div>
									<div className="text-kumo-subtle">Preview variables</div>
									<pre className="mt-1 rounded bg-kumo-recessed p-3 text-xs text-kumo-strong overflow-x-auto">
										{JSON.stringify(template.preview_data || {}, null, 2)}
									</pre>
								</div>
							</div>
							<div className="flex justify-end gap-2 mt-4">
								<Button variant="secondary" size="sm" icon={<EyeIcon size={14} />} onClick={() => openEdit(template)}>
									Edit / preview
								</Button>
								<Button
									variant="ghost"
									size="sm"
									shape="square"
									icon={<TrashIcon size={16} />}
									onClick={() => handleDelete(template)}
									aria-label={`Delete ${template.name}`}
								/>
							</div>
						</div>
					))}
				</div>
			) : (
				<Empty
					icon={<FilesIcon size={48} className="text-kumo-subtle" />}
					title="No templates yet"
					description="Create reusable content blocks so campaigns can be scheduled and personalized quickly."
					contents={
						<Button variant="primary" icon={<PlusIcon size={16} />} onClick={openCreate}>
							Create template
						</Button>
					}
				/>
			)}

			<Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
				<Dialog size="lg" className="p-6 max-h-[90vh] overflow-y-auto">
					<Dialog.Title className="text-base font-semibold mb-5">
						{editingTemplate ? "Edit template" : "New template"}
					</Dialog.Title>
					<div className="space-y-4">
						<div className="grid gap-4 md:grid-cols-2">
							<Input label="Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
							<Input label="Description" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
						</div>
						<Input label="Subject template" value={form.subjectTemplate} onChange={(e) => setForm((prev) => ({ ...prev, subjectTemplate: e.target.value }))} />
						<div>
							<label className="text-sm font-medium text-kumo-default block mb-1.5">HTML template</label>
							<textarea
								value={form.htmlTemplate}
								onChange={(e) => setForm((prev) => ({ ...prev, htmlTemplate: e.target.value }))}
								className="w-full min-h-[220px] rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label className="text-sm font-medium text-kumo-default block mb-1.5">Text template</label>
							<textarea
								value={form.textTemplate}
								onChange={(e) => setForm((prev) => ({ ...prev, textTemplate: e.target.value }))}
								className="w-full min-h-[120px] rounded-md border border-kumo-line bg-kumo-base px-3 py-2 text-sm"
							/>
						</div>
						<div>
							<label className="text-sm font-medium text-kumo-default block mb-1.5">Preview data (JSON)</label>
							<textarea
								value={form.previewData}
								onChange={(e) => setForm((prev) => ({ ...prev, previewData: e.target.value }))}
								className="w-full min-h-[140px] rounded-md border border-kumo-line bg-kumo-base px-3 py-2 font-mono text-xs"
							/>
						</div>
						<div className="flex gap-2">
							<Button variant="secondary" icon={<EyeIcon size={14} />} onClick={runPreview} loading={previewTemplate.isPending}>
								Preview render
							</Button>
						</div>
						{preview && (
							<div className="rounded-lg border border-kumo-line bg-kumo-recessed p-4 space-y-3">
								<div>
									<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Subject</div>
									<div className="text-sm text-kumo-default mt-1">{preview.subject}</div>
								</div>
								<div>
									<div className="flex items-center justify-between gap-3">
										<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">
											{previewMode === "rendered" ? "Rendered Preview" : "HTML Source"}
										</div>
										<div className="flex items-center gap-2">
											<Button
												variant={previewMode === "rendered" ? "secondary" : "ghost"}
												size="sm"
												onClick={() => setPreviewMode("rendered")}
											>
												Rendered
											</Button>
											<Button
												variant={previewMode === "source" ? "secondary" : "ghost"}
												size="sm"
												onClick={() => setPreviewMode("source")}
											>
												Source
											</Button>
										</div>
									</div>
									{previewMode === "rendered" ? (
										<div className="mt-2 rounded bg-kumo-base p-3">
											<EmailIframe body={preview.html} autoSize />
										</div>
									) : (
										<pre className="mt-2 rounded bg-kumo-base p-3 text-xs overflow-x-auto whitespace-pre-wrap">{preview.html}</pre>
									)}
								</div>
								<div>
									<div className="text-xs uppercase tracking-wider text-kumo-subtle font-semibold">Text output</div>
									<pre className="mt-1 rounded bg-kumo-base p-3 text-xs overflow-x-auto whitespace-pre-wrap">{preview.text}</pre>
								</div>
							</div>
						)}
					</div>
					<div className="flex justify-end gap-2 mt-6">
						<Button variant="secondary" onClick={() => setIsOpen(false)}>Cancel</Button>
						<Button variant="primary" onClick={saveTemplate} loading={createTemplate.isPending || updateTemplate.isPending}>
							Save template
						</Button>
					</div>
				</Dialog>
			</Dialog.Root>
		</div>
	);
}
