import { Document } from "mongoose";

export interface IStatusLog extends Document {
  serviceId: string;
  status: "online" | "offline";
  checkedAt: Date;
}
