// src/components/ClassificationPage.js
import React, { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom'; // Для получения courseId
import { Container, Typography, CircularProgress, Alert, Paper, Box } from '@mui/material';

function ClassificationPage() {
  const location = useLocation(); // Для получения ?courseId=...
  // const params = useParams(); // Если бы courseId был частью пути /classification/:courseId

  const [courseId, setCourseId] = useState(null);
  const [courseName, setCourseName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Здесь будут состояния для данных классификации

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const id = searchParams.get('courseId');

    if (id) {
      setCourseId(id);
      // Получаем имя курса из localStorage для отображения (аналогично Dashboard)
      const storedCourses = localStorage.getItem("uploadedCourses");
      let cName = `Курс ID ${id}`;
      if (storedCourses) {
        try {
          const courses = JSON.parse(storedCourses);
          const currentCourse = courses.find(c => c.id.toString() === id.toString());
          if (currentCourse) {
            cName = currentCourse.name;
          }
        } catch (e) {
          console.error("Ошибка чтения localStorage для имени курса (Классификация):", e);
        }
      }
      setCourseName(cName);
      setLoading(false); // Пока что просто убираем загрузку
      // TODO: Здесь будет логика загрузки данных для классификации по courseId
      // setError("Функционал классификации находится в разработке.");
    } else {
      setError("ID курса не указан для страницы классификации.");
      setLoading(false);
    }
  }, [location.search]);

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!courseId) {
     return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="warning">Не удалось определить курс для классификации.</Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 3, mb: 3 }}>
      <Typography variant="h4" gutterBottom>
        Классификация для курса: {courseName}
      </Typography>
      <Typography variant="subtitle1" color="text.secondary" gutterBottom>
        (ID Курса: {courseId})
      </Typography>
      <Paper sx={{p: 3, mt: 2}}>
        <Typography variant="h6">Данные классификации:</Typography>
        <Box sx={{mt: 2}}>
            <Alert severity="info" variant="outlined">
                Эта страница находится в разработке. Здесь будут отображаться результаты классификации студентов или материалов курса.
            </Alert>
            {/* Сюда будешь добавлять отображение данных классификации */}
        </Box>
      </Paper>
    </Container>
  );
}

export default ClassificationPage;