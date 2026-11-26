import { ConnectionView } from "@/components/connection-view";
import { testConnection } from "@/lib/services/connection.service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Drivebase connection" };

export default async function ConnectionPage() {
  // A real round-trip on every page load — the status is never assumed.
  const report = await testConnection();
  return <ConnectionView initial={report} />;
}
