import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-6">
          <span className="font-semibold">📺 Signage Admin</span>
          <nav className="flex gap-4 text-sm">
            <Link href="/admin" className="hover:underline">
              Dashboard
            </Link>
            <Link href="/admin/blocks" className="hover:underline">
              Block Library
            </Link>
            <Link href="/admin/categories" className="hover:underline">
              Categories
            </Link>
            <Link href="/admin/data-sources" className="hover:underline">
              Data Sources
            </Link>
            <Link href="/admin/templates" className="hover:underline">
              Templates
            </Link>
          </nav>
          <a href="/player" target="_blank" className="ml-auto text-sm text-indigo-600 hover:underline">
            Open Player ↗
          </a>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
