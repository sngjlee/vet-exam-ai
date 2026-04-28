import { requireAdmin } from "../../lib/admin/guards";
import { AdminSidebar } from "./_components/admin-sidebar";
import { AdminMobileDrawer } from "./_components/admin-mobile-drawer";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen" style={{ background: "var(--bg)" }}>
      <AdminSidebar />

      <div className="flex flex-1 flex-col min-w-0">
        <header
          className="flex md:hidden items-center justify-between px-4 py-2"
          style={{ borderBottom: "1px solid var(--rule)", background: "var(--bg)" }}
        >
          <AdminMobileDrawer />
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text)" }}
          >
            운영자 콘솔
          </span>
          <span style={{ width: 44 }} aria-hidden />
        </header>

        <main className="flex-1 min-w-0 px-4 md:px-8 py-6">{children}</main>
      </div>
    </div>
  );
}
