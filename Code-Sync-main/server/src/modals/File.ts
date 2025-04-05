import mongoose from "mongoose"

const fileSchema = new mongoose.Schema({
	name: String,
	content: String,
	parentDir: { type: mongoose.Schema.Types.ObjectId, ref: "Directory" },
	roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
})

export default mongoose.model("File", fileSchema)
