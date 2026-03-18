const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mysql = require('mysql2/promise');
app.use(express.json());

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'liveboard_db'
});

app.use(express.static(__dirname));

// Stockage de l'état des tableaux par Room
let boardsHistory = {};

io.on('connection', (socket) => {

    // Rejoindre une salle
    socket.on('join-room', async ({ roomId, userName }) => {

    // quitter ancienne room
    if (socket.roomId) {
        socket.leave(socket.roomId);
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.userName = userName;

    try {
        const [rows] = await db.query(
            "SELECT elements FROM boards WHERE room_id = ?",
            [roomId]
        );

        if (rows.length > 0) {
            boardsHistory[roomId] = JSON.parse(rows[0].elements);
        } else {
            boardsHistory[roomId] = boardsHistory[roomId] || [];
        }

        // 🔥 envoyer à TOUS
        io.in(roomId).emit("board-state", boardsHistory[roomId]);

    } catch (err) {
        console.error(err);
    }
});
    //-----------------------------------------------------------------------------------------------------------------
    // Dessiner un nouvel élément
    socket.on('draw-element', (element) => {
        const roomId = socket.roomId;
        if (roomId && boardsHistory[roomId]) {
            boardsHistory[roomId].push(element);
            // Diffuser à tous les autres dans la salle
            socket.to(roomId).emit('draw-element', element);
        }
    });

    // Mettre à jour un élément (déplacement / modification)
    socket.on('update-element', (updatedElement) => {
        const roomId = socket.roomId;
        if (roomId && boardsHistory[roomId]) {
            const index = boardsHistory[roomId].findIndex(el => el.id === updatedElement.id);
            if (index !== -1) {
                boardsHistory[roomId][index] = updatedElement;
            }
            socket.to(roomId).emit('update-element', updatedElement);
        }
    });
    socket.on("switch-board", async ({ roomId }) => {

    // 🔥 changer room pour TOUT LE MONDE
    io.emit("force-switch-board", { roomId });

});
    //---Load_board
//    socket.on("load-board", ({ roomId, elements }) => {

//     boardsHistory[roomId] = elements;

//     socket.roomId = roomId;   // 🔥 IMPORTANT
//     socket.join(roomId);      // 🔥 IMPORTANT

//     io.in(roomId).emit("board-state", elements);
// });
    // --- LOGIQUE DE SUPPRESSION (GOMME) ---
    socket.on('delete-element', (id) => {
        const roomId = socket.roomId;
        if (roomId && boardsHistory[roomId]) {
            // Supprimer de l'historique du serveur
            boardsHistory[roomId] = boardsHistory[roomId].filter(el => el.id !== id);
            // Informer tous les autres clients pour qu'ils effacent l'élément
            socket.to(roomId).emit('delete-element', id);
        }
    });

    // Déplacement du curseur
    socket.on('cursor-move', (data) => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('cursor-move', {
                id: socket.id,
                name: socket.userName,
                x: data.x,
                y: data.y
            });
        }
    });

    // Nettoyer tout le tableau
    socket.on('clear-board', () => {
        const roomId = socket.roomId;
        if (roomId) {
            boardsHistory[roomId] = [];
            io.in(roomId).emit('clear-board');
        }
    });

    // Déconnexion
    socket.on('disconnect', () => {
        if (socket.roomId) {
            socket.to(socket.roomId).emit('user-left', { id: socket.id });
        }
    });
});

// SAVE
app.post('/api/save', async (req, res) => {
    try {
        const { roomId, elements } = req.body;

        // mise à jour mémoire realtime
        boardsHistory[roomId] = elements;

        await db.query(
            `INSERT INTO boards (room_id, elements)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE elements = ?, updated_at = CURRENT_TIMESTAMP`,
            [roomId, JSON.stringify(elements), JSON.stringify(elements)]
        );

        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'save error' });
    }
});

// GET ALL
app.get('/api/boards', async (req, res) => {
    const [rows] = await db.query("SELECT room_id, updated_at FROM boards ORDER BY updated_at DESC");
    res.json(rows);
});

// GET ONE
app.get('/api/boards/:id', async (req, res) => {
    const [rows] = await db.query("SELECT elements FROM boards WHERE room_id = ?", [req.params.id]);

    if (rows.length === 0) return res.json({ elements: [] });

    res.json({ elements: JSON.parse(rows[0].elements) });
});

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`🚀 Serveur LiveBoard prêt sur http://localhost:${PORT}`);
});
