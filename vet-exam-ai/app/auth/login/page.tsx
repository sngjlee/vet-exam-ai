"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "../../../lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setMessage(error.message);
      } else {
        router.push("/");
        router.refresh();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else if (data.session) {
        // Email confirmation is disabled — user is signed in immediately.
        router.push("/");
        router.refresh();
      } else {
        // Email confirmation is enabled — user must click the link.
        setMessage("Account created. Check your email for a confirmation link.");
      }
    }

    setLoading(false);
  }

  function toggleMode() {
    setMode((prev) => (prev === "signin" ? "signup" : "signin"));
    setMessage(null);
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <div className="mb-2 text-sm">
        <Link href="/" className="text-neutral-400 hover:text-neutral-200">
          ← Back
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold">
        {mode === "signin" ? "Sign in" : "Create account"}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-neutral-600 bg-transparent px-3 py-2"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="w-full rounded-lg border border-neutral-600 bg-transparent px-3 py-2"
          />
        </div>

        {message && (
          <p className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-white px-4 py-2 text-black disabled:opacity-50"
        >
          {loading
            ? "Loading…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>

      <button
        onClick={toggleMode}
        className="mt-4 text-sm text-neutral-400 hover:text-neutral-200"
      >
        {mode === "signin"
          ? "Don't have an account? Sign up"
          : "Already have an account? Sign in"}
      </button>
    </main>
  );
}
