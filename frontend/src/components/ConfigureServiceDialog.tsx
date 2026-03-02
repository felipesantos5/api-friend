import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Info, Globe, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Service, UpdateServicePayload } from "@/types";

interface ConfigureServiceDialogProps {
  service: Service | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (id: string, payload: UpdateServicePayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function ConfigureServiceDialog({ service, open, onOpenChange, onSave, onDelete }: ConfigureServiceDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [discordWebhook, setDiscordWebhook] = useState("");
  const [coolifyWebhook, setCoolifyWebhook] = useState("");
  const [coolifyToken, setCoolifyToken] = useState("");
  const [checkInterval, setCheckInterval] = useState("1");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showIpInfo, setShowIpInfo] = useState(false);

  useEffect(() => {
    if (service) {
      setName(service.name);
      setUrl(service.url);
      setDiscordWebhook(service.discordWebhook);
      setCoolifyWebhook(service.coolifyWebhook);
      setCoolifyToken(service.coolifyToken);
      setIsActive(service.isActive ?? true);
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
        name,
        url,
        discordWebhook,
        coolifyWebhook,
        coolifyToken,
        checkInterval: checkIntervalMs,
        isActive
      });
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!service) return;
    if (!confirm(`Excluir "${service.name}"?`)) return;
    setLoading(true);
    try {
      await onDelete(service._id);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="bg-zinc-900 border-zinc-800">
          <DialogHeader>
            <DialogTitle>Configurar {service?.name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome do Serviço</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Minha API"
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="interval">Intervalo (minutos)</Label>
                <Input
                  id="interval"
                  type="number"
                  min="1"
                  value={checkInterval}
                  onChange={(e) => setCheckInterval(e.target.value)}
                  placeholder="1"
                  className="bg-zinc-800 border-zinc-700"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="url">Link da API (Health Check)</Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://api.exemplo.com/health"
                className="bg-zinc-800 border-zinc-700"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="discord">Webhook do Discord</Label>
              <Input
                id="discord"
                value={discordWebhook}
                onChange={(e) => setDiscordWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/..."
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="coolify">Webhook do Coolify</Label>
                <button
                  type="button"
                  onClick={() => setShowIpInfo(true)}
                  className="text-zinc-500 hover:text-[#217ECE] transition-colors focus:outline-none"
                  title="Informações de Segurança"
                >
                  <Info size={14} className="cursor-pointer" />
                </button>
              </div>
              <Input
                id="coolify"
                value={coolifyWebhook}
                onChange={(e) => setCoolifyWebhook(e.target.value)}
                placeholder="https://coolify.exemplo.com/api/..."
                className="bg-zinc-800 border-zinc-700"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="token">Token do Coolify</Label>
              <Input
                id="token"
                type="password"
                value={coolifyToken}
                onChange={(e) => setCoolifyToken(e.target.value)}
                placeholder="Token Bearer"
                className="bg-zinc-800 border-zinc-700"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-800/50 border border-zinc-800">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <ShieldCheck size={14} className="text-[#217ECE]" />
                  Monitoramento Ativo
                </Label>
                <p className="text-[10px] text-zinc-500">Habilite para continuar checando o status automaticamente.</p>
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-primary/90 text-white">
                {loading ? "Salvando..." : "Salvar"}
              </Button>
              <Button type="button" variant="destructive" disabled={loading} onClick={handleDelete}>
                Excluir
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* IP Info Modal */}
      <Dialog open={showIpInfo} onOpenChange={setShowIpInfo}>
        <DialogContent className="bg-zinc-900 border-zinc-800 max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-[#217ECE]" />
              Segurança do Webhook
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-zinc-400 leading-relaxed">
              Para sua segurança, a Coolify exige que você autorize o IP do servidor que enviará as requisições.
            </p>

            <div className="bg-zinc-950 border border-white/5 rounded-lg p-4 space-y-2">
              <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest text-center">IP do Servidor (API)</p>
              <div className="flex items-center justify-center gap-2">
                <code className="text-lg text-[#217ECE] font-mono font-bold tracking-tighter">
                  147.93.132.28
                </code>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Adicione este IP no campo <span className="text-zinc-300 font-medium whitespace-nowrap">"Whitelisted IPs"</span> nas configurações do Webhook dentro do painel da Coolify.
              </p>
              <p className="text-[10px] text-zinc-600 italic">
                * O uso de 0.0.0.0 permite qualquer origem mas é menos seguro.
              </p>
            </div>

            <Button
              onClick={() => setShowIpInfo(false)}
              className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border-zinc-700"
            >
              Entendi
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
