const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

// Stockage en mémoire: roomId -> elements[]
const boards = new Map();

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // Join room
  socket.on("join-room", ({ roomId, userName }) => {
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.userName = userName || socket.id.slice(0, 5);

    if (!boards.has(roomId)) boards.set(roomId, []);

    // Envoie l'historique au nouveau
    socket.emit("board-state", boards.get(roomId));

    // Prévenir les autres (optionnel)
    socket.to(roomId).emit("user-joined", {
      id: socket.id,
      name: socket.data.userName,
    });

    console.log(`👥 ${socket.id} joined room ${roomId}`);
  });

  // Réception d'un élément finalisé
  socket.on("draw-element", (element) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    boards.get(roomId).push(element);
    socket.to(roomId).emit("draw-element", element);
  });

  // Clear board
  socket.on("clear-board", () => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    boards.set(roomId, []);
    io.to(roomId).emit("clear-board");
  });

  // Curseur distant
  socket.on("cursor-move", (payload) => {
    const roomId = socket.data.roomId;
    if (!roomId) return;

    socket.to(roomId).emit("cursor-move", {
      id: socket.id,
      name: socket.data.userName,
      x: payload.x,
      y: payload.y,
    });
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;
    if (roomId) {
      socket.to(roomId).emit("user-left", { id: socket.id });
    }
    console.log("git branch User disconnected:", socket.id);
  });
});

const PORT = 3000;
http.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));