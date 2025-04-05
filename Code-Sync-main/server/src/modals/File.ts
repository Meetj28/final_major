import mongoose from "mongoose"

const fileSchema = new mongoose.Schema({
	id: { type: String, required: true },
    name: String,
	content: String,
	parentDir: { type: String, default: null },
	roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
})

export default mongoose.model("File", fileSchema)
