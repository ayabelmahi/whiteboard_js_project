const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(express.static(__dirname));

// Stockage de l'état des tableaux par Room
let boardsHistory = {};

io.on('connection', (socket) => {
    
    // Rejoindre une salle
    socket.on('join-room', ({ roomId, userName }) => {
        socket.join(roomId);
        socket.userName = userName;
        socket.roomId = roomId;

        // Si la salle n'existe pas, on l'initialise
        if (!boardsHistory[roomId]) {
            boardsHistory[roomId] = [];
        }

        // Envoyer l'état actuel du tableau au nouvel utilisateur
        socket.emit("board-state", boardsHistory[roomId]);
    });

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

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`🚀 Serveur LiveBoard prêt sur http://localhost:${PORT}`);
});