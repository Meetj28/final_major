import express, { Response, Request } from "express";
import dotenv from "dotenv";
import http from "http";
import cors from "cors";
import { SocketEvent, SocketId } from "./types/socket";
import { USER_CONNECTION_STATUS, User } from "./types/user";
import { Server } from "socket.io";
import path from "path";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

import FileModel from "./modals/File";
import DirectoryModel from "./modals/Directory";
import MessageModel from "./modals/Message";
import DrawingModel from "./modals/Drawing";
import RoomModel from "./modals/Room";
import UserModel from "./modals/User";

dotenv.config();

const app = express();

app.use(express.json());

app.use(cors());

app.use(express.static(path.join(__dirname, "public"))); // Serve static files

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/editor")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
  maxHttpBufferSize: 1e8,
  pingTimeout: 60000,
});

let userSocketMap: User[] = [];

// Function to get all users in a room
function getUsersInRoom(roomId: string): User[] {
  return userSocketMap.filter((user) => user.roomId == roomId);
}

// Function to get room id by socket id
function getRoomId(socketId: SocketId): string | null {
  const roomId = userSocketMap.find(
    (user) => user.socketId === socketId
  )?.roomId;

  if (!roomId) {
    console.error("Room ID is undefined for socket ID:", socketId);
    return null;
  }
  return roomId;
}

function getUserBySocketId(socketId: SocketId): User | null {
  const user = userSocketMap.find((user) => user.socketId === socketId);
  if (!user) {
    console.error("User not found for socket ID:", socketId);
    return null;
  }
  return user;
}

