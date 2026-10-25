import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Overview from './pages/Overview';
import LogExplorer from './pages/LogExplorer';
import Anomalies from './pages/Anomalies';
import Analytics from './pages/Analytics';
import Evaluation from './pages/Evaluation';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/"           element={<Overview />} />
            <Route path="/logs"       element={<LogExplorer />} />
            <Route path="/anomalies"  element={<Anomalies />} />
            <Route path="/analytics"  element={<Analytics />} />
            <Route path="/evaluation" element={<Evaluation />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
