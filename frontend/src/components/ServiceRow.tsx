import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { UptimeChart } from "@/components/UptimeChart";
import { getStatusLogs } from "@/lib/api";
import type { Service, StatusDay } from "@/types";

interface ServiceRowProps {
  service: Service;
  onConfigure: (service: Service) => void;
}

export function ServiceRow({ service, onConfigure }: ServiceRowProps) {
  const [days, setDays] = useState<StatusDay[]>([]);

  useEffect(() => {
    getStatusLogs(service._id).then(setDays).catch(() => { });
  }, [service._id, service.status]);

  return (
    <tr className="border-b border-zinc-800 hover:bg-zinc-900/50">
      <td className="px-4 py-3 font-medium text-base">{service.name}</td>
      <td className="px-4 py-3 text-sm text-zinc-400 max-w-[120px] sm:max-w-[300px] truncate">{service.url}</td>
      <td className="px-4 py-3">
        {service.status === "online" ? (
          <Badge className="bg-green-600/20 text-green-400 border-green-600/30 hover:bg-green-600/20">UP</Badge>
        ) : (
          <Badge className="bg-red-600/20 text-red-400 border-red-600/30 hover:bg-red-600/20">DOWN</Badge>
        )}
      </td>
      <td className="px-4 py-3">
        <UptimeChart days={days} />
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="sm" onClick={() => onConfigure(service)} className="text-zinc-400 hover:text-white">
          <Settings className="w-4 h-4" />
        </Button>
      </td>
    </tr>
  );
}
