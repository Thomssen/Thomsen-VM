import { useNavigation } from "@/state/NavigationProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardPage } from "@/pages/DashboardPage";
import { VirtualMachinesPage } from "@/pages/VirtualMachinesPage";
import { CreateVmWizard } from "@/pages/createvm/CreateVmWizard";
import { SnapshotsPage } from "@/pages/SnapshotsPage";
import { SystemPage } from "@/pages/SystemPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { VmDetailsPage } from "@/pages/vmdetails/VmDetailsPage";

export function RouteView() {
  const { route } = useNavigation();

  return (
    <ErrorBoundary resetKey={route}>
      <div className="routeview" key={route}>
        {route === "dashboard" && <DashboardPage />}
        {route === "vms" && <VirtualMachinesPage />}
        {route === "create-vm" && <CreateVmWizard />}
        {route === "snapshots" && <SnapshotsPage />}
        {route === "system" && <SystemPage />}
        {route === "settings" && <SettingsPage />}
        {route === "vm-details" && <VmDetailsPage />}
      </div>
    </ErrorBoundary>
  );
}
