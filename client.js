const socket = io();
const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");

// --- SESSION ---
const params = new URLSearchParams(window.location.search);
let roomId = params.get("room") || crypto.randomUUID();
if (!params.get("room")) {
    params.set("room", roomId);
    window.history.replaceState({}, "", `?${params.toString()}`);
}
const userName = `user-${Math.floor(Math.random() * 1000)}`;
socket.emit("join-room", { roomId, userName });

// --- STATE ---
let elements = [];
let currentTool = "pencil";
let currentColor = "#ffffff";
let currentStrokeWidth = 3;
let isDrawing = false;
let isDragging = false;
let selectedElement = null;
let startX = 0, startY = 0;
let tempElement = null;
let zoomLevel = 1;

// --- SYNC (Réception du serveur) ---
socket.on("board-state", (serverElements) => { elements = serverElements; redrawCanvas(); });
socket.on("draw-element", (el) => { elements.push(el); redrawCanvas(); });

socket.on("update-element", (updatedEl) => {
    const index = elements.findIndex(el => el.id === updatedEl.id);
    if (index !== -1) {
        elements[index] = updatedEl;
        redrawCanvas();
    }
});

socket.on("delete-element", (id) => {
    console.log("Événement suppression reçu pour l'ID:", id); //log 
    elements = elements.filter(el => el.id !== id);
    redrawCanvas();
});


socket.on("clear-board", () => { elements = []; redrawCanvas(); });

// --- UI HELPERS ---
document.querySelectorAll(".tool-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".tool-btn").forEach(b => b.classList.remove("active", "bg-primary", "text-white"));
        btn.classList.add("active", "bg-primary", "text-white");
        currentTool = btn.dataset.tool;
        canvas.style.cursor = currentTool === "select" ? "default" : "crosshair";
        if (currentTool !== "select") selectedElement = null;
        redrawCanvas();
    };
});

document.querySelectorAll(".color-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".color-btn").forEach(b => b.classList.remove("ring-2", "ring-offset-4", "ring-primary"));
        btn.classList.add("ring-2", "ring-offset-4", "ring-primary");
        currentColor = btn.dataset.color;
    };
});

document.querySelectorAll(".stroke-btn").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".stroke-btn").forEach(b => b.classList.remove("border-2", "border-primary"));
        btn.classList.add("border-2", "border-primary");
        currentStrokeWidth = Number(btn.dataset.size);
    };
});

// --- ZOOM ---
const updateZoomUI = () => {
    canvas.style.transform = `scale(${zoomLevel})`;
    document.getElementById("zoomLabel").textContent = `${Math.round(zoomLevel * 100)}%`;
};
document.getElementById("zoomInBtn").onclick = () => { zoomLevel = Math.min(zoomLevel + 0.1, 3); updateZoomUI(); };
document.getElementById("zoomOutBtn").onclick = () => { zoomLevel = Math.max(zoomLevel - 0.1, 0.5); updateZoomUI(); };

// --- DETECTION COLLISION ---
function distToSegment(p, v, w) {
    const l2 = Math.pow(v.x - w.x, 2) + Math.pow(v.y - w.y, 2);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function getElementAtPos(x, y) {
    const threshold = 15;
    for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];
        if (el.type === "path") {
            for (let j = 0; j < el.points.length - 1; j++) {
                const p1 = el.points[j], p2 = el.points[j + 1];
                if (distToSegment({ x, y }, { x: p1[0], y: p1[1] }, { x: p2[0], y: p2[1] }) < threshold) return el;
            }
        } else if (el.type === "rectangle" || el.type === "image") {
            if (x >= el.x && x <= el.x + el.width && y >= el.y && y <= el.y + el.height) return el;
        } else if (el.type === "circle") {
            if (Math.hypot(x - el.cx, y - el.cy) <= el.r + 5) return el;
        } else if (el.type === "arrow") {
            if (distToSegment({ x, y }, { x: el.x1, y: el.y1 }, { x: el.x2, y: el.y2 }) < threshold) return el;
        }
    }
    return null;
}

// --- MOUSE LOGIC ---
function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / zoomLevel, y: (e.clientY - rect.top) / zoomLevel };
}

