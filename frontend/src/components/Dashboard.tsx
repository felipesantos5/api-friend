import { useState, useEffect, useCallback } from "react";
import { LogOut } from "lucide-react";
import { ServiceTable } from "@/components/ServiceTable";
import { AddServiceDialog } from "@/components/AddServiceDialog";
import { ConfigureServiceDialog } from "@/components/ConfigureServiceDialog";
import { getServices, createService, updateService, deleteService } from "@/lib/api";
import type { Service, CreateServicePayload, UpdateServicePayload } from "@/types";
import { auth } from "@/lib/firebase";
import logo from "@/assets/logo.png";

export function Dashboard() {
  const [services, setServices] = useState<Service[]>([]);
  const [configuring, setConfiguring] = useState<Service | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  // ... (rest of the logic remains same)

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
    <div className="min-h-screen bg-black text-zinc-100">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-12 border-b border-white/5 pb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 relative group">
              <div className="absolute -inset-1 bg-[#217ECE] rounded-full blur opacity-20 group-hover:opacity-40 transition duration-500"></div>
              <img src={logo} alt="Logo" className="relative w-full h-full object-contain" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight uppercase italic flex items-center gap-2">
                API <span className="text-[#217ECE]">Friend</span>
              </h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Sentinela Ativa</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button
              onClick={() => auth.signOut()}
              className="group flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-500 hover:text-white transition-colors"
            >
              <LogOut size={14} className="group-hover:text-[#217ECE] transition-colors" />
              Sair
            </button>
            <AddServiceDialog onAdd={handleAdd} />
          </div>
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
