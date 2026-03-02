import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { UptimeChart } from "@/components/UptimeChart";
import { getStatusLogs } from "@/lib/api";
import type { Service, StatusDay } from "@/types";

interface ServiceRowProps {
  service: Service;
  onConfigure: (service: Service) => void;
  onToggleActive: (service: Service, isActive: boolean) => void;
}

export function ServiceRow({ service, onConfigure, onToggleActive }: ServiceRowProps) {
  const [days, setDays] = useState<StatusDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getStatusLogs(service._id)
      .then(setDays)
      .catch(() => { })
      .finally(() => setIsLoading(false));
  }, [service._id, service.status]);

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-900/50">
      <td className="px-4 py-3 font-medium text-base">{service.name}</td>
      <td className="px-4 py-3 text-sm text-zinc-400 max-w-[120px] sm:max-w-[300px] truncate">{service.url}</td>
      <td className="px-4 py-3">
        {!service.isActive ? (
          <Badge className="bg-zinc-600/20 text-zinc-400 border-zinc-600/30 hover:bg-zinc-600/20">PAUSADO</Badge>
        ) : service.status === "online" ? (
          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600/20">ONLINE</Badge>
        ) : (
          <Badge className="bg-red-600/20 text-red-400 border-red-600/30 hover:bg-red-600/20">OFFLINE</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        {isLoading ? (
          <div className="flex items-center justify-center gap-[3px] animate-pulse">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="w-[8px] h-[24px] bg-zinc-800 rounded-[2px]" />
            ))}
          </div>
        ) : (
          <UptimeChart days={days} currentStatus={service.status} />
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <Switch
          checked={service.isActive ?? true}
          onCheckedChange={(checked) => onToggleActive(service, checked)}
        />
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="sm" onClick={() => onConfigure(service)} className="text-zinc-400 hover:text-white">
          <Settings className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
}
