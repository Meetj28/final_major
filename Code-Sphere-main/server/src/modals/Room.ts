import mongoose from "mongoose"

const roomSchema = new mongoose.Schema({
    id: { type: String, required: true },
	users: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
	rootDirectory: { type: mongoose.Schema.Types.ObjectId, ref: "Directory" },
})

export default mongoose.model("Room", roomSchema)
