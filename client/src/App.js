import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

function App() {
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [socket, setSocket] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('en');

  // --- WEBRTC STATES AND REFS ---
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const peerConnection = useRef(null); // Use useRef to persist RTCPeerConnection
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  // --- END WEBRTC STATES AND REFS ---

  // Main useEffect for Socket.io connection and cleanup
  useEffect(() => {
    console.log('Main App useEffect triggered: Initializing socket.');
    const newSocket = io('http://localhost:5000'); // Ensure this matches your backend port
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ Connected to server:', newSocket.id);
    });

    newSocket.on('messageResponse', (data) => {
      setChatMessages((prevMessages) => [...prevMessages, data]);
    });

    // --- WEBRTC SIGNALING LISTENERS ---
    newSocket.on('offer', async (offer) => {
      console.log('Received offer:', offer);
      if (peerConnection.current && localStream) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        newSocket.emit('answer', answer);
        console.log('Sent answer:', answer); // Log the sent answer
      } else {
        console.warn('Cannot process offer: peerConnection not ready or localStream not obtained yet.');
      }
    });

    newSocket.on('answer', async (answer) => {
      console.log('Received answer:', answer);
      if (peerConnection.current) {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    newSocket.on('ice-candidate', async (candidate) => {
      console.log('Received ICE candidate:', candidate);
      if (peerConnection.current) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Error adding received ICE candidate:', e);
        }
      }
    });
    // --- END WEBRTC SIGNALING LISTENERS ---

    // Cleanup function for socket and media streams
    return () => {
      console.log('App cleanup function running.');
      if (newSocket) {
        newSocket.disconnect();
        console.log('❌ Client disconnected: (on unmount)');
      }
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop()); // Stop camera/mic
        console.log('Local stream tracks stopped.');
      }
      if (peerConnection.current) {
        peerConnection.current.close(); // Close peer connection
        console.log('Peer connection closed.');
      }
    };
  }, []); // Empty dependency array: runs ONCE on mount, cleanup ONCE on unmount


  // Dedicated useEffect to handle setting local video stream to ref
  // This runs whenever localStream state changes.
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log("Dedicated useEffect for localVideoRef: Setting srcObject and playing.");
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error("Error playing local video (dedicated useEffect):", e));
    } else if (localVideoRef.current && !localStream) {
      // If localStream becomes null (e.g., on cleanup/error), clear the video
      console.log("Dedicated useEffect for localVideoRef: Clearing srcObject as localStream is null.");
      localVideoRef.current.srcObject = null;
    }
  }, [localStream]); // Dependency array: only re-run when localStream changes


  // --- WEBRTC INITIALIZATION useEffect (Corrected Logic) ---
  // This useEffect will trigger when 'socket' state is updated and 'peerConnection.current' is null.
  // It ensures setupWebRTC runs once to initialize peer connection and get media.
  useEffect(() => {
    if (socket && !peerConnection.current) { // Only call setupWebRTC if socket is ready AND peerConnection is NOT initialized
      console.log('WebRTC setup useEffect: Socket ready and peerConnection not yet initialized. Calling setupWebRTC...');
      setupWebRTC();
    } else if (!socket) {
      console.log('WebRTC setup useEffect: Socket not ready yet.');
    } else if (peerConnection.current) {
      console.log('WebRTC setup useEffect: PeerConnection already established, skipping setupWebRTC.');
    }
  }, [socket]); // Dependency array: only trigger when socket object itself changes (initial connection)


  const setupWebRTC = async () => {
    console.log('setupWebRTC function started.'); // Debug log
    try {
      console.log('Attempting to get user media (camera/mic)...'); // Debug log
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('User media stream obtained successfully:', stream); // THIS IS THE KEY LOG!

      setLocalStream(stream); // Set local stream in state, will trigger the dedicated useEffect for local video display


      // Create a new RTCPeerConnection
      console.log('Creating RTCPeerConnection...'); // Debug log
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });
      peerConnection.current = pc; // Store in ref
      console.log('RTCPeerConnection created:', pc); // Debug log

      // Add local tracks to the peer connection
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        console.log('Added track:', track.kind, 'to peer connection.'); // Debug log
      });

      // Handle incoming remote tracks
      pc.ontrack = (event) => {
        console.log('Remote track received:', event.streams[0]);
        setRemoteStream(event.streams[0]); // Set remote stream in state
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = event.streams[0];
          remoteVideoRef.current.play().catch(e => console.error("Error playing remote video:", e));
        }
      };

      // Handle ICE candidates (network information)
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('Sending ICE candidate:', event.candidate);
          socket.emit('ice-candidate', event.candidate);
        }
      };

      // Handle negotiation needed (when peer connection state changes, like adding tracks)
      pc.onnegotiationneeded = async () => {
        console.log('Negotiation needed: scheduling offer creation...');
        // Added a small timeout here to allow initial setup to complete before sending offer
        setTimeout(async () => {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket.emit('offer', offer);
                console.log('Sending offer after delay:', offer);
            } catch (e) {
                console.error('Error creating or sending offer during negotiation (after delay):', e);
            }
        }, 500); // 500ms delay
      };

    } catch (error) {
      console.error('FATAL ERROR: Error accessing media devices or setting up WebRTC:', error);
      alert(`Could not access camera/microphone: ${error.name || error.message}. Please ensure they are not in use and permissions are granted in your browser and OS settings.`);
      setLocalStream(null); // Reset localStream state on error
    }
  };


  const sendMessage = () => {
    if (socket && message.trim()) {
      const timestamp = new Date().toLocaleTimeString();
      const messageData = {
        id: socket.id,
        text: message,
        timestamp: timestamp,
        senderLanguage: selectedLanguage
      };
      socket.emit('message', messageData);
      setMessage('');
    }
  };

  const getDisplayMessage = (msg) => {
    // Updated to use the corrected mocked translation keys from server/index.js
    if (selectedLanguage === 'en') {
      return msg.translatedTextEn || msg.text;
    } else if (selectedLanguage === 'hi') {
      return msg.translatedTextHi || msg.text;
    }
    return msg.text;
  };

  return (
    <div className="App" style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>MeetVerse</h1>
      <p>Real-time connection established. Check browser console.</p>
      <p>Your Socket ID: {socket ? socket.id : 'Connecting...'}</p>

      {/* --- VIDEO SECTION --- */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
        <div style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px' }}>
          <h3>My Video</h3>
          {localStream ? (
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '300px', height: '225px', backgroundColor: '#333', borderRadius: '4px' }} />
          ) : (
            <p>Accessing camera/microphone...</p>
          )}
        </div>
        <div style={{ border: '1px solid #ccc', padding: '10px', borderRadius: '8px' }}>
          <h3>Remote Video</h3>
          {remoteStream ? (
            <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '300px', height: '225px', backgroundColor: '#333', borderRadius: '4px' }} />
          ) : (
            <p>Waiting for remote peer...</p>
          )}
        </div>
      </div>
      {/* --- END VIDEO SECTION --- */}

      <div style={{
        marginTop: '30px',
        border: '1px solid #ccc',
        padding: '15px',
        borderRadius: '8px',
        maxWidth: '500px',
        margin: '30px auto'
      }}>
        <h2>Real-time Chat</h2>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="language-select" style={{ marginRight: '10px' }}>Display Language:</label>
          <select
            id="language-select"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            style={{ padding: '5px', borderRadius: '4px', border: '1px solid #ccc' }}
          >
            <option value="en">English</option>
            <option value="hi">हिंदी (Hindi)</option>
          </select>
        </div>
        <div style={{ height: '300px', overflowY: 'scroll', border: '1px solid #eee', padding: '10px', marginBottom: '10px', borderRadius: '4px' }}>
          {chatMessages.map((msg, index) => (
            <p key={index} style={{ margin: '5px 0', fontSize: '0.9em' }}>
              <strong>{msg.id ? msg.id.substring(0, 5) : 'Unknown'}... ({msg.timestamp}):</strong>{' '}
              {getDisplayMessage(msg)}
            </p>
          ))}
        </div>
        <div style={{ display: 'flex' }}>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                sendMessage();
              }
            }}
            placeholder="Type your message..."
            style={{ flexGrow: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
          />
          <button
            onClick={sendMessage}
            style={{ marginLeft: '10px', padding: '8px 15px', backgroundColor: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;