import mongoose from "mongoose"

const DrawingSchema = new mongoose.Schema({
	roomId: String,
	snapshot: Object,
	updatedAt: { type: Date, default: Date.now },
})

export default mongoose.model("Drawing", DrawingSchema)
