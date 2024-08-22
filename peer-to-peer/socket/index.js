const express = require("express");
const app = express();
app.use(cors());

const server = require("http").Server(app);
const io = require("socket.io")(server);
const { v4: uuidV4 } = require("uuid");

app.get("/", (req, res) => {
  res.redirect(`/${uuidV4()}`);
});

app.get("/:room", (req, res) => {
  res.render("room", { roomId: req.params.room });
});

io.on("connection", (socket) => {
  console.log("A user connected", socket.id);

  // Send the new peer's ID to all existing peers
  socket.on("join-room", (roomId, userId) => {
    socket.join(roomId); // Join the room
    socket.broadcast.emit("user-connected", userId); // Tell everyone else in the room that we joined

    // Communicate the disconnection
    socket.on("disconnect", () => {
      socket.broadcast.emit("user-disconnected", userId);
    });
  });
});

server.listen(3001, () => {
  console.log("Server listening on port 3001");
});
