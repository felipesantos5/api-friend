import { ServiceRow } from "@/components/ServiceRow";
import type { Service } from "@/types";
import { Loader2 } from "lucide-react";

interface ServiceTableProps {
  services: Service[];
  isLoading: boolean;
  onConfigure: (service: Service) => void;
}

export function ServiceTable({ services, isLoading, onConfigure }: ServiceTableProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-zinc-500">
        <Loader2 className="w-8 h-8 animate-spin mb-4 text-[#217ECE]" />
      </div>
    );
  }

  if (services.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500 text-lg border border-dashed border-zinc-800 rounded-lg">
        No services yet. Add one to start monitoring.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-800 scrollbar-thin scrollbar-thumb-zinc-800 scrollbar-track-transparent">
      <table className="w-full min-w-[500px] transition-all">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50">
            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Name</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">URL</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">Status</th>
            <th className="px-4 py-3 text-left text-sm font-medium text-zinc-400">7-day</th>
            <th className="px-4 py-3 text-right text-sm font-medium text-zinc-400 tracking-widest">Actions</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <ServiceRow key={service._id} service={service} onConfigure={onConfigure} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
