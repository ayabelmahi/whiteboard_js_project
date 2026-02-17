const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

// On dit au serveur de lire les fichiers dans le dossier actuel
app.use(express.static(__dirname));

io.on('connection', (socket) => {
    console.log('Un utilisateur est connecté');

    // Quand un utilisateur dessine, on envoie les données aux autres
    socket.on('draw-data', (data) => {
        socket.broadcast.emit('draw-data', data);
    });

    socket.on('disconnect', () => {
        console.log('Utilisateur déconnecté');
    });
});

const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Serveur prêt sur http://localhost:${PORT}`);
});