import { useState } from 'react';
import './styles/Home.css';
function Home() {
  const [meetingLink, setMeetingLink] = useState('');

  const createMeeting = async () => {
    const res = await fetch('http://localhost:5000/create-meet', { method: 'POST' });
    const data = await res.json();
    setMeetingLink(data.link);
  };

  return (
    <div className="home-bg">
      <div className="home-card">
        <h1>MeetVerse</h1>
        <button className="create-meeting-btn" onClick={createMeeting}>Create New Meeting</button>
        {meetingLink && (
          <div className="meeting-link-container">
            <p>Share this link:</p>
            <a href={meetingLink}>{meetingLink}</a>
          </div>
        )}
        <div className="join-meeting-container">
          <h3>Join a Meeting</h3>
          <input
            className="meeting-link-input"
            type="text"
            placeholder="Paste meeting link"
            onKeyDown={(e) => {
              if (e.key === 'Enter') window.location.href = e.target.value;
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default Home;