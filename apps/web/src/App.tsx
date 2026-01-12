import { Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import TaskDetail from './pages/TaskDetail';

function App() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks/:taskId" element={<TaskDetail />} />
      </Routes>
    </div>
  );
}

export default App;