import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './Layout';
import Projects from './pages/Projects';
import ProjectDashboard from './pages/ProjectDashboard';
import ProjectPages from './pages/ProjectPages';
import ProjectIssues from './pages/ProjectIssues';
import AiAssistant from './pages/AiAssistant';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Projects />} />
          <Route path="projects/:id" element={<ProjectDashboard />} />
          <Route path="projects/:id/pages" element={<ProjectPages />} />
          <Route path="projects/:id/issues" element={<ProjectIssues />} />
          <Route path="ai" element={<AiAssistant />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
