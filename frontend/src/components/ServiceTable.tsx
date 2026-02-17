import { ServiceRow } from "@/components/ServiceRow";
import type { Service } from "@/types";

interface ServiceTableProps {
  services: Service[];
  onConfigure: (service: Service) => void;
}

export function ServiceTable({ services, onConfigure }: ServiceTableProps) {
  if (services.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500 text-lg">
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
