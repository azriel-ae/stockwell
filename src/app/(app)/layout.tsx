import { cookies } from "next/headers";
import { MobileHeader, Sidebar } from "@/components/sidebar";
import { ToastProvider } from "@/components/ui";
import { UnlockScreen } from "@/components/unlock-screen";
import { SESSION_COOKIE, isAccessProtected, validSessionCookie } from "@/lib/http";

export const dynamic = "force-dynamic";

/**
 * App shell: sidebar (desktop), top bar + drawer (mobile), toast layer.
 * When STOCKWELL_ACCESS_TOKEN is set, the whole app is gated behind an
 * unlock screen (the token itself never reaches the browser).
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const protectedByToken = isAccessProtected();
  let unlocked = true;
  if (protectedByToken) {
    const jar = await cookies();
    unlocked = validSessionCookie(jar.get(SESSION_COOKIE)?.value);
  }

  if (!unlocked) {
    return <UnlockScreen />;
  }

  return (
    <ToastProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
