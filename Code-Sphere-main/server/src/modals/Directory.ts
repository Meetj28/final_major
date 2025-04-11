import mongoose from "mongoose"

const directorySchema = new mongoose.Schema({
    id: { type: String, required: true }, 
	name: String,
	children: [{ type: mongoose.Schema.Types.ObjectId, ref: "File" }],
	subDirectories: [{ type: mongoose.Schema.Types.ObjectId, ref: "Directory" }],
	parentDir: { type: String, default: null },
	roomId: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
})

export default mongoose.model("Directory", directorySchema)
