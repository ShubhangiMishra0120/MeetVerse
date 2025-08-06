import React, { useRef, useEffect } from 'react';
import './styles/VideoRoom.css';

function VideoRoom() {
  const videoRef = useRef(null);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
  }, []);

  return (
    <div className="video-room-bg">
      <div className="video-container">
        <video ref={videoRef} autoPlay playsInline className="main-video" />
        <div className="video-overlay">
          <h2>Welcome to MeetVerse!</h2>
        </div>
      </div>
    </div>
  );
}

export default VideoRoom;