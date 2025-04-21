// frontend/src/App.js
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CssBaseline } from '@mui/material'; // Убираем Container
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Header from './components/Header';
import Home from './components/Home';
import UploadCourse from './components/UploadCourse';
import Dashboard from './components/Dashboard';
import StepAnalysis from './components/StepAnalysis';

const theme = createTheme({
  palette: {
    primary: {
      main: '#2196f3',
    },
    secondary: {
      main: '#f50057',
    },
  },
});

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Header />
        {/* Убираем Container */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/upload" element={<UploadCourse />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/step/:stepId" element={<StepAnalysis />} />
        </Routes>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;