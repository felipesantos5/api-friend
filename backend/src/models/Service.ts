import mongoose, { Schema } from "mongoose";
import { IService } from "../interfaces/IService";

const ServiceSchema = new Schema<IService>(
  {
    userId: { type: String, required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    status: { type: String, enum: ["online", "offline"], default: "online" },
    checkInterval: { type: Number, default: 3000 },
    discordWebhook: { type: String, default: "" },
    coolifyWebhook: { type: String, default: "" },
    coolifyToken: { type: String, default: "" },
    lastFailAt: { type: Date, default: null },
    isDeploying: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model<IService>("Service", ServiceSchema);
