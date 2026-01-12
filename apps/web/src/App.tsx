import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import TaskDetail from './pages/TaskDetail';

import Settings from './pages/Settings';

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tasks/:taskId" element={<TaskDetail />} />
        <Route path="/settings" element={<Settings />} />
        {/* Add placeholders for other routes */}
        <Route path="/active" element={<Dashboard />} />
        <Route path="/history" element={<Dashboard />} />
        <Route path="/integrations" element={<div className="p-8 text-gray-500">Integrations Coming Soon</div>} />
        <Route path="/settings" element={<div className="p-8 text-gray-500">Settings Coming Soon</div>} />
      </Route>
    </Routes>
  );
}

export default App;