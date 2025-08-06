const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors:{
    origin: ['http://localhost:3000', 'http://localhost:3001'], 
    methods: ['GET', 'POST']
  }
});

app.get('/', (req, res) => {
  res.send('Socket.io server is running.');
});

// Store active meetings and participants
let meetings = {};
let participants = {}; // socketId -> { meetingId, userName }

// Create meeting link endpoint
app.post('/create-meet', (req, res) => {
  const meetingId = uuidv4().split('-')[0]; // shorter unique ID
  meetings[meetingId] = { 
    createdAt: Date.now(),
    participants: []
  };
  res.json({ link: `http://localhost:3000/meet/${meetingId}` });
});

// Validate meeting
app.get('/validate-meet/:id', (req, res) => {
  const { id } = req.params;
  res.json({ valid: !!meetings[id] });
});

io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);

  // Join room handler
  socket.on('join-room', (meetingId, userName) => {
    // Validate meeting exists
    if (!meetings[meetingId]) {
      socket.emit('error', { message: 'Meeting not found' });
      return;
    }

    socket.join(meetingId);
    
    // Store participant info
    participants[socket.id] = { meetingId, userName };
    
    // Add to meeting participants
    if (!meetings[meetingId].participants) {
      meetings[meetingId].participants = [];
    }
    meetings[meetingId].participants.push({ id: socket.id, name: userName });
    
    console.log(`${userName} joined room: ${meetingId}`);
    
    // Notify others in the room
    socket.to(meetingId).emit('user-joined', { id: socket.id, name: userName });
    
    // Send current participants to the new user
    const currentParticipants = meetings[meetingId].participants.filter(p => p.id !== socket.id);
    socket.emit('room-participants', currentParticipants);
  });

  // Chat message handling
  socket.on('message', async (data) => {
    console.log('Received message:', data);
    
    const { meetingId, text, sender } = data;
    
    // MOCKED TRANSLATION LOGIC
    const translatedToEnglish = `[EN]: ${text}`;
    const translatedToHindi = `[HI]: ${text}`;
    
    const messageWithTranslationInfo = {
      sender,
      text,
      translatedTextEn: translatedToEnglish,
      translatedTextHi: translatedToHindi,
    };

    // Broadcast to all users in the meeting room
    io.to(meetingId).emit('messageResponse', messageWithTranslationInfo);
  });

  // WebRTC signaling handlers
  socket.on('offer', ({ meetingId, offer }) => {
    console.log('Received offer for meeting:', meetingId);
    socket.to(meetingId).emit('offer', offer);
  });

  socket.on('answer', ({ meetingId, answer }) => {
    console.log('Received answer for meeting:', meetingId);
    socket.to(meetingId).emit('answer', answer);
  });

  socket.on('ice-candidate', ({ meetingId, candidate }) => {
    console.log('Received ICE candidate for meeting:', meetingId);
    socket.to(meetingId).emit('ice-candidate', candidate);
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
    
    const participant = participants[socket.id];
    if (participant) {
      const { meetingId } = participant;
      
      // Remove from meeting participants
      if (meetings[meetingId] && meetings[meetingId].participants) {
        meetings[meetingId].participants = meetings[meetingId].participants.filter(p => p.id !== socket.id);
        
        // If no participants left, clean up meeting after delay
        if (meetings[meetingId].participants.length === 0) {
          setTimeout(() => {
            if (meetings[meetingId] && meetings[meetingId].participants.length === 0) {
              delete meetings[meetingId];
              console.log(`Meeting ${meetingId} cleaned up`);
            }
          }, 30000); // 30 second delay
        }
      }
      
      // Notify others in the room
      socket.to(meetingId).emit('user-left', socket.id);
      
      // Clean up participant record
      delete participants[socket.id];
    }
  });
});

// Clean up old meetings periodically
setInterval(() => {
  const now = Date.now();
  for (let id in meetings) {
    if (now - meetings[id].createdAt > 2 * 60 * 60 * 1000) { // 2 hours
      delete meetings[id];
      console.log(`Cleaned up old meeting: ${id}`);
    }
  }
}, 60000); // Check every minute

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});