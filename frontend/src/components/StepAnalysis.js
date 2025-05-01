// src/components/StepAnalysis.jsx
import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Container,
  Typography,
  Paper,
  Box,
  CircularProgress,
  Alert,
  Grid, // Импортируем Grid
} from "@mui/material";

// --- ИМПОРТИРУЕМ ТОЛЬКО ОДНУ НОВУЮ ФУНКЦИЮ ---
import { getAllStepMetrics } from "../api/apiService"; // Убедись, что путь правильный

// --- Функции-хелперы для форматирования (оставляем как были) ---
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
// ----------------------------------------------------------------------

function StepAnalysis() {
  const { stepId } = useParams();
  const [stepMetrics, setStepMetrics] = useState(null); // Инициализируем как null
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStepData = async () => {
      if (!stepId) {
        setError("ID шага не найден в URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setStepMetrics(null); // Сбрасываем метрики перед загрузкой

      try {
        console.log(`StepAnalysis: Загрузка ВСЕХ метрик для шага ${stepId}...`);
        const combinedMetrics = await getAllStepMetrics(stepId);
        console.log(
          "StepAnalysis: Полученные скомбинированные метрики:",
          combinedMetrics
        );

        if (combinedMetrics && combinedMetrics.error) {
          throw new Error(
            combinedMetrics.details ||
              combinedMetrics.error ||
              `Ошибка от API для шага ${stepId}`
          );
        }

        // Сохраняем весь полученный объект (может быть null, если API вернул 204)
        setStepMetrics(combinedMetrics);
      } catch (err) {
        console.error(
          `StepAnalysis: Ошибка загрузки данных для шага ${stepId}:`,
          err
        );
        setError(err.message || "Не удалось загрузить метрики шага.");
        setStepMetrics(null); // Убедимся, что null при ошибке
      } finally {
        setLoading(false);
      }
    };

    fetchStepData();
  }, [stepId]); // Зависимость только от stepId

  // --- Отображение ---

  // Состояние загрузки
  if (loading) {
    return (
      <Container sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
        <CircularProgress />
      </Container>
    );
  }

  // Состояние ошибки
  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  // ----> ВАЖНО: Проверка на null перед рендерингом данных <----
  // Если загрузка завершилась без ошибок, но данных нет (API вернул null или пустой объект)
  if (!stepMetrics) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="warning">
          Данные для этого шага не найдены или не загружены.
        </Alert>
      </Container>
    );
  }

  // Если все проверки пройдены, рендерим данные
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box
        sx={{ display: "flex", alignItems: "center", mb: 3, flexWrap: "wrap" }}
      >
        {/* ----> Безопасный доступ к данным с fallback <---- */}
        <Typography variant="h4">
          Анализ шага:{" "}
          {stepMetrics?.step_title_full ||
            stepMetrics?.step_title_short ||
            stepMetrics?.step_id ||
            "Неизвестный шаг"}
          {(stepMetrics?.step_title_full || stepMetrics?.step_title_short) &&
            stepMetrics?.step_id && ( // Показываем ID, если есть название
              <Typography
                variant="subtitle1"
                component="span"
                sx={{ ml: 1, color: "text.secondary" }}
              >
                {" "}
                (ID: {stepMetrics.step_id})
              </Typography>
            )}
        </Typography>
      </Box>

      {/* Используем Grid V2 */}
      <Grid container spacing={3}>
        {/* Блок 1: Основные показатели прохождения */}
        <Grid xs={12} md={6} lg={4}>
          {" "}
          {/* V2 синтаксис */}
          <Paper sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Прохождение
            </Typography>
            {/* ----> Безопасный доступ <---- */}
            <Typography>
              <b>Успешно прошли:</b> {formatInteger(stepMetrics?.users_passed)}{" "}
              из {formatInteger(stepMetrics?.all_users_attempted)} пользователей
            </Typography>
            <Typography>
              <b>Результативность (Прошли / Приступили):</b>{" "}
              {formatPercentage(stepMetrics?.step_effectiveness)}
            </Typography>
            <Typography>
              <b>Среднее время до верного ответа:</b>{" "}
              {formatTimeInMinutes(stepMetrics?.avg_completion_time_seconds)}
            </Typography>
          </Paper>
        </Grid>

        {/* Блок 2: Показатели попыток и взаимодействия */}
        <Grid xs={12} md={6} lg={4}>
          {" "}
          {/* V2 синтаксис */}
          <Paper sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Попытки и Взаимодействие
            </Typography>
            {/* ----> Безопасный доступ <---- */}
            <Typography>
              <b>Успешность попыток (Верные / Все):</b>{" "}
              {formatPercentage(stepMetrics?.success_rate)}
            </Typography>
            <Typography>
              <b>Среднее число попыток:</b>{" "}
              {formatNumber(stepMetrics?.avg_attempts_per_passed_user)}
            </Typography>
            <Typography>
              <b>Количество комментариев:</b>{" "}
              {formatInteger(stepMetrics?.comments_count)}
            </Typography>
          </Paper>
        </Grid>

        {/* Блок 3: Дополнительная информация (отображаем, только если есть данные) */}
        {/* ----> Безопасный доступ и условный рендеринг блока <---- */}
        {(stepMetrics?.difficulty !== null ||
          stepMetrics?.discrimination !== null ||
          stepMetrics?.step_type) && (
          <Grid xs={12} md={6} lg={4}>
            {" "}
            {/* V2 синтаксис */}
            <Paper sx={{ p: 3, height: "100%" }}>
              <Typography variant="h6" gutterBottom color="primary">
                Доп. Инфо
              </Typography>
              {/* Условный рендеринг каждого поля */}
              {stepMetrics?.step_type && (
                <Typography>
                  <b>Тип шага:</b> {stepMetrics.step_type}
                </Typography>
              )}
              {stepMetrics?.difficulty !== null && (
                <Typography>
                  <b>Difficulty:</b> {formatNumber(stepMetrics.difficulty, 3)}
                </Typography>
              )}
              {stepMetrics?.discrimination !== null && (
                <Typography>
                  <b>Discrimination:</b>{" "}
                  {formatNumber(stepMetrics.discrimination, 3)}
                </Typography>
              )}
              {stepMetrics?.lesson_id && (
                <Typography>
                  <b>ID Урока:</b> {stepMetrics.lesson_id}
                </Typography>
              )}
              {stepMetrics?.step_position && (
                <Typography>
                  <b>Позиция:</b> {stepMetrics.step_position}
                </Typography>
              )}
            </Paper>
          </Grid>
        )}

        {/* Блок 4: Рекомендации (Заглушка) */}
        <Grid xs={12}>
          {" "}
          {/* V2 синтаксис */}
          <Paper sx={{ p: 2, mt: 2, backgroundColor: "action.hover" }}>
            {" "}
            {/* Используем цвет из темы */}
            <Typography variant="h6" gutterBottom>
              Рекомендации (Заглушка)
            </Typography>
            <Typography paragraph>
              Здесь будут отображаться автоматические рекомендации на основе
              анализа метрик этого шага.
            </Typography>
            {/* Пример условной рекомендации */}
            {stepMetrics?.step_effectiveness < 0.5 && (
              <Typography variant="body2" color="warning.main">
                - Низкая результативность. Возможно, стоит пересмотреть
                сложность или формулировку задания.
              </Typography>
            )}
            {stepMetrics?.comments_count > 10 && ( // Примерный порог
              <Typography variant="body2" color="info.main">
                - Большое количество комментариев. Проверьте, нет ли частых
                вопросов или неясностей.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default StepAnalysis;
