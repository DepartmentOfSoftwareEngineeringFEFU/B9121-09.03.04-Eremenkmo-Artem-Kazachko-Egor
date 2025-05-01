// src/components/StepComparison.jsx
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  CircularProgress,
  Alert,
} from "@mui/material";

// --- ИМПОРТИРУЕМ ФУНКЦИЮ API ---
import { getAllStepMetrics } from "../api/apiService"; // Используем тот же API, что и StepAnalysis

// --- ИМПОРТИРУЕМ ФУНКЦИИ ФОРМАТИРОВАНИЯ (можно вынести в отдельный файл utils) ---
const formatPercentage = (value) => {
  if (typeof value !== "number" || !isFinite(value)) return "N/A";
  return `${(value * 100).toFixed(1)}%`;
};
const formatTimeInMinutes = (value) => {
  if (value === null || typeof value === "undefined") return "N/A";
  const numValueInSeconds = parseFloat(value);
  if (
    isNaN(numValueInSeconds) ||
    !isFinite(numValueInSeconds) ||
    numValueInSeconds < 0
  )
    return "N/A";
  const minutes = numValueInSeconds / 60;
  return `${minutes.toFixed(1)} мин`;
};
const formatNumber = (value, decimals = 1) => {
  if (value === null || typeof value === "undefined") return "N/A";
  const numValue = parseFloat(value);
  if (isNaN(numValue) || !isFinite(numValue)) return "N/A";
  return numValue.toFixed(decimals);
};
const formatInteger = (value) => {
  if (value === null || typeof value === "undefined") return "N/A";
  const intValue = parseInt(value, 10);
  if (isNaN(intValue) || !isFinite(intValue)) return "N/A";
  return intValue;
};
// ---------------------------------------------------------------------------------

