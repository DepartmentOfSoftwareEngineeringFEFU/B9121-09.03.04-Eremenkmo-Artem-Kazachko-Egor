import { BrowserRouter, Routes, Route } from 'react-router-dom';
// Объединенный импорт из @mui/material
import { CssBaseline, Box, Container  } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import Header from './components/Header';
import Home from './components/Home';
import UploadCourse from './components/UploadCourse';
import Dashboard from './components/Dashboard';
import StepAnalysis from './components/StepAnalysis';
import StepComparison from './components/StepComparison';
import BreadcrumbsNav from './components/BreadcrumbsNav';
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
        {/* Используем Box для фонового цвета и высоты */}
        <Box
          sx={{
            // Используем цвет фона из темы
           backgroundColor: theme.palette.background.default,
           minHeight: '92vh', // Оставшаяся высота после хедера (если header 8vh)
           width: '100%',
           display: 'flex',
           flexDirection: 'column',
           // alignItems: 'center' // Убираем это, чтобы Container работал на всю ширину
         }}
        >
          <BreadcrumbsNav />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<UploadCourse />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/step/:stepId" element={<StepAnalysis />} />
            <Route path="/compare" element={<StepComparison />} /> {/* Новый маршрут */}
          </Routes>
        </Box>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;