import mongoose, { Schema } from "mongoose";
import { IStatusLog } from "../interfaces/IStatusLog";

const StatusLogSchema = new Schema<IStatusLog>({
  serviceId: { type: String, required: true, index: true },
  status: { type: String, enum: ["online", "offline"], required: true },
  checkedAt: { type: Date, required: true, index: true },
});

StatusLogSchema.index({ serviceId: 1, checkedAt: -1 });

export default mongoose.model<IStatusLog>("StatusLog", StatusLogSchema);