function StepComparison() {
  const location = useLocation();

  // comparisonData будет массивом объектов с метриками для каждого шага
  const [comparisonData, setComparisonData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [stepIds, setStepIds] = useState([]);

  useEffect(() => {
    console.log("--- StepComparison useEffect [location.search] ---");
    const params = new URLSearchParams(location.search);
    const courseIdParam = params.get("courseId");
    const stepsParam = params.get("steps");

    // --- 1. Обработка ID курса (как и было) ---
    let decodedId = null;
    if (courseIdParam) {
      try {
        decodedId = decodeURIComponent(courseIdParam);
        console.log("   Декодированный ID курса:", decodedId);
      } catch (e) {
        console.error("   Ошибка декодирования courseId:", e);
        setError("Некорректный ID курса в URL.");
        setLoading(false);
        return;
      }
    } else {
      setError("Не указан ID курса.");
      setLoading(false);
      return;
    }

    // --- 2. Получение названия курса из localStorage (как и было) ---
    const storedCourses = localStorage.getItem("uploadedCourses");
    let courseName = "Неизвестный курс";
    if (storedCourses && decodedId) {
      try {
        const courses = JSON.parse(storedCourses);
        const currentCourse = courses.find(
          (c) => decodeURIComponent(c.id) === decodedId
        );
        if (currentCourse) courseName = currentCourse.name;
      } catch (e) {
        console.error("   Ошибка парсинга localStorage:", e);
      }
    }
    setCourseTitle(courseName);

    // --- 3. Загрузка РЕАЛЬНЫХ данных для шагов ---
    if (stepsParam) {
      const ids = stepsParam
        .split(",")
        .map((id) => parseInt(id.trim(), 10))
        .filter((id) => !isNaN(id)); // Убираем нечисловые ID

      if (ids.length === 0) {
        setError("Не найдены ID шагов для сравнения в URL.");
        setLoading(false);
        return;
      }

      setStepIds(ids);
      setLoading(true);
      setError(null);
      setComparisonData([]); // Очищаем предыдущие данные

      const fetchComparisonData = async () => {
        console.log(
          `   Загрузка данных для сравнения шагов: [${ids.join(", ")}]`
        );
        try {
          // Используем Promise.all для параллельной загрузки данных всех шагов
          const results = await Promise.all(
            ids.map((id) => getAllStepMetrics(id)) // Вызываем API для каждого ID
          );
          console.log("   Получены данные для сравнения:", results);
          // Фильтруем результаты на случай, если какой-то шаг вернул ошибку или null
          const validResults = results.filter((res) => res && !res.error);
          if (validResults.length !== ids.length) {
            console.warn(
              `   Не все шаги удалось загрузить. Загружено ${validResults.length} из ${ids.length}`
            );
            // Можно установить частичную ошибку, если нужно
            // setError(`Не удалось загрузить данные для некоторых шагов.`);
          }
          setComparisonData(validResults); // Сохраняем успешно загруженные данные
        } catch (err) {
          console.error(
            "   КРИТИЧЕСКАЯ ОШИБКА при загрузке данных для сравнения:",
            err
          );
          setError(err.message || "Не удалось загрузить данные для сравнения.");
          setComparisonData([]); // Очищаем данные при ошибке
        } finally {
          setLoading(false);
        }
      };

      fetchComparisonData();
    } else {
      setError("Не указаны шаги для сравнения в URL.");
      setLoading(false);
    }
    // --- Конец логики загрузки ---
  }, [location.search]); // Зависимость от location.search

  // --- Отображение загрузки/ошибки ---
  if (loading) {
    return (
      <Container sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
        <CircularProgress />
      </Container>
    );
  }

  // Отображаем ошибку, если данных нет СОВСЕМ
  if (error && comparisonData.length === 0) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }
  // --- Конец отображения загрузки/ошибки ---

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", mb: 2, flexWrap: "wrap" }}
      >
        <Typography variant="h4" component="div">
          {" "}
          {/* Убрал gutterBottom с h4 */}
          Сравнение шагов курса:{" "}
          <Typography component="span" variant="h4" color="text.secondary">
            {courseTitle}
          </Typography>
        </Typography>
      </Box>

      {/* Отображаем ошибку, если она есть, но какие-то данные загрузились */}
      {error && comparisonData.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error} (Некоторые шаги могли не загрузиться)
        </Alert>
      )}

      <Typography variant="h6" gutterBottom sx={{ mb: 3 }}>
        Сравниваемые шаги (ID): {stepIds.join(", ")}
      </Typography>

      {/* Используем Grid V2 для адаптивности */}
      <Grid container spacing={3} alignItems="stretch">
        {comparisonData.map(
          (
            step // step теперь содержит полный объект метрик
          ) => (
            <Grid
              // Адаптивная ширина колонок (как в Dashboard)
              xs={12}
              sm={comparisonData.length >= 3 ? 4 : 6}
              md={
                comparisonData.length >= 4
                  ? 3
                  : comparisonData.length === 3
                  ? 4
                  : 6
              }
              lg={
                comparisonData.length >= 4
                  ? 3
                  : comparisonData.length === 3
                  ? 4
                  : 6
              }
              key={step.step_id} // Используем step_id как ключ
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
                {/* Используем данные из step */}
                <Typography
                  variant="h5"
                  gutterBottom
                  component="div"
                  color="primary"
                  sx={{ mb: 2 }}
                >
                  {/* Отображаем полное или короткое название, или ID */}
                  {step.step_title_full ||
                    step.step_title_short ||
                    `Шаг ${step.step_id}`}
                </Typography>
                <Box sx={{ flexGrow: 1 }}>
                  {/* Отображаем метрики, используя функции форматирования */}
                  <Typography variant="body2">
                    <strong>Успешно прошли:</strong>{" "}
                    {formatInteger(step.users_passed)} /{" "}
                    {formatInteger(step.all_users_attempted)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Результативность:</strong>{" "}
                    {formatPercentage(step.step_effectiveness)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Ср. время:</strong>{" "}
                    {formatTimeInMinutes(step.avg_completion_time_seconds)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Успешность попыток:</strong>{" "}
                    {formatPercentage(step.success_rate)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Ср. число попыток:</strong>{" "}
                    {formatNumber(step.avg_attempts_per_passed_user)}
                  </Typography>
                  <Typography variant="body2">
                    <strong>Комментарии:</strong>{" "}
                    {formatInteger(step.comments_count)}
                  </Typography>
                  {/* Доп. метрики, если они есть */}
                  {step.difficulty !== null && (
                    <Typography variant="body2">
                      <strong>Difficulty:</strong>{" "}
                      {formatNumber(step.difficulty, 3)}
                    </Typography>
                  )}
                  {step.discrimination !== null && (
                    <Typography variant="body2">
                      <strong>Discrimination:</strong>{" "}
                      {formatNumber(step.discrimination, 3)}
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>
          )
        )}
        {/* Сообщение, если после загрузки не осталось данных */}
        {comparisonData.length === 0 && !loading && !error && (
          <Grid xs={12}>
            {" "}
            {/* Используем Grid V2 */}
            <Typography
              sx={{ textAlign: "center", color: "text.secondary", mt: 3 }}
            >
              Нет данных для отображения сравнения. Возможно, указанные шаги не
              найдены или произошла ошибка загрузки.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default StepComparison;
