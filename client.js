const socket = io();

// =========================
// 1) ROOM / SESSION
// =========================
const params = new URLSearchParams(window.location.search);
let roomId = params.get("room");

if (!roomId) {
  roomId = crypto.randomUUID();
  params.set("room", roomId);
  window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
}

const userName = `user-${Math.floor(Math.random() * 1000)}`;
socket.emit("join-room", { roomId, userName });

// =========================
// 2) DOM
// =========================
const canvas = document.getElementById("whiteboard");
const ctx = canvas.getContext("2d");

const toolButtons = document.querySelectorAll(".tool-btn");
const strokeButtons = document.querySelectorAll(".stroke-btn");
const colorButtons = document.querySelectorAll(".color-btn");

const saveBtn = document.getElementById("saveBtn");
const clearBtn = document.getElementById("clearBtn");
const exportBtn = document.getElementById("exportBtn");

const zoomInBtn = document.getElementById("zoomInBtn");
const zoomOutBtn = document.getElementById("zoomOutBtn");
const zoomLabel = document.getElementById("zoomLabel");

// =========================
// 3) STATE
// =========================
let elements = [];
let currentTool = "pencil";
let currentColor = "#ffffff";
let currentStrokeWidth = 3;

let isDrawing = false;
let startX = 0;
let startY = 0;
let tempElement = null;

let zoomLevel = 1;

// =========================
// 4) CANVAS SIZE
// =========================
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  redrawCanvas();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

// =========================
// 5) ZOOM
// =========================
function updateZoom() {
  canvas.style.transformOrigin = "center center";
  canvas.style.transform = `scale(${zoomLevel})`;
  if (zoomLabel) {
    zoomLabel.textContent = `${Math.round(zoomLevel * 100)}%`;
  }
}

if (zoomInBtn) {
  zoomInBtn.addEventListener("click", () => {
    zoomLevel = Math.min(zoomLevel + 0.1, 3);
    updateZoom();
  });
}

if (zoomOutBtn) {
  zoomOutBtn.addEventListener("click", () => {
    zoomLevel = Math.max(zoomLevel - 0.1, 0.5);
    updateZoom();
  });
}

updateZoom();

// =========================
// 6) TOOL SELECTION
// =========================
toolButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toolButtons.forEach((btn) => {
      btn.classList.remove("active", "bg-primary", "text-white");
      btn.classList.add("text-zinc-400");
    });

    button.classList.add("active", "bg-primary", "text-white");
    button.classList.remove("text-zinc-400");

    currentTool = button.dataset.tool;
  });
});

// =========================
// 7) STROKE SELECTION
// =========================
strokeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    strokeButtons.forEach((btn) => {
      btn.classList.remove("border-2", "border-primary", "shadow-lg", "shadow-primary/10");
      btn.classList.add("border", "border-border");
    });

    button.classList.remove("border", "border-border");
    button.classList.add("border-2", "border-primary", "shadow-lg", "shadow-primary/10");

    currentStrokeWidth = Number(button.dataset.size);
  });
});

// =========================
// 8) COLOR SELECTION
// =========================
colorButtons.forEach((button) => {
  button.addEventListener("click", () => {
    colorButtons.forEach((btn) => {
      btn.classList.remove("ring-2", "ring-offset-4", "ring-offset-card", "ring-primary");
    });

    button.classList.add("ring-2", "ring-offset-4", "ring-offset-card", "ring-primary");
    currentColor = button.dataset.color;
  });
});

// =========================
// 9) HELPERS
// =========================
function normalizeRectangle(x, y, width, height) {
  return {
    x: width < 0 ? x + width : x,
    y: height < 0 ? y + height : y,
    width: Math.abs(width),
    height: Math.abs(height),
  };
}

function getMousePosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / zoomLevel,
    y: (event.clientY - rect.top) / zoomLevel,
  };
}

