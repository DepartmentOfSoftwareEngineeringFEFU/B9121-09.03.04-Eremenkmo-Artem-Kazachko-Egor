// src/components/StepComparison.jsx
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  CircularProgress,
  Alert,
  Button,
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

// Импортируем АКТУАЛЬНЫЙ генератор mock-данных
import { generateMockStepData } from "../mocks/mockData";

// Создаем актуальные mock-данные (для всего курса) здесь
const allMockStepData = generateMockStepData(); // Вызываем импортированную функцию

function StepComparison() {
  const location = useLocation();
  const navigate = useNavigate();
  const [comparisonData, setComparisonData] = useState([]); // Данные для отображения сравнения
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseIdDecoded, setCourseIdDecoded] = useState(null); // Декодированный ID курса из URL
  const [courseTitle, setCourseTitle] = useState(""); // Название курса
  const [stepIds, setStepIds] = useState([]); // ID шагов для сравнения

  useEffect(() => {
    console.log("--- StepComparison useEffect ---");
    const params = new URLSearchParams(location.search);
    const courseIdParam = params.get("courseId"); // Получаем ID из URL (может быть закодирован)
    const stepsParam = params.get("steps");

    // Декодируем ID курса сразу
    let decodedId = null;
    if (courseIdParam) {
      try {
        decodedId = decodeURIComponent(courseIdParam);
        setCourseIdDecoded(decodedId); // Сохраняем декодированный для использования
        console.log("1. Декодированный ID из URL:", decodedId);
      } catch (e) {
        console.error("Ошибка декодирования courseId из URL:", e);
        setError("Некорректный ID курса в URL.");
        setLoading(false);
        return;
      }
    } else {
      console.error("ID курса не найден в URL.");
      setError("Не указан ID курса.");
      setLoading(false);
      return;
    }

    // --- Получаем название курса из localStorage (пока нет API курсов) ---
    const storedCourses = localStorage.getItem("uploadedCourses");
    console.log("2. Данные из localStorage:", storedCourses);
    let courseName = "Неизвестный курс";
    if (storedCourses && decodedId) {
      try {
        const courses = JSON.parse(storedCourses);
        console.log("3. Распарсенные курсы:", courses);

        // Ищем курс, сравнивая ДЕКОДИРОВАННЫЙ ID из URL с ДЕКОДИРОВАННЫМ ID из localStorage
        const currentCourse = courses.find((course) => {
          try {
            const localStorageIdDecoded = decodeURIComponent(course.id);
            // console.log(`Сравнение: localStorage Decoded ID ("${localStorageIdDecoded}") === URL Decoded ID ("${decodedId}")`);
            return localStorageIdDecoded === decodedId;
          } catch {
            return false;
          } // Игнорируем ошибки декодирования из localStorage
        });
        console.log("4. Найденный курс:", currentCourse);

        if (currentCourse) {
          courseName = currentCourse.name;
        } else {
          console.warn(
            `Курс с ID (декодированным) ${decodedId} не найден в localStorage для заголовка.`
          );
        }
      } catch (e) {
        console.error("Ошибка парсинга localStorage в StepComparison:", e);
        // Не устанавливаем глобальную ошибку, только не найдем имя
      }
    }
    setCourseTitle(courseName);
    // --- Конец получения названия ---

    // --- Логика загрузки данных для сравнения (используем mock) ---
    if (stepsParam) {
      const ids = stepsParam.split(",").map((id) => parseInt(id.trim(), 10));
      setStepIds(ids);
      setLoading(true); // Устанавливаем загрузку перед фильтрацией
      setError(null); // Сбрасываем ошибку

      try {
        console.log(
          `Загрузка данных для сравнения шагов: [${ids.join(
            ", "
          )}] для курса ID (декодир.): ${decodedId}`
        );

        // Используем allMockStepData, определенную ВНЕ useEffect
        const filteredData = allMockStepData.filter(
          (step) =>
            // Убедимся, что step.step_id существует и является числом перед сравнением
            typeof step.step_id === "number" && ids.includes(step.step_id)
        );

        if (filteredData.length !== ids.length) {
          console.warn(
            `Не все шаги [${ids.join(", ")}] найдены в mockData (${
              filteredData.length
            } из ${ids.length}).`
          );
          // Можно установить сообщение об ошибке, если какие-то шаги не найдены
          // setError(`Не найдены данные для шагов: ${ids.filter(id => !filteredData.some(step => step.step_id === id)).join(', ')}`);
        } else {
          console.log(`Найдены все ${ids.length} шагов в mockData.`);
        }

        // Сохраняем найденные данные (могут быть не все запрошенные)
        setComparisonData(filteredData);
      } catch (err) {
        console.error("Ошибка при фильтрации mock-данных:", err);
        setError("Ошибка обработки данных для сравнения.");
        setComparisonData([]); // Сбрасываем данные при ошибке
      } finally {
        // Убираем setTimeout, отображаем сразу после фильтрации
        setLoading(false);
      }
    } else {
      console.error("Параметр 'steps' не найден в URL.");
      setError("Не указаны шаги для сравнения в URL.");
      setLoading(false);
    }
    // --- Конец логики загрузки данных ---
  }, [location.search]); // Зависимость от location.search

  // --- Отображение загрузки/ошибки ---
  if (loading) {
    return (
      <Container sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error && comparisonData.length === 0) {
    // Показываем ошибку, только если нет данных для показа
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }
  // --- Конец отображения загрузки/ошибки ---

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Typography variant="h4" gutterBottom component="div">
          {" "}
          {/* Убрал gutterBottom с h4 */}
          Сравнение шагов курса:{" "}
          <Typography component="span" variant="h4" color="primary">
            {courseTitle}
          </Typography>
        </Typography>
      </Box>
      {/* Отображаем ошибку, если она есть, даже если какие-то данные загрузились */}
      {error && comparisonData.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Сравниваемые шаги: {stepIds.join(", ")}
      </Typography>

      <Grid container spacing={3} alignItems="stretch">
        {" "}
        {/* Добавил alignItems="stretch" */}
        {comparisonData.map((step) => (
          <Grid
            item
            // Адаптивная ширина колонок
            xs={12} // На маленьких экранах - полная ширина
            sm={comparisonData.length >= 3 ? 4 : 6} // На средних - 3 или 2 колонки
            md={
              comparisonData.length >= 4
                ? 3
                : comparisonData.length === 3
                ? 4
                : 6
            } // На больших - 4, 3 или 2 колонки
            lg={
              comparisonData.length >= 4
                ? 3
                : comparisonData.length === 3
                ? 4
                : 6
            } // На очень больших
            key={step.step_id}
          >
            <Paper
              elevation={3}
              sx={{
                p: 2,
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {" "}
              {/* height: 100% */}
              <Typography
                variant="h5"
                gutterBottom
                component="div"
                color="primary"
                sx={{ mb: 2 }} // Добавим отступ под заголовком
              >
                {step.name || `Шаг ${step.step_id}`}{" "}
                {/* Используем имя из моков */}
              </Typography>
              <Box sx={{ flexGrow: 1 }}>
                {" "}
                {/* Занимает оставшееся место */}
                {/* Используем ключи из generateMockStepData */}
                <Typography variant="body2">
                  <strong>Завершения:</strong> {step.completions ?? "N/A"}
                </Typography>
                <Typography variant="body2">
                  <strong>Отсевы:</strong> {step.dropouts ?? "N/A"}
                </Typography>
                <Typography variant="body2">
                  <strong>Ср. время (сек):</strong> {step.avg_time ?? "N/A"}
                </Typography>
                <Typography variant="body2">
                  <strong>Успешность:</strong> {step.success_rate ?? "N/A"}
                </Typography>
                <Typography variant="body2">
                  <strong>Ср. попытки:</strong> {step.avg_attempts ?? "N/A"}
                </Typography>
                <Typography variant="body2">
                  <strong>Комментарии:</strong> {step.comments ?? "N/A"}
                </Typography>
                <Typography variant="body2">
                  <strong>Частота "?":</strong> {step.question_freq ?? "N/A"}
                </Typography>
                <Typography variant="body2">
                  <strong>Самокоррекция:</strong>{" "}
                  {step.self_correction_rate ?? "N/A"}
                </Typography>
              </Box>
            </Paper>
          </Grid>
        ))}
        {/* Сообщение, если после фильтрации не осталось данных */}
        {comparisonData.length === 0 && !loading && !error && (
          <Grid item xs={12}>
            <Typography
              sx={{ textAlign: "center", color: "text.secondary", mt: 3 }}
            >
              Данные для выбранных шагов не найдены в mock-данных.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default StepComparison;
