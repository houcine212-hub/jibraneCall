// Family Call App - Main server
// Express REST API + Socket.IO signaling for WebRTC video calls
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const pool = require('./db/pool');
const usersRouter = require('./routes/users');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/users', usersRouter);

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---------- In-memory map: userId <-> socketId ----------
// Keeps track of which socket belongs to which registered user
const userSockets = new Map(); // userId -> socketId
const socketUsers = new Map(); // socketId -> userId

// ---------- Helper: update user status in DB ----------
async function setUserStatus(userId, status, socketId = null) {
  try {
    await pool.query(
      'UPDATE users SET status = ?, socket_id = ? WHERE id = ?',
      [status, socketId, userId]
    );
  } catch (err) {
    console.error('setUserStatus error:', err);
  }
}

async function broadcastUserList() {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, avatar_path, status FROM users ORDER BY name ASC'
    );
    io.emit('users:update', rows);
  } catch (err) {
    console.error('broadcastUserList error:', err);
  }
}

// ---------- Socket.IO signaling ----------
io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Register this socket as belonging to a logged-in user
  socket.on('identify', async ({ userId }) => {
    if (!userId) return;
    userSockets.set(String(userId), socket.id);
    socketUsers.set(socket.id, String(userId));
    await setUserStatus(userId, 'online', socket.id);
    await broadcastUserList();
    console.log(`User ${userId} identified as socket ${socket.id}`);
  });

  // Caller initiates a call to another user
  // payload: { toUserId, fromUserId, fromName, fromAvatar, offer }
  socket.on('call:invite', ({ toUserId, fromUserId, fromName, fromAvatar, offer }) => {
    const targetSocketId = userSockets.get(String(toUserId));
    if (!targetSocketId) {
      socket.emit('call:unavailable', { toUserId });
      return;
    }
    io.to(targetSocketId).emit('call:incoming', {
      fromUserId,
      fromName,
      fromAvatar,
      offer
    });
  });

  // Receiver accepts the call, sends back their SDP answer
  // payload: { toUserId (the original caller), fromUserId, answer }
  socket.on('call:accept', ({ toUserId, fromUserId, answer }) => {
    const callerSocketId = userSockets.get(String(toUserId));
    if (callerSocketId) {
      io.to(callerSocketId).emit('call:accepted', { fromUserId, answer });
    }
  });

  // Receiver rejects/cancels the call before it connects
  // payload: { toUserId, fromUserId, reason: 'rejected' | 'cancelled' }
  socket.on('call:decline', ({ toUserId, fromUserId, reason }) => {
    const targetSocketId = userSockets.get(String(toUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:declined', { fromUserId, reason: reason || 'rejected' });
    }
  });

  // Caller cancels the call before receiver answers
  // payload: { toUserId, fromUserId }
  socket.on('call:cancel', ({ toUserId, fromUserId }) => {
    const targetSocketId = userSockets.get(String(toUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:cancelled', { fromUserId });
    }
  });

  // Either side ends an active call
  // payload: { toUserId, fromUserId }
  socket.on('call:end', ({ toUserId, fromUserId }) => {
    const targetSocketId = userSockets.get(String(toUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ended', { fromUserId });
    }
  });

  // WebRTC ICE candidate exchange (relayed both directions)
  // payload: { toUserId, fromUserId, candidate }
  socket.on('call:ice-candidate', ({ toUserId, fromUserId, candidate }) => {
    const targetSocketId = userSockets.get(String(toUserId));
    if (targetSocketId) {
      io.to(targetSocketId).emit('call:ice-candidate', { fromUserId, candidate });
    }
  });

  // Disconnect cleanup
  socket.on('disconnect', async () => {
    const userId = socketUsers.get(socket.id);
    if (userId) {
      userSockets.delete(userId);
      socketUsers.delete(socket.id);
      await setUserStatus(userId, 'offline', null);
      await broadcastUserList();
      console.log(`User ${userId} disconnected`);
    }
  });
});

// ---------- Fallback route (SPA-style) ----------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ---------- Start server ----------
server.listen(PORT, () => {
  console.log(`Family Call server running on http://localhost:${PORT}`);
});