io.on("connection", (socket) => {
  // Handle user actions
  socket.on(SocketEvent.JOIN_REQUEST, async ({ roomId, username }) => {
    // Check is username exist in the room
    const isUsernameExist = getUsersInRoom(roomId).filter(
      (u) => u.username === username
    );
    if (isUsernameExist.length > 0) {
      io.to(socket.id).emit(SocketEvent.USERNAME_EXISTS);
      return;
    }

    const dbUser = await UserModel.create({
      id: uuidv4(),
      username,
      roomId,
      status: USER_CONNECTION_STATUS.ONLINE,
      cursorPosition: 0,
      typing: false,
      socketId: socket.id,
      currentFile: null,
    });

    // Find or create room
    let room = await RoomModel.findOne({ id: roomId });
    if (!room) {
      const rootDirectory = await DirectoryModel.create({
        id: uuidv4(),
        name: "root",
        children: [],
        subDirectories: [],
        parentDir: null,
        roomId: null, // updated later
      });
      room = await RoomModel.create({
        id: roomId,
        users: [dbUser._id],
        rootDirectory: rootDirectory._id,
      });
      await DirectoryModel.findOneAndUpdate(
        { id: rootDirectory.id },
        {
          roomId: room._id,
        }
      );
    } else {
      room.users.push(dbUser._id);
      await room.save();
    }

    const user = {
      username,
      roomId,
      status: USER_CONNECTION_STATUS.ONLINE,
      cursorPosition: 0,
      typing: false,
      socketId: socket.id,
      currentFile: null,
    };
    userSocketMap.push(user);
    socket.join(roomId);
    socket.broadcast.to(roomId).emit(SocketEvent.USER_JOINED, { user });
    const users = getUsersInRoom(roomId);
    io.to(socket.id).emit(SocketEvent.JOIN_ACCEPTED, { user, users });
  });

  socket.on("disconnecting", () => {
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_DISCONNECTED, { user });
    userSocketMap = userSocketMap.filter((u) => u.socketId !== socket.id);
    socket.leave(roomId);
  });

  // Handle file actions
  socket.on(
    SocketEvent.SYNC_FILE_STRUCTURE,
    ({ fileStructure, openFiles, activeFile, socketId }) => {
      io.to(socketId).emit(SocketEvent.SYNC_FILE_STRUCTURE, {
        fileStructure,
        openFiles,
        activeFile,
      });
    }
  );

  socket.on(
    SocketEvent.DIRECTORY_CREATED,
    async ({ parentDirId, newDirectory }) => {
      const roomId = getRoomId(socket.id);
      if (!roomId) return;

      const parentDir = await DirectoryModel.findOne({
        id: parentDirId,
      });
      if (!parentDir) return;

      const createdDir = await DirectoryModel.create({
        id: uuidv4(),
        name: newDirectory.name,
        children: [],
        subDirectories: [],
        parentDir: parentDirId,
        roomId: parentDir.roomId,
      });

      parentDir.subDirectories.push(createdDir._id);
      await parentDir.save();

      socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_CREATED, {
        parentDirId,
        newDirectory,
      });
    }
  );

  socket.on(SocketEvent.DIRECTORY_UPDATED, ({ dirId, children }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_UPDATED, {
      dirId,
      children,
    });
  });

  socket.on(SocketEvent.DIRECTORY_RENAMED, ({ dirId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_RENAMED, {
      dirId,
      newName,
    });
  });

  socket.on(SocketEvent.DIRECTORY_DELETED, ({ dirId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.DIRECTORY_DELETED, { dirId });
  });

  socket.on(SocketEvent.FILE_CREATED, async ({ parentDirId, newFile }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;

	const parentDir = await DirectoryModel.findOne({parentDir: parentDirId})
	if (!parentDir) return

	const createdFile = await FileModel.create({
		id: newFile.id,
		name: newFile.name,
		content: newFile.content || "",
		parentDir: parentDirId,
		roomId: parentDir.roomId,
	})

	parentDir.children.push(createdFile._id)
	await parentDir.save()

    socket.broadcast
      .to(roomId)
      .emit(SocketEvent.FILE_CREATED, { parentDirId, newFile });
  });

  socket.on(SocketEvent.FILE_UPDATED, async({ fileId, newContent }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;

	await FileModel.findOneAndUpdate({id: fileId}, { content: newContent })

    socket.broadcast.to(roomId).emit(SocketEvent.FILE_UPDATED, {
      fileId,
      newContent,
    });
  });

  socket.on(SocketEvent.FILE_RENAMED, ({ fileId, newName }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_RENAMED, {
      fileId,
      newName,
    });
  });

  socket.on(SocketEvent.FILE_DELETED, ({ fileId }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.FILE_DELETED, { fileId });
  });

  // Handle user status
  socket.on(SocketEvent.USER_OFFLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.OFFLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_OFFLINE, { socketId });
  });

  socket.on(SocketEvent.USER_ONLINE, ({ socketId }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socketId) {
        return { ...user, status: USER_CONNECTION_STATUS.ONLINE };
      }
      return user;
    });
    const roomId = getRoomId(socketId);
    if (!roomId) return;
    socket.broadcast.to(roomId).emit(SocketEvent.USER_ONLINE, { socketId });
  });

  // Handle chat actions
  socket.on(SocketEvent.SEND_MESSAGE, async ({ message }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;

	await MessageModel.create({
		id: uuidv4(),
		roomId,
		sender: message.sender,
		content: message.content,
		timestamp: new Date(),
	})

    socket.broadcast.to(roomId).emit(SocketEvent.RECEIVE_MESSAGE, { message });
  });

  // Handle cursor position
  socket.on(SocketEvent.TYPING_START, ({ cursorPosition }) => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: true, cursorPosition };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_START, { user });
  });

  socket.on(SocketEvent.TYPING_PAUSE, () => {
    userSocketMap = userSocketMap.map((user) => {
      if (user.socketId === socket.id) {
        return { ...user, typing: false };
      }
      return user;
    });
    const user = getUserBySocketId(socket.id);
    if (!user) return;
    const roomId = user.roomId;
    socket.broadcast.to(roomId).emit(SocketEvent.TYPING_PAUSE, { user });
  });

  socket.on(SocketEvent.REQUEST_DRAWING, () => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;
    socket.broadcast
      .to(roomId)
      .emit(SocketEvent.REQUEST_DRAWING, { socketId: socket.id });
  });

  socket.on(SocketEvent.SYNC_DRAWING, ({ drawingData, socketId }) => {
    socket.broadcast
      .to(socketId)
      .emit(SocketEvent.SYNC_DRAWING, { drawingData });
  });

  socket.on(SocketEvent.DRAWING_UPDATE, async ({ snapshot }) => {
    const roomId = getRoomId(socket.id);
    if (!roomId) return;

	await DrawingModel.findOneAndUpdate(
		{ roomId },
		{ snapshot, updatedAt: new Date() },
		{ upsert: true, new: true }
	)

    socket.broadcast.to(roomId).emit(SocketEvent.DRAWING_UPDATE, {
      snapshot,
    });
  });
});

const PORT = process.env.PORT || 3000;

app.get("/", (req: Request, res: Response) => {
  // Send the index.html file
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
