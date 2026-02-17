import { useState, useEffect, useCallback } from "react";
import { Activity } from "lucide-react";
import { ServiceTable } from "@/components/ServiceTable";
import { AddServiceDialog } from "@/components/AddServiceDialog";
import { ConfigureServiceDialog } from "@/components/ConfigureServiceDialog";
import { getServices, createService, updateService, deleteService } from "@/lib/api";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@/types";

export function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [configuring, setConfiguring] = useState<Service | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const fetchServices = useCallback(async () => {
    try {
      const data = await getServices();
      setServices(data);
    } catch (err) {
      console.error("Failed to fetch services:", err);
    }
  }, []);

  useEffect(() => {
    fetchServices();
    const id = setInterval(fetchServices, 15000);
    return () => clearInterval(id);
  }, [fetchServices]);

  async function handleAdd(payload: CreateServicePayload) {
    await createService(payload);
    await fetchServices();
  }

  async function handleSave(id: string, payload: UpdateServicePayload) {
    await updateService(id, payload);
    await fetchServices();
  }

  async function handleDelete(id: string) {
    await deleteService(id);
    await fetchServices();
  }

  function handleConfigure(service: Service) {
    setConfiguring(service);
    setConfigOpen(true);
  }

  const onlineCount = services.filter((s) => s.status === "online").length;
  const offlineCount = services.filter((s) => s.status === "offline").length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Activity className="w-7 h-7 text-indigo-500" />
            <h1 className="text-2xl font-bold">API Friend</h1>
          </div>
          <AddServiceDialog onAdd={handleAdd} />
        </div>

        {/* Stats */}
        <div className="flex gap-4 mb-6">
          <div className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm">
            <span className="text-zinc-400">Total:</span>{" "}
            <span className="font-medium">{services.length}</span>
          </div>
          <div className="px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm">
            <span className="text-green-400">Online:</span>{" "}
            <span className="font-medium">{onlineCount}</span>
          </div>
          {offlineCount > 0 && (
            <div className="px-4 py-2 rounded-lg bg-red-950/50 border border-red-900/50 text-sm">
              <span className="text-red-400">Offline:</span>{" "}
              <span className="font-medium">{offlineCount}</span>
            </div>
          )}
        </div>

        {/* Table */}
        <ServiceTable services={services} onConfigure={handleConfigure} />

        {/* Configure Dialog */}
        <ConfigureServiceDialog
          service={configuring}
          open={configOpen}
          onOpenChange={setConfigOpen}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </div>
    </div>
  );
}
