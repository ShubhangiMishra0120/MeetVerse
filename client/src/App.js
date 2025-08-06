import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './Home';
import MeetingPage from './MeetingPage';
import VideoRoom from './VideoRoom';
function Root() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/meet/:meetingId" element={<MeetingPage />} />
      </Routes>
    </Router>

  );
}
// ...existing code...

// ...existing code...

function App() {
  // ...existing code...
  return (
    // ...existing code...
    <VideoRoom />
    // ...existing code...
  );
}
// ...existing code...

export default Root;
