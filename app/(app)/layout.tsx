import { requireUser } from "@/lib/auth";
import { NavBar } from "@/components/NavBar";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser();

  return (
    <div className="min-h-screen flex flex-col">
      <NavBar session={session} />
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
