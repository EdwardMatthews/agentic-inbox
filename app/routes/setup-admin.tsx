// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Banner, Button, Input, Loader } from "@cloudflare/kumo";
import { ShieldCheckIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useBootstrapAdmin, useBootstrapStatus } from "~/queries/auth";

export default function SetupAdminRoute() {
	const navigate = useNavigate();
	const { data, isLoading } = useBootstrapStatus();
	const bootstrap = useBootstrapAdmin();
	const [form, setForm] = useState({
		name: "",
		email: "",
		password: "",
		confirmPassword: "",
	});
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (data && !data.bootstrapRequired) {
			navigate("/login", { replace: true });
		}
	}, [data, navigate]);

	const handleSetup = async () => {
		setError(null);
		if (form.password !== form.confirmPassword) {
			setError("Passwords do not match");
			return;
		}
		if (form.password.length < 12) {
			setError("Password must be at least 12 characters");
			return;
		}
		try {
			await bootstrap.mutateAsync({
				name: form.name,
				email: form.email,
				password: form.password,
			});
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
			<div className="w-full max-w-lg rounded-xl border border-kumo-line bg-kumo-base p-6 shadow-sm">
				<div className="flex items-center gap-3">
					<ShieldCheckIcon size={22} className="text-kumo-subtle" />
					<div>
						<h1 className="text-xl font-semibold text-kumo-default">Initialize admin account</h1>
						<p className="text-sm text-kumo-subtle">This one-time step replaces Cloudflare Access with a local administrator account.</p>
					</div>
				</div>

				<div className="mt-6 space-y-4">
					{error && <Banner variant="error" text={error} />}
					<Input label="Name" value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} />
					<Input label="Email" type="email" value={form.email} onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))} />
					<Input label="Password" type="password" value={form.password} onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))} />
					<Input label="Confirm password" type="password" value={form.confirmPassword} onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))} />
					<Button className="w-full" variant="primary" onClick={handleSetup} loading={bootstrap.isPending}>
						Create admin account
					</Button>
				</div>
			</div>
		</div>
	);
}

