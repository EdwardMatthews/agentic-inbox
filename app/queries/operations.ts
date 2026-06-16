// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type {
	OperationsCampaign,
	OperationsCustomer,
	OperationsEvent,
	OperationsRecipient,
	OperationsTemplate,
	OperationsWebhook,
} from "~/types/operations";
import { queryKeys } from "./keys";

function invalidateOperations(qc: ReturnType<typeof useQueryClient>) {
	qc.invalidateQueries({ queryKey: queryKeys.operations.customers });
	qc.invalidateQueries({ queryKey: queryKeys.operations.templates });
	qc.invalidateQueries({ queryKey: queryKeys.operations.campaigns });
	qc.invalidateQueries({ queryKey: queryKeys.operations.webhooks });
	qc.invalidateQueries({ queryKey: ["operations", "events"] });
}

export function useOperationsCustomers(params: Record<string, string>) {
	return useQuery<{ customers: OperationsCustomer[]; totalCount: number }>({
		queryKey: [queryKeys.operations.customers, params],
		queryFn: () => api.listOperationsCustomers(params),
	});
}

export function useCreateOperationsCustomer() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: unknown) => api.createOperationsCustomer(body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useUpdateOperationsCustomer() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ customerId, body }: { customerId: string; body: unknown }) =>
			api.updateOperationsCustomer(customerId, body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useDeleteOperationsCustomer() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (customerId: string) => api.deleteOperationsCustomer(customerId),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useOperationsTemplates() {
	return useQuery<OperationsTemplate[]>({
		queryKey: queryKeys.operations.templates,
		queryFn: () => api.listOperationsTemplates(),
	});
}

export function useCreateOperationsTemplate() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: unknown) => api.createOperationsTemplate(body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useUpdateOperationsTemplate() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ templateId, body }: { templateId: string; body: unknown }) =>
			api.updateOperationsTemplate(templateId, body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useDeleteOperationsTemplate() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (templateId: string) => api.deleteOperationsTemplate(templateId),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function usePreviewOperationsTemplate() {
	return useMutation({
		mutationFn: (body: unknown) => api.previewOperationsTemplate(body),
	});
}

export function useOperationsCampaigns() {
	return useQuery<OperationsCampaign[]>({
		queryKey: queryKeys.operations.campaigns,
		queryFn: () => api.listOperationsCampaigns(),
		refetchInterval: 15_000,
		refetchOnWindowFocus: true,
	});
}

export function useCreateOperationsCampaign() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: unknown) => api.createOperationsCampaign(body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useUpdateOperationsCampaign() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ campaignId, body }: { campaignId: string; body: unknown }) =>
			api.updateOperationsCampaign(campaignId, body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useStartOperationsCampaign() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ campaignId, body }: { campaignId: string; body?: unknown }) =>
			api.startOperationsCampaign(campaignId, body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function usePauseOperationsCampaign() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (campaignId: string) => api.pauseOperationsCampaign(campaignId),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useResumeOperationsCampaign() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (campaignId: string) => api.resumeOperationsCampaign(campaignId),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useCancelOperationsCampaign() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (campaignId: string) => api.cancelOperationsCampaign(campaignId),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useOperationsRecipients(campaignId: string | undefined, page: number) {
	return useQuery<{ recipients: OperationsRecipient[]; totalCount: number }>({
		queryKey: campaignId
			? queryKeys.operations.recipients(campaignId, page)
			: ["operations", "recipients", "_disabled"],
		queryFn: () => api.listOperationsRecipients(campaignId!, {
			page: String(page),
			limit: "50",
		}),
		enabled: !!campaignId,
		refetchInterval: 15_000,
		refetchOnWindowFocus: true,
	});
}

export function useOperationsEvents(params: Record<string, string>) {
	return useQuery<{ events: OperationsEvent[]; totalCount: number }>({
		queryKey: queryKeys.operations.events(params),
		queryFn: () => api.listOperationsEvents(params),
		refetchInterval: 15_000,
		refetchOnWindowFocus: true,
	});
}

export function useOperationsWebhooks() {
	return useQuery<OperationsWebhook[]>({
		queryKey: queryKeys.operations.webhooks,
		queryFn: () => api.listOperationsWebhooks(),
	});
}

export function useCreateOperationsWebhook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: unknown) => api.createOperationsWebhook(body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useUpdateOperationsWebhook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ webhookId, body }: { webhookId: string; body: unknown }) =>
			api.updateOperationsWebhook(webhookId, body),
		onSuccess: () => invalidateOperations(qc),
	});
}

export function useDeleteOperationsWebhook() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (webhookId: string) => api.deleteOperationsWebhook(webhookId),
		onSuccess: () => invalidateOperations(qc),
	});
}

