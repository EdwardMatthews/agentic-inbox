// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { ManagedApiKey, ManagedApiKeyCreateResult } from "~/types/operations";

const apiKeyQueryKey = ["global-settings", "api-keys"] as const;

export function useApiKeys() {
	return useQuery<ManagedApiKey[]>({
		queryKey: apiKeyQueryKey,
		queryFn: () => api.listApiKeys(),
	});
}

export function useCreateApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: unknown) => api.createApiKey(body),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: apiKeyQueryKey });
		},
	});
}

export function useRevokeApiKey() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (apiKeyId: string) => api.revokeApiKey(apiKeyId),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: apiKeyQueryKey });
		},
	});
}

