/**
 * A tiny router. One active `Route` at a time, plus the one piece of
 * navigation state that needs a parameter: which VM's details page is open.
 * Dependency-free by design, same as every other Thomsen app.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { DEFAULT_ROUTE, type Route } from "@/config/navigation";

interface NavigationContextValue {
  route: Route;
  selectedVmId: string | null;
  navigate: (route: Route) => void;
  openVmDetails: (vmId: string) => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  const [selectedVmId, setSelectedVmId] = useState<string | null>(null);

  const navigate = useCallback((next: Route) => {
    setRoute((current) => (next === current ? current : next));
  }, []);

  const openVmDetails = useCallback((vmId: string) => {
    setSelectedVmId(vmId);
    setRoute("vm-details");
  }, []);

  const value = useMemo(() => ({ route, selectedVmId, navigate, openVmDetails }), [route, selectedVmId, navigate, openVmDetails]);

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationContextValue {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within <NavigationProvider>");
  return ctx;
}
