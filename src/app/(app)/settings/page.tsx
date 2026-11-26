import { SettingsView } from "@/components/settings-view";
import { getSettings } from "@/lib/services/settings.service";
import { fromDrivebaseError } from "@/lib/services/errors";
import { SetupNotice } from "@/components/setup-notice";

export const dynamic = "force-dynamic";
export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  try {
    const settings = await getSettings();
    return <SettingsView initial={settings} />;
  } catch (err) {
    const serviceError = fromDrivebaseError(err);
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-charcoal">Settings</h1>
          <p className="mt-0.5 text-xs text-mutedslate">Application preferences.</p>
        </div>
        <SetupNotice title="Settings are unavailable" detail={serviceError.message} />
      </div>
    );
  }
}
