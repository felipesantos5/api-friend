export interface Service {
  _id: string;
  name: string;
  url: string;
  status: "online" | "offline";
  checkInterval: number;
  discordWebhook: string;
  coolifyWebhook: string;
  coolifyToken: string;
  lastFailAt: string | null;
  isDeploying: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StatusDay {
  date: string;
  online: number;
  offline: number;
  dominant: "online" | "offline" | null;
}

export interface CreateServicePayload {
  name: string;
  url: string;
  checkInterval?: number;
}

export interface UpdateServicePayload {
  name?: string;
  url?: string;
  checkInterval?: number;
  discordWebhook?: string;
  coolifyWebhook?: string;
  coolifyToken?: string;
}