canvas.onmousedown = (e) => {
    const { x, y } = getPos(e);
    const clickedEl = getElementAtPos(x, y);

    // GOMME : Suppression immédiate au clic
    if (currentTool === "eraser") {
        if (clickedEl) {
            elements = elements.filter(el => el.id !== clickedEl.id);
            socket.emit("delete-element", clickedEl.id);
            redrawCanvas();
        }
        return;
    }

    // SELECT / DRAG
    if (clickedEl && (currentTool === "select")) {
        isDragging = true;
        selectedElement = clickedEl;
        startX = x; startY = y;
        redrawCanvas();
        return;
    }

    // DESSIN
    if (currentTool !== "select") {
        isDrawing = true; startX = x; startY = y;
        const common = { id: crypto.randomUUID(), strokeColor: currentColor, strokeWidth: currentStrokeWidth };

        if (currentTool === "pencil") tempElement = { type: "path", points: [[x, y]], ...common };
        if (currentTool === "rectangle") tempElement = { type: "rectangle", x, y, width: 0, height: 0, ...common };
        if (currentTool === "circle") tempElement = { type: "circle", cx: x, cy: y, r: 0, ...common };
        if (currentTool === "arrow") tempElement = { type: "arrow", x1: x, y1: y, x2: x, y2: y, ...common };
    }
};

canvas.onmousemove = (e) => {
    const { x, y } = getPos(e);
    socket.emit("cursor-move", { x, y });

    // GOMME EN TEMPS RÉEL (si on glisse en restant appuyé)
    if (currentTool === "eraser" && e.buttons === 1) {
        const clickedEl = getElementAtPos(x, y);
        if (clickedEl) {
            elements = elements.filter(el => el.id !== clickedEl.id);
            socket.emit("delete-element", clickedEl.id);
            redrawCanvas();
        }
        return;
    }

    if (isDragging && selectedElement) {
        const dx = x - startX;
        const dy = y - startY;

        if (selectedElement.type === "path") {
            selectedElement.points = selectedElement.points.map(p => [p[0] + dx, p[1] + dy]);
        } else if (selectedElement.type === "circle") {
            selectedElement.cx += dx; selectedElement.cy += dy;
        } else if (selectedElement.type === "arrow") {
            selectedElement.x1 += dx; selectedElement.y1 += dy;
            selectedElement.x2 += dx; selectedElement.y2 += dy;
        } else {
            selectedElement.x += dx; selectedElement.y += dy;
        }

        startX = x; startY = y;
        redrawCanvas();
        socket.emit("update-element", selectedElement);
        return;
    }

    if (!isDrawing || !tempElement) return;
    if (tempElement.type === "path") tempElement.points.push([x, y]);
    if (tempElement.type === "rectangle") { tempElement.width = x - startX; tempElement.height = y - startY; }
    if (tempElement.type === "circle") tempElement.r = Math.hypot(x - startX, y - startY);
    if (tempElement.type === "arrow") { tempElement.x2 = x; tempElement.y2 = y; }

    redrawCanvas();
    drawElement(tempElement);
};

window.onmouseup = () => {
    if (isDragging) isDragging = false;
    if (isDrawing && tempElement) {
        elements.push(tempElement);
        socket.emit("draw-element", tempElement);
    }
    isDrawing = false; tempElement = null; redrawCanvas();
};

// --- DRAWING ENGINE ---
function drawElement(el) {
    if (el.type === "image") {
        const img = new Image();
        img.src = el.src;
        if (img.complete) ctx.drawImage(img, el.x, el.y, el.width, el.height);
        else img.onload = () => redrawCanvas();
    } else {
        ctx.strokeStyle = el.strokeColor || "#fff";
        ctx.lineWidth = el.strokeWidth || 3;
        ctx.lineCap = "round"; ctx.lineJoin = "round";

        if (el.type === "path") {
            ctx.beginPath(); ctx.moveTo(el.points[0][0], el.points[0][1]);
            el.points.forEach(p => ctx.lineTo(p[0], p[1])); ctx.stroke();
        } else if (el.type === "rectangle") {
            ctx.strokeRect(el.x, el.y, el.width, el.height);
        } else if (el.type === "circle") {
            ctx.beginPath(); ctx.arc(el.cx, el.cy, el.r, 0, Math.PI * 2); ctx.stroke();
        } else if (el.type === "arrow") {
            const head = 12, angle = Math.atan2(el.y2 - el.y1, el.x2 - el.x1);
            ctx.beginPath(); ctx.moveTo(el.x1, el.y1); ctx.lineTo(el.x2, el.y2);
            ctx.lineTo(el.x2 - head * Math.cos(angle - Math.PI / 6), el.y2 - head * Math.sin(angle - Math.PI / 6));
            ctx.moveTo(el.x2, el.y2);
            ctx.lineTo(el.x2 - head * Math.cos(angle + Math.PI / 6), el.y2 - head * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        }
    }

    if (selectedElement && selectedElement.id === el.id) {
        drawSelectionOutline(el);
    }
}

function drawSelectionOutline(el) {
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    let padding = 5;
    if (el.type === "path") {
        const xs = el.points.map(p => p[0]);
        const ys = el.points.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        ctx.strokeRect(minX - padding, minY - padding, (maxX - minX) + padding * 2, (maxY - minY) + padding * 2);
    } else if (el.type === "circle") {
        ctx.strokeRect(el.cx - el.r - padding, el.cy - el.r - padding, (el.r * 2) + padding * 2, (el.r * 2) + padding * 2);
    } else if (el.type === "arrow") {
        const minX = Math.min(el.x1, el.x2), maxX = Math.max(el.x1, el.x2);
        const minY = Math.min(el.y1, el.y2), maxY = Math.max(el.y1, el.y2);
        ctx.strokeRect(minX - padding, minY - padding, (maxX - minX) + padding * 2, (maxY - minY) + padding * 2);
    } else {
        ctx.strokeRect(el.x - padding, el.y - padding, el.width + padding * 2, el.height + padding * 2);
    }
    ctx.restore();
}

function redrawCanvas() {
    ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    elements.forEach(drawElement);
}

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    redrawCanvas();
}
window.onresize = resize; resize();