// =========================
// 10) DRAW FUNCTIONS
// =========================
function drawPath(element) {
  if (!element.points || element.points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(element.points[0][0], element.points[0][1]);

  for (let i = 1; i < element.points.length; i++) {
    ctx.lineTo(element.points[i][0], element.points[i][1]);
  }

  ctx.stroke();
}

function drawRectangle(element) {
  ctx.strokeRect(element.x, element.y, element.width, element.height);
}

function drawCircle(element) {
  ctx.beginPath();
  ctx.arc(element.cx, element.cy, element.r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawArrow(element) {
  const { x1, y1, x2, y2 } = element;
  const headLength = 12;
  const angle = Math.atan2(y2 - y1, x2 - x1);

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle - Math.PI / 6),
    y2 - headLength * Math.sin(angle - Math.PI / 6)
  );
  ctx.moveTo(x2, y2);
  ctx.lineTo(
    x2 - headLength * Math.cos(angle + Math.PI / 6),
    y2 - headLength * Math.sin(angle + Math.PI / 6)
  );
  ctx.stroke();
}

function drawEraser(element) {
  if (!element.points || element.points.length < 2) return;

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.moveTo(element.points[0][0], element.points[0][1]);

  for (let i = 1; i < element.points.length; i++) {
    ctx.lineTo(element.points[i][0], element.points[i][1]);
  }

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = element.strokeWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

function drawElement(element) {
  ctx.strokeStyle = element.strokeColor || "#ffffff";
  ctx.lineWidth = element.strokeWidth || 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (element.type) {
    case "path":
      drawPath(element);
      break;
    case "rectangle":
      drawRectangle(element);
      break;
    case "circle":
      drawCircle(element);
      break;
    case "arrow":
      drawArrow(element);
      break;
    case "eraser":
      drawEraser(element);
      break;
  }
}

function redrawCanvas() {
  // Remplace le blanc par le noir du design v0
  ctx.fillStyle = "#0a0a0a"; 
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Puis dessine les éléments
  elements.forEach(drawElement);
}

// =========================
// 11) DRAW START
// =========================
canvas.addEventListener("mousedown", (event) => {
  const { x, y } = getMousePosition(event);

  if (currentTool === "select") return;

  isDrawing = true;
  startX = x;
  startY = y;

  if (currentTool === "pencil") {
    tempElement = {
      type: "path",
      points: [[x, y]],
      strokeColor: currentColor,
      strokeWidth: currentStrokeWidth,
    };
  }

  if (currentTool === "eraser") {
    tempElement = {
      type: "eraser",
      points: [[x, y]],
      strokeColor: "#000000",
      strokeWidth: currentStrokeWidth * 6,
    };
  }

  if (currentTool === "rectangle") {
    tempElement = {
      type: "rectangle",
      x,
      y,
      width: 0,
      height: 0,
      strokeColor: currentColor,
      strokeWidth: currentStrokeWidth,
    };
  }

  if (currentTool === "circle") {
    tempElement = {
      type: "circle",
      cx: x,
      cy: y,
      r: 0,
      strokeColor: currentColor,
      strokeWidth: currentStrokeWidth,
    };
  }

  if (currentTool === "arrow") {
    tempElement = {
      type: "arrow",
      x1: x,
      y1: y,
      x2: x,
      y2: y,
      strokeColor: currentColor,
      strokeWidth: currentStrokeWidth,
    };
  }
});

// =========================
// 12) DRAW MOVE
// =========================
canvas.addEventListener("mousemove", (event) => {
  const { x, y } = getMousePosition(event);

  socket.emit("cursor-move", { x, y });

  if (!isDrawing || !tempElement) return;

  if (tempElement.type === "path" || tempElement.type === "eraser") {
    tempElement.points.push([x, y]);
  }

  if (tempElement.type === "rectangle") {
    tempElement.width = x - startX;
    tempElement.height = y - startY;
  }

  if (tempElement.type === "circle") {
    const dx = x - startX;
    const dy = y - startY;
    tempElement.r = Math.sqrt(dx * dx + dy * dy);
  }

  if (tempElement.type === "arrow") {
    tempElement.x2 = x;
    tempElement.y2 = y;
  }

  redrawCanvas();

  if (tempElement.type === "rectangle") {
    const normalized = normalizeRectangle(
      tempElement.x,
      tempElement.y,
      tempElement.width,
      tempElement.height
    );
    drawElement({ ...tempElement, ...normalized });
  } else {
    drawElement(tempElement);
  }
});

// =========================
// 13) DRAW END
// =========================
window.addEventListener("mouseup", () => {
  if (!isDrawing || !tempElement) return;

  isDrawing = false;

  if (tempElement.type === "rectangle") {
    const normalized = normalizeRectangle(
      tempElement.x,
      tempElement.y,
      tempElement.width,
      tempElement.height
    );
    tempElement = { ...tempElement, ...normalized };
  }

  elements.push(tempElement);
  socket.emit("draw-element", tempElement);

  tempElement = null;
  redrawCanvas();
});

// =========================
// 14) SOCKET EVENTS
// =========================
socket.on("board-state", (serverElements) => {
  elements = serverElements || [];
  redrawCanvas();
});

socket.on("draw-element", (element) => {
  elements.push(element);
  redrawCanvas();
});

socket.on("clear-board", () => {
  elements = [];
  redrawCanvas();
});

// =========================
// 15) CLEAR BUTTON
// =========================
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    socket.emit("clear-board");
  });
}

// =========================
// 16) EXPORT BUTTON
// =========================
if (exportBtn) {
  exportBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `liveboard-${roomId}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
}

// =========================
// 17) SAVE BUTTON -> MYSQL API
// =========================
if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    try {
      const response = await fetch("/api/boards/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomId,
          elements,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Save failed");
      }

      alert("Board saved in MySQL.");
    } catch (error) {
      console.error(error);
      alert("Error while saving board.");
    }
  });
}

// =========================
// 18) LOAD BOARD FROM MYSQL
// =========================
async function loadBoardFromDatabase() {
  try {
    const response = await fetch(`/api/boards/${roomId}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Load failed");
    }

    if (Array.isArray(data.elements)) {
      elements = data.elements;
      redrawCanvas();
    }
  } catch (error) {
    console.error("Load board error:", error);
  }
}

loadBoardFromDatabase();

// =========================
// 19) REMOTE CURSORS
// =========================
const remoteCursors = new Map();

function createCursorElement(id, name) {
  const cursor = document.createElement("div");
  cursor.style.position = "absolute";
  cursor.style.pointerEvents = "none";
  cursor.style.zIndex = "30";
  cursor.style.transform = "translate(10px, 10px)";
  cursor.innerHTML = `
    <div style="
      background:#3b82f6;
      color:white;
      padding:4px 8px;
      border-radius:999px;
      font-size:12px;
      font-weight:600;
      white-space:nowrap;
      box-shadow:0 8px 20px rgba(59,130,246,0.35);
    ">
      ${name}
    </div>
  `;
  document.body.appendChild(cursor);
  remoteCursors.set(id, cursor);
  return cursor;
}

socket.on("cursor-move", ({ id, name, x, y }) => {
  let cursor = remoteCursors.get(id);

  if (!cursor) {
    cursor = createCursorElement(id, name);
  }

  cursor.style.left = `${x * zoomLevel}px`;
  cursor.style.top = `${y * zoomLevel}px`;
});

socket.on("user-left", ({ id }) => {
  const cursor = remoteCursors.get(id);
  if (cursor) {
    cursor.remove();
    remoteCursors.delete(id);
  }
});