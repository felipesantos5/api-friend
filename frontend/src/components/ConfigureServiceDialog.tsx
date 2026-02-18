import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info, Globe } from "lucide-react";
import type { Service, UpdateServicePayload } from "@/types";

interface ConfigureServiceDialogProps {
  service: Service | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, payload: UpdateServicePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ConfigureServiceDialog({ service, open, onOpenChange, onSave, onDelete }: ConfigureServiceDialogProps) {
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [coolifyWebhook, setCoolifyWebhook] = useState("");
  const [coolifyToken, setCoolifyToken] = useState("");
  const [checkInterval, setCheckInterval] = useState("1");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (service) {
      setDiscordWebhook(service.discordWebhook);
      setCoolifyWebhook(service.coolifyWebhook);
      setCoolifyToken(service.coolifyToken);
      // Convert milliseconds to minutes for display
      setCheckInterval(Math.max(1, Math.round(service.checkInterval / 60000)).toString());
    }
  }, [service]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!service) return;
    setLoading(true);
    try {
      // Convert minutes to milliseconds
      const checkIntervalMs = (Number(checkInterval) || 1) * 60000;
      await onSave(service._id, {
        discordWebhook,
        coolifyWebhook,
        coolifyToken,
        checkInterval: checkIntervalMs
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!service) return;
    if (!confirm(`Delete "${service.name}"?`)) return;
    setLoading(true);
    try {
      await onDelete(service._id);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle>Configure {service?.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="discord">Discord Webhook</Label>
            <Input
              id="discord"
              value={discordWebhook}
              onChange={(e) => setDiscordWebhook(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="interval">Check Interval (minutes)</Label>
            <Input
              id="interval"
              type="number"
              min="1"
              value={checkInterval}
              onChange={(e) => setCheckInterval(e.target.value)}
              placeholder="1"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="coolify">Coolify Webhook</Label>
              <div className="group relative">
                <Info size={14} className="text-zinc-500 cursor-help hover:text-[#217ECE] transition-colors" />
                <div className="absolute left-0 bottom-full mb-2 w-64 p-2 bg-zinc-800 text-[10px] text-zinc-300 rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity border border-zinc-700 z-50">
                  Para segurança, a Coolify exige que o IP do servidor que faz a requisição seja autorizado.
                  Use o IP abaixo nas configurações do seu Webhook na Coolify.
                </div>
              </div>
            </div>
            <Input
              id="coolify"
              value={coolifyWebhook}
              onChange={(e) => setCoolifyWebhook(e.target.value)}
              placeholder="https://coolify.example.com/api/..."
              className="bg-zinc-800 border-zinc-700"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">Coolify Token</Label>
            <Input
              id="token"
              type="password"
              value={coolifyToken}
              onChange={(e) => setCoolifyToken(e.target.value)}
              placeholder="Bearer token"
              className="bg-zinc-800 border-zinc-700"
            />
          </div>

          <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
            <div className="flex items-start gap-3">
              <Globe className="w-4 h-4 text-[#217ECE] mt-0.5" />
              <div>
                <p className="text-[11px] font-medium text-zinc-300 uppercase tracking-wider mb-1">IP do Servidor (API)</p>
                <code className="text-[13px] text-[#217ECE] font-mono bg-zinc-950 px-2 py-0.5 rounded border border-white/5">
                  147.93.132.28
                </code>
                <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                  Adicione este IP na seção <span className="text-zinc-400 font-medium">"Whitelisted IPs"</span> do seu Webhook na Coolify (ou use <code className="text-zinc-400">0.0.0.0</code> se quiser permitir qualquer origem, embora seja menos seguro).
                </p>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-white">
              {loading ? "Saving..." : "Save"}
            </Button>
            <Button type="button" variant="destructive" disabled={loading} onClick={handleDelete}>
              Delete
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
