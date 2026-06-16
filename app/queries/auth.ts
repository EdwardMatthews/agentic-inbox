// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { AuthenticatedUser } from "~/types/operations";

const authSessionKey = ["auth", "session"] as const;
const bootstrapStatusKey = ["auth", "bootstrap-status"] as const;

export function useBootstrapStatus() {
	return useQuery<{ bootstrapRequired: boolean }>({
		queryKey: bootstrapStatusKey,
		queryFn: () => api.getBootstrapStatus(),
		staleTime: 30_000,
	});
}

export function useAuthSession() {
	return useQuery<{ user: AuthenticatedUser | null }>({
		queryKey: authSessionKey,
		queryFn: () => api.getSession(),
		retry: false,
	});
}

export function useLogin() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: { email: string; password: string }) => api.login(body),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: authSessionKey });
			qc.invalidateQueries({ queryKey: bootstrapStatusKey });
		},
	});
}

export function useLogout() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => api.logout(),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: authSessionKey });
		},
	});
}

export function useBootstrapAdmin() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: { email: string; name: string; password: string }) => api.bootstrapAdmin(body),
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: authSessionKey });
			qc.invalidateQueries({ queryKey: bootstrapStatusKey });
		},
	});
}

