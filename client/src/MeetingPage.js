import React, { useRef, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import './styles/VideoRoom.css';
import { Link } from 'react-router-dom';

const GEMINI_API_KEY = "AIzaSyCed052co7hJMY6ROBzEBai-KlqR045GYA";

function MeetingPage() {
  const { meetingId } = useParams();
  const [socket, setSocket] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerConnectionRef = useRef(null);

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io('http://localhost:5000');
    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Handle socket events
  useEffect(() => {
    if (!socket) return;

    socket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
      // Join the meeting room
      socket.emit('join-room', meetingId, `User-${socket.id.substring(0, 5)}`);
    });

    socket.on('user-joined', (user) => {
      console.log('User joined:', user);
      setParticipants(prev => [...prev, user]);
      // Create peer connection when someone joins
      createPeerConnection();
    });

    socket.on('user-left', (userId) => {
      console.log('User left:', userId);
      setParticipants(prev => prev.filter(p => p.id !== userId));
      setRemoteStream(null);
    });

    // WebRTC signaling events
    socket.on('offer', async (offer) => {
      console.log('Received offer');
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socket.emit('answer', { meetingId, answer });
      }
    });

    socket.on('answer', async (answer) => {
      console.log('Received answer');
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('ice-candidate', async (candidate) => {
      console.log('Received ICE candidate');
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    // Chat events
    socket.on('messageResponse', (data) => {
      setChatMessages(prev => [...prev, {
        id: data.sender || 'Unknown',
        text: data.text,
        translatedTextEn: data.translatedTextEn,
        translatedTextHi: data.translatedTextHi,
        timestamp: new Date().toLocaleTimeString()
      }]);
    });

    return () => {
      socket.off('connect');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('messageResponse');
    };
  }, [socket, meetingId]);

  // Initialize local video stream
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.error('Error accessing media devices:', err);
      });

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Create WebRTC peer connection
  const createPeerConnection = () => {
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    const peerConnection = new RTCPeerConnection(configuration);
    peerConnectionRef.current = peerConnection;

    // Add local stream to peer connection
    if (localStream) {
      localStream.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStream);
      });
    }

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      console.log('Received remote stream');
      setRemoteStream(event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', { meetingId, candidate: event.candidate });
      }
    };

    // Create and send offer if we're the initiator
    if (participants.length > 0) {
      createOffer();
    }
  };

  // Create and send offer
  const createOffer = async () => {
    try {
      const offer = await peerConnectionRef.current.createOffer();
      await peerConnectionRef.current.setLocalDescription(offer);
      socket.emit('offer', { meetingId, offer });
    } catch (error) {
      console.error('Error creating offer:', error);
    }
  };

  // Get display message based on selected language
  const getDisplayMessage = (msg) => {
    if (selectedLanguage === 'hi' && msg.translatedTextHi) {
      return msg.translatedTextHi;
    }
    return msg.translatedTextEn || msg.text;
  };

  // Send message with translation
  const sendMessage = async () => {
    if (message.trim() === '' || !socket) return;
    
    let translated = message;
    if (selectedLanguage !== "en") {
      translated = await translateTextGemini(
        message,
        selectedLanguage === "hi" ? "Hindi" : "English",
        GEMINI_API_KEY
      );
    }

    const messageData = {
      sender: socket.id,
      text: message,
      meetingId: meetingId
    };

    socket.emit('message', messageData);
    setMessage('');
  };

  // End meeting
  const endMeeting = () => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }
    if (socket) {
      socket.disconnect();
    }
    window.location.href = '/';
  };

  // Copy meeting link
  const copyMeetingLink = () => {
    const link = `${window.location.origin}/meet/${meetingId}`;
    navigator.clipboard.writeText(link);
    alert('Meeting link copied to clipboard!');
  };

  return (
    <>
      <nav className="meetverse-navbar">
        <div className="meetverse-navbar-content">
          <span className="meetverse-logo">MeetVerse</span>
          <div className="meetverse-navbar-links">
            <Link to="/">Home</Link>
            <span>Meeting ID: {meetingId}</span>
            <button onClick={copyMeetingLink} style={{ background: 'none', border: 'none', color: '#2575fc', cursor: 'pointer' }}>
              📋 Copy Link
            </button>
          </div>
        </div>
      </nav>
      
      <div className="meetverse-bg">
        <div className="meetverse-grid">
          <div className="connection-status">
            <span style={{ color: isConnected ? '#28a745' : '#dc3545' }}>
              {isConnected ? '🟢 Connected' : '🔴 Connecting...'}
            </span>
            <span>Participants: {participants.length + 1}</span>
          </div>
          
          <div className="meetverse-row">
            <div className="meetverse-card">
              <h3>My Video</h3>
              {localStream ? (
                <video ref={localVideoRef} autoPlay playsInline muted className="video-element" />
              ) : (
                <p>Accessing camera/microphone...</p>
              )}
            </div>
            <div className="meetverse-card">
              <h3>Remote Video</h3>
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="video-element" />
              ) : (
                <p>Waiting for remote peer...</p>
              )}
            </div>
          </div>
          
          <div className="meetverse-chatbox">
            <h2 style={{ color: "#2575fc" }}>Real-time Chat</h2>
            <div style={{ marginBottom: '15px', width: '100%' }}>
              <label htmlFor="language-select" style={{ marginRight: '10px' }}>Display Language:</label>
              <select
                id="language-select"
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                style={{ padding: '5px', borderRadius: '4px', border: '1.5px solid #b3c6ff' }}
              >
                <option value="en">English</option>
                <option value="hi">हिंदी (Hindi)</option>
              </select>
            </div>
            <div style={{ height: '200px', overflowY: 'scroll', border: '1px solid #eee', padding: '10px', marginBottom: '10px', borderRadius: '8px', width: '100%' }}>
              {chatMessages.map((msg, index) => (
                <p key={index} style={{ margin: '5px 0', fontSize: '0.9em' }}>
                  <strong>{msg.id ? msg.id.substring(0, 5) : 'Unknown'}... ({msg.timestamp}):</strong>{' '}
                  {getDisplayMessage(msg)}
                </p>
              ))}
            </div>
            <div style={{ display: 'flex', width: '100%' }}>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyPress={async (e) => {
                  if (e.key === 'Enter') {
                    await sendMessage();
                  }
                }}
                placeholder="Type your message..."
                style={{ flexGrow: 1, padding: '8px', border: '1.5px solid #b3c6ff', borderRadius: '8px' }}
              />
              <button
                onClick={sendMessage}
                style={{ marginLeft: '10px', padding: '8px 15px', background: 'linear-gradient(90deg, #2575fc 0%, #6a11cb 100%)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
              >
                Send
              </button>
            </div>
          </div>
          
          <button
            onClick={endMeeting}
            style={{
              marginTop: '30px',
              padding: '10px 24px',
              background: 'linear-gradient(90deg, #dc3545 0%, #a4508b 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              fontSize: '16px',
              fontWeight: 600
            }}
          >
            End Meeting
          </button>
        </div>
      </div>
    </>
  );
}

export default MeetingPage;

// Gemini translation function
async function translateTextGemini(text, targetLang, apiKey) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + apiKey;
  const prompt = `Translate this to ${targetLang}: ${text}`;
  const body = {
    contents: [{ parts: [{ text: prompt }] }]
  };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || text;
}