// models/HikvisionEvent.ts
import mongoose, { Schema, Document, Model } from "mongoose";

export interface IHikvisionEvent extends Document {
  deviceTime: Date;
  employeeId: string;
  name: string;
  cardNo: string;
  eventTypeMinor: number;
  operation: string;
  raw: any;
  createdAt: Date;
  updatedAt: Date;
}

const HikvisionEventSchema = new Schema<IHikvisionEvent>(
  {
    deviceTime: { type: Date, required: true },
    employeeId: { type: String, default: "" },
    name: { type: String, default: "" },
    cardNo: { type: String, default: "" },
    eventTypeMinor: { type: Number, required: true },
    operation: { type: String, default: "Unknown Event" },
    raw: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
  }
);

// Avoid duplicates – same emp + time + event
HikvisionEventSchema.index(
  { employeeId: 1, deviceTime: 1, eventTypeMinor: 1 },
  { unique: true, sparse: true }
);

const HikvisionEvent: Model<IHikvisionEvent> =
  mongoose.models.HikvisionEvent ||
  mongoose.model<IHikvisionEvent>("HikvisionEvent", HikvisionEventSchema);

export default HikvisionEvent;
