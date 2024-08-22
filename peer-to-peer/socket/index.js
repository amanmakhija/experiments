const express = require("express");
const app = express();
const cors = require("cors");
app.use(cors());

const server = require("http").Server(app);
const io = require("socket.io")(server);

let users = {}; // Store users by userId

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Handle user joining with a userId
  socket.on("join", (userId) => {
    users[userId] = socket.id;
    console.log("Users after join:", users);

    // Send the updated list of connected peers to everyone
    io.emit("update-user-list", Object.keys(users));
  });

  // Handle offers and answers for WebRTC signaling
  socket.on("offer", (data) => {
    const targetSocketId = users[data.target];
    if (targetSocketId) {
      io.to(targetSocketId).emit("offer", data);
    }
  });

  socket.on("answer", (data) => {
    const targetSocketId = users[data.target];
    if (targetSocketId) {
      io.to(targetSocketId).emit("answer", data);
    }
  });

  socket.on("ice-candidate", (data) => {
    const targetSocketId = users[data.target];
    if (targetSocketId) {
      io.to(targetSocketId).emit("ice-candidate", data);
    }
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    for (const [userId, socketId] of Object.entries(users)) {
      if (socketId === socket.id) {
        delete users[userId];
        break;
      }
    }
    console.log("Users after disconnect:", users);

    // Send the updated list of connected peers to everyone
    io.emit("update-user-list", Object.keys(users));
  });
});

server.listen(3001, () => {
  console.log("Server listening on port 3001");
});
