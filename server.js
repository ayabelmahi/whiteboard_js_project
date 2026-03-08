const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const mysql = require("mysql2/promise");

// =========================
// CONFIG
// =========================
const PORT = 3000;

// Mets ici tes infos MySQL
const db = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "", // <-- remplace par ton mot de passe MySQL si tu en as un
  database: "liveboard_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// =========================
// MIDDLEWARES
// =========================
app.use(express.static(__dirname));
app.use(express.json());

// =========================
// CACHE MEMOIRE
// roomId -> elements[]
// =========================
const boards = new Map();

// =========================
// DB HELPERS
// =========================
async function getBoardFromDB(roomId) {
  const [rows] = await db.query(
    "SELECT elements FROM boards WHERE room_id = ?",
    [roomId]
  );

  if (rows.length === 0) {
    return [];
  }

  let elements = rows[0].elements;

  if (typeof elements === "string") {
    try {
      elements = JSON.parse(elements);
    } catch (error) {
      console.error("JSON parse error:", error);
      elements = [];
    }
  }

  return Array.isArray(elements) ? elements : [];
}

async function saveBoardToDB(roomId, elements) {
  await db.query(
    `
    INSERT INTO boards (room_id, elements)
    VALUES (?, ?)
    ON DUPLICATE KEY UPDATE
      elements = VALUES(elements),
      updated_at = CURRENT_TIMESTAMP
    `,
    [roomId, JSON.stringify(elements)]
  );
}

// =========================
// API ROUTES
// =========================

// Test route
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

// Load board
app.get("/api/boards/:roomId", async (req, res) => {
  try {
    const { roomId } = req.params;
    const elements = await getBoardFromDB(roomId);

    return res.json({
      roomId,
      elements,
    });
  } catch (error) {
    console.error("GET /api/boards/:roomId error:", error);
    return res.status(500).json({
      message: "Failed to load board",
      error: error.message,
    });
  }
});

// Save board
app.post("/api/boards/save", async (req, res) => {
  try {
    const { roomId, elements } = req.body;

    if (!roomId || !Array.isArray(elements)) {
      return res.status(400).json({
        message: "Invalid payload. roomId and elements[] are required.",
      });
    }

    await saveBoardToDB(roomId, elements);

    // Met à jour aussi le cache mémoire
    boards.set(roomId, elements);

    return res.json({
      success: true,
      message: "Board saved successfully",
    });
  } catch (error) {
    console.error("POST /api/boards/save error:", error);
    return res.status(500).json({
      message: "Failed to save board",
      error: error.message,
    });
  }
});

// =========================
// SOCKET.IO
// =========================
io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);

  // Join room
  socket.on("join-room", async ({ roomId, userName }) => {
    try {
      if (!roomId) return;

      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.userName = userName || socket.id.slice(0, 5);

      // Charger le board depuis cache ou DB
      if (!boards.has(roomId)) {
        const dbElements = await getBoardFromDB(roomId);
        boards.set(roomId, dbElements);
      }

      // Envoyer l'historique au nouveau client
      socket.emit("board-state", boards.get(roomId));

      // Prévenir les autres
      socket.to(roomId).emit("user-joined", {
        id: socket.id,
        name: socket.data.userName,
      });

      console.log(`👥 ${socket.id} joined room ${roomId}`);
    } catch (error) {
      console.error("join-room error:", error);
    }
  });

  // Quand un élément est terminé
  socket.on("draw-element", (element) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      if (!element) return;

      if (!boards.has(roomId)) {
        boards.set(roomId, []);
      }

      boards.get(roomId).push(element);

      // Envoie aux autres dans la room
      socket.to(roomId).emit("draw-element", element);
    } catch (error) {
      console.error("draw-element error:", error);
    }
  });

  // Clear board
  socket.on("clear-board", async () => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId) return;

      boards.set(roomId, []);

      // Envoie à toute la room
      io.to(roomId).emit("clear-board");

      // Sauvegarde aussi en DB
      await saveBoardToDB(roomId, []);
    } catch (error) {
      console.error("clear-board error:", error);
    }
  });

  // Curseur distant
  socket.on("cursor-move", (payload) => {
    try {
      const roomId = socket.data.roomId;
      if (!roomId || !payload) return;

      socket.to(roomId).emit("cursor-move", {
        id: socket.id,
        name: socket.data.userName,
        x: payload.x,
        y: payload.y,
      });
    } catch (error) {
      console.error("cursor-move error:", error);
    }
  });

  socket.on("disconnect", () => {
    try {
      const roomId = socket.data.roomId;

      if (roomId) {
        socket.to(roomId).emit("user-left", { id: socket.id });
      }

      console.log("❌ User disconnected:", socket.id);
    } catch (error) {
      console.error("disconnect error:", error);
    }
  });
});

// =========================
// START SERVER
// =========================
http.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});