// --- IMPORT IMAGE ---
const fileInput = document.getElementById("fileInput");
const importBtn = document.getElementById("importBtn");
importBtn.onclick = () => fileInput.click();
fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = (event) => {
        const img = new Image();

        img.onload = () => {

            const scale = img.width > 500 ? 500 / img.width : 1;

            const imageElement = {
                id: crypto.randomUUID(),
                type: "image",
                src: event.target.result,
                x: (canvas.width / 2 - (img.width * scale) / 2) / zoomLevel,
                y: (canvas.height / 2 - (img.height * scale) / 2) / zoomLevel,
                width: img.width * scale,
                height: img.height * scale
            };

            // 🔥 IMPORTANT → sync propre
            elements.push(imageElement);

            socket.emit("draw-element", imageElement);

            // 🔥 redraw AFTER emit
            redrawCanvas();

            fileInput.value = "";
        };

        img.src = event.target.result;
    };

    reader.readAsDataURL(file);
};

// --- REMOTE CURSORS ---
const cursors = new Map();
socket.on("cursor-move", ({ id, name, x, y }) => {
    let c = cursors.get(id);
    if (!c) {
        c = document.createElement("div");
        c.className = "absolute pointer-events-none z-50 bg-primary text-white text-[10px] px-2 py-1 rounded-full shadow-lg";
        c.innerText = name;
        document.body.appendChild(c);
        cursors.set(id, c);
    }
    c.style.left = `${x * zoomLevel}px`; c.style.top = `${y * zoomLevel}px`;
});
socket.on("force-switch-board", ({ roomId: newRoomId }) => {

    roomId = newRoomId;

    const params = new URLSearchParams(window.location.search);
    params.set("room", roomId);
    window.history.replaceState({}, "", `?${params.toString()}`);

    socket.emit("join-room", { roomId, userName });

});
// socket.on("force-load-board", ({ roomId: newRoomId, elements: newElements }) => {

//     // quitter ancienne room (optionnel mais propre)
//     socket.emit("join-room", { roomId: newRoomId, userName });
//     socket.emit("join-room", { roomId, userName });

//     roomId = newRoomId;
//     elements = newElements;

//     // update URL
//     const params = new URLSearchParams(window.location.search);
//     params.set("room", roomId);
//     window.history.replaceState({}, "", `?${params.toString()}`);

//     redrawCanvas();
// });

socket.on("user-left", ({ id }) => { if (cursors.has(id)) { cursors.get(id).remove(); cursors.delete(id); } });

document.getElementById("clearBtn").onclick = () => socket.emit("clear-board");
document.getElementById("saveBtn").onclick = async () => {
    try {
        await fetch("/api/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                roomId,
                elements
            })
        });

        alert("Board sauvegardé !");
    } catch (err) {
        alert("Erreur save");
    }
};
const archiveBtn = document.getElementById("archiveBtn");
const archiveModal = document.getElementById("archiveModal");
const archiveList = document.getElementById("archiveList");

function closeArchive() {
    archiveModal.classList.add("hidden");
}

archiveBtn.onclick = async () => {

    archiveModal.classList.remove("hidden");

    const res = await fetch("/api/boards");
    const boards = await res.json();

    archiveList.innerHTML = "";

    boards.forEach(board => {

        const div = document.createElement("div");
        div.className = "p-3 bg-zinc-800 mb-2 rounded-xl cursor-pointer";

        div.innerHTML = `
            <div>${board.room_id}</div>
            <div class="text-xs text-zinc-400">${new Date(board.updated_at).toLocaleString()}</div>
        `;

        div.onclick = async () => {

    const res = await fetch(`/api/boards/${board.room_id}`);
    const data = await res.json();

    roomId = board.room_id;

    const params = new URLSearchParams(window.location.search);
    params.set("room", roomId);
    window.history.replaceState({}, "", `?${params.toString()}`);

    // 🔥 UNE SEULE ACTION
     socket.emit("switch-board", { roomId });
    closeArchive();
};

        archiveList.appendChild(div);
    });
};