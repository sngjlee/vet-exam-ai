"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/hooks/useAuth";

export default function NavBar() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.refresh();
  }

  return (
    <header className="border-b border-neutral-800 px-6 py-3">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <Link href="/" className="font-semibold">
          Veterinary Exam AI
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/wrong-notes"
            className="text-neutral-400 hover:text-neutral-200"
          >
            Wrong Notes
          </Link>

          {!loading && (
            user ? (
              <>
                <span className="text-neutral-500">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="rounded border border-neutral-600 px-3 py-1 hover:border-neutral-400"
                >
                  Sign out
                </button>
              </>
            ) : (
              <Link
                href="/auth/login"
                className="rounded border border-neutral-600 px-3 py-1 hover:border-neutral-400"
              >
                Sign in
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  );
}
