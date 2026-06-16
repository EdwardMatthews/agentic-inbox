// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "~/services/api";
import type { AuthenticatedUser, UserWithMemberships } from "~/types/operations";

const usersKey = ["global-settings", "users"] as const;

export function useUsers() {
	return useQuery<UserWithMemberships[]>({
		queryKey: usersKey,
		queryFn: () => api.listUsers(),
	});
}

export function useCreateUser() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (body: unknown) => api.createUser(body),
		onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
	});
}

export function useUpdateUser() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, body }: { userId: string; body: unknown }) => api.updateUser(userId, body),
		onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
	});
}

export function useSetUserMailboxMembership() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, body }: { userId: string; body: unknown }) =>
			api.setUserMailboxMembership(userId, body),
		onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
	});
}

export function useRemoveUserMailboxMembership() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ userId, mailboxId }: { userId: string; mailboxId: string }) =>
			api.removeUserMailboxMembership(userId, mailboxId),
		onSuccess: () => qc.invalidateQueries({ queryKey: usersKey }),
	});
}

