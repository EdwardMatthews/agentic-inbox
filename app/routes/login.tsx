// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Input, Loader } from "@cloudflare/kumo";
import { LockKeyIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useBootstrapStatus, useLogin } from "~/queries/auth";

export default function LoginRoute() {
	const navigate = useNavigate();
	const { data, isLoading } = useBootstrapStatus();
	const login = useLogin();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (data?.bootstrapRequired) {
			navigate("/setup-admin", { replace: true });
		}
	}, [data?.bootstrapRequired, navigate]);

	const handleLogin = async () => {
		setError(null);
		try {
			await login.mutateAsync({ email, password });
			navigate("/", { replace: true });
		} catch (e) {
			setError((e as Error).message);
		}
	};

	if (isLoading) {
		return <div className="flex min-h-screen items-center justify-center"><Loader size="lg" /></div>;
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-kumo-recessed px-4">
			<div className="w-full max-w-md rounded-xl border border-kumo-line bg-kumo-base p-6 shadow-sm">
				<div className="flex items-center gap-3">
					<LockKeyIcon size={22} className="text-kumo-subtle" />
					<div>
						<h1 className="text-xl font-semibold text-kumo-default">Sign in</h1>
						<p className="text-sm text-kumo-subtle">Access your mailboxes and operations console with a local account.</p>
					</div>
				</div>

				<div className="mt-6 space-y-4">
					{error && <Banner variant="error" text={error} />}
					<Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
					<Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
					<Button className="w-full" variant="primary" onClick={handleLogin} loading={login.isPending}>
						Sign in
					</Button>
				</div>
			</div>
		</div>
	);
}

