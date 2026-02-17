import { Document } from "mongoose";

export interface IService extends Document {
  userId: string;
  name: string;
  url: string;
  status: "online" | "offline";
  checkInterval: number;
  discordWebhook: string;
  coolifyWebhook: string;
  coolifyToken: string;
  lastFailAt: Date | null;
  isDeploying: boolean;
}
