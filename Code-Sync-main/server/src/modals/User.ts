import mongoose from "mongoose"

const userSchema = new mongoose.Schema({
	username: String,
    roomId: String,
	status: String,
	cursorPosition: Number,
	typing: Boolean,
	socketId: String,
	currentFile: String,
})

export default mongoose.model("User", userSchema)
