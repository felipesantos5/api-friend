import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (service) {
      setDiscordWebhook(service.discordWebhook);
      setCoolifyWebhook(service.coolifyWebhook);
      setCoolifyToken(service.coolifyToken);
    }
  }, [service]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!service) return;
    setLoading(true);
    try {
      await onSave(service._id, { discordWebhook, coolifyWebhook, coolifyToken });
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
            <Label htmlFor="coolify">Coolify Webhook</Label>
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
          <div className="flex gap-2">
            <Button type="submit" disabled={loading} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white">
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
