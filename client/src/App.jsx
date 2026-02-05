import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import ProjectManager from './pages/ProjectManager';
import Discussion from './pages/Discussion';
import TableOfContents from './pages/TableOfContents';
import Feedback from './pages/Feedback';
import ChapterCreation from './pages/ChapterCreation';
import Deployment from './pages/Deployment';
import Portfolio from './pages/Portfolio';
import BetaDeploy from './pages/BetaDeploy';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/projects" element={<ProjectManager />} />
        <Route path="/discussion" element={<Discussion />} />
        <Route path="/toc" element={<TableOfContents />} />
        <Route path="/feedback" element={<Feedback />} />
        <Route path="/chapters" element={<ChapterCreation />} />
        <Route path="/deploy" element={<Deployment />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/beta" element={<BetaDeploy />} />
      </Route>
    </Routes>
  );
}
