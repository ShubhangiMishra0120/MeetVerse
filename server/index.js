const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
// Removed DeepL and Axios imports as we're mocking translation
// const deepl = require('deepl-node');
// const axios = require('axios');

const app = express();
app.use(cors());

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

// No external API key setup needed for mock translation

io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);

  // --- CHAT MESSAGE HANDLING with MOCKED Translation ---
  socket.on('message', async (data) => { // Keep async for future real API integration
    console.log('Received message:', data);

    // MOCKED TRANSLATION LOGIC
    // This will prepend a language tag to simulate translation.
    const translatedToEnglish = `[EN]: ${data.text}`;
    const translatedToHindi = `[HI]: ${data.text}`;
    // Add more mocked languages if needed: `[FR]: ${data.text}` etc.

    const messageWithTranslationInfo = {
      ...data,
      translatedTextEn: translatedToEnglish,
      translatedTextHi: translatedToHindi,
    };

    io.emit('messageResponse', messageWithTranslationInfo);
  });
  // --- END CHAT MESSAGE HANDLING ---

  // --- WEBRTC SIGNALING HANDLERS (UNCHANGED) ---
  socket.on('offer', (offer) => {
    console.log('Received offer from', socket.id);
    socket.broadcast.emit('offer', offer);
  });

  socket.on('answer', (answer) => {
    console.log('Received answer from', socket.id);
    socket.broadcast.emit('answer', answer);
  });

  socket.on('ice-candidate', (candidate) => {
    console.log('Received ICE candidate from', socket.id);
    socket.broadcast.emit('ice-candidate', candidate);
  });
  // --- END NEW WEBRTC SIGNALING HANDLERS ---

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});