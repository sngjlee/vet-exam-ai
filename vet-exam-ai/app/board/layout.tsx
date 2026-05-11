import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    redirect("/auth/login?next=/board");
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("signup_status")
    .eq("id", userRes.user.id)
    .single();
  if (!profile || profile.signup_status !== "approved") {
    redirect("/auth/pending-proof");
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">공지·건의</h1>
      <p className="mt-1 text-sm text-gray-600">운영자 공지와 사용자 건의를 한 곳에서.</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}
