import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import AccountInfo from "./_components/AccountInfo";
import AccountDeletionForm from "./_components/AccountDeletionForm";
import PasswordChangeForm from "./_components/PasswordChangeForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "설정 — KVLE" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/settings");
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "32px 20px 80px",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontSize: 32,
          fontWeight: 800,
          margin: 0,
          marginBottom: 24,
          color: "var(--text)",
        }}
      >
        설정
      </h1>
      <AccountInfo />
      <PasswordChangeForm />
      <AccountDeletionForm email={user.email ?? ""} />
    </main>
  );
}
