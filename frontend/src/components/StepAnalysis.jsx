// src/components/StepAnalysis.jsx
import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  CircularProgress,
  Alert,
  Grid, // Добавим Grid для расположения
} from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

// Импортируем все нужные функции API
import {
  getUsersPassedStep,
  getStepEffectiveness,
  getAvgCompletionTime,
  getStepSuccessRate,
  getAvgAttemptsPerPassed,
  getStepCommentsCount,
} from "../api/apiService"; // Убедись, что путь правильный

// Хелпер для форматирования чисел (можно вынести)
const formatPercentage = (value) => {
  if (typeof value !== "number") return "N/A";
  return `${(value * 100).toFixed(1)}%`;
};

const formatTimeInMinutes = (value) => {
  // <-- Новое имя
  // Сначала проверим на null или undefined
  if (value === null || typeof value === "undefined") {
    return "N/A";
  }
  // Пытаемся преобразовать значение в число (секунды)
  const numValueInSeconds = parseFloat(value);
  // Проверяем, удалось ли преобразование и является ли результат числом
  if (isNaN(numValueInSeconds) || !isFinite(numValueInSeconds)) {
    console.warn(
      `formatTimeInMinutes: Не удалось преобразовать '${value}' в число.`
    );
    return "N/A";
  }
  // Конвертируем секунды в минуты
  const minutes = numValueInSeconds / 60;
  // Форматируем минуты (например, до одного знака после запятой)
  return `${minutes.toFixed(1)} мин`; // <-- Изменили единицу измерения
};

const formatNumber = (value) => {
  /* ... возможно, тут тоже нужна похожая проверка ... */
  if (value === null || typeof value === "undefined") return "N/A";
  const numValue = parseFloat(value);
  if (isNaN(numValue) || !isFinite(numValue)) {
    console.warn(`formatNumber: Не удалось преобразовать '${value}' в число.`);
    return "N/A";
  }
  return numValue.toFixed(1);
};

const formatInteger = (value) => {
  /* ... и здесь ... */
  if (value === null || typeof value === "undefined") return "N/A";
  const intValue = parseInt(value, 10); // Используем parseInt для целых
  if (isNaN(intValue) || !isFinite(intValue)) {
    console.warn(
      `formatInteger: Не удалось преобразовать '${value}' в целое число.`
    );
    return "N/A";
  }
  return intValue;
};

function StepAnalysis() {
  const { stepId } = useParams(); // Получаем stepId из URL
  const navigate = useNavigate();

  const [stepMetrics, setStepMetrics] = useState(null); // Состояние для хранения всех метрик шага
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Функция для загрузки данных
    const fetchStepData = async () => {
      if (!stepId) {
        setError("ID шага не найден в URL.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setStepMetrics(null); // Сбрасываем предыдущие данные

      try {
        console.log(`StepAnalysis: Загрузка метрик для шага ${stepId}...`);
        // Выполняем все запросы параллельно
        const results = await Promise.all([
          getUsersPassedStep(stepId), // Результат 0
          getStepEffectiveness(stepId), // Результат 1
          getAvgCompletionTime(stepId), // Результат 2
          getStepSuccessRate(stepId), // Результат 3
          getAvgAttemptsPerPassed(stepId), // Результат 4
          getStepCommentsCount(stepId), // Результат 5
        ]);

        console.log("StepAnalysis: Полученные результаты API:", results);

        // Собираем данные в один объект
        const combinedMetrics = {
          stepId: parseInt(stepId, 10), // Сохраняем ID
          // Из результата 0
          usersPassed: results[0]?.users_passed,
          allUsers: results[0]?.all_users,
          // Из результата 1
          effectiveness: results[1]?.step_effectiveness,
          // Из результата 2
          avgCompletionTime: results[2]?.avg_completion_time_seconds,
          // Из результата 3
          successRate: results[3]?.success_rate,
          // Из результата 4
          avgAttempts: results[4]?.avg_attempts_per_passed_user,
          // Из результата 5
          commentsCount: results[5]?.comments_count,
        };

        console.log("StepAnalysis: Скомбинированные метрики:", combinedMetrics);
        setStepMetrics(combinedMetrics);
      } catch (err) {
        console.error(
          `StepAnalysis: Ошибка загрузки данных для шага ${stepId}:`,
          err
        );
        setError(err.message || "Не удалось загрузить метрики шага.");
        setStepMetrics(null); // Сброс данных при ошибке
      } finally {
        setLoading(false);
      }
    };

    fetchStepData(); // Вызываем функцию загрузки
  }, [stepId]); // Перезапускаем эффект, если stepId изменился

  // --- Отображение ---

  if (loading) {
    return (
      <Container sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
        <CircularProgress />
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)} // Переход назад
          sx={{ mt: 2 }}
        >
          Назад
        </Button>
      </Container>
    );
  }

  if (!stepMetrics) {
    // Если не загрузка и не ошибка, но данных нет (маловероятно, но возможно)
    return (
      <Container sx={{ mt: 4 }}>
        <Typography>Данные для этого шага не найдены.</Typography>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)} // Переход назад
          sx={{ mt: 2 }}
        >
          Назад
        </Button>
      </Container>
    );
  }

  // Если все успешно загружено
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        {/* Можно добавить название шага, если оно будет приходить из API */}
        <Typography variant="h4">Анализ шага: {stepMetrics.stepId}</Typography>
      </Box>

      {/* Используем Grid для отображения метрик в несколько колонок */}
      <Grid container spacing={3}>
        {/* Блок 1: Основные показатели прохождения */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Прохождение
            </Typography>
            <Typography>
              <b>Успешно прошли:</b> {formatInteger(stepMetrics.usersPassed)} из{" "}
              {formatInteger(stepMetrics.allUsers)} пользователей
            </Typography>
            <Typography>
              <b>Результативность (Прошли / Приступили):</b>{" "}
              {formatPercentage(stepMetrics.effectiveness)}
            </Typography>
            <Typography>
              <b>Среднее время до верного ответа:</b>{" "}
              {formatTimeInMinutes(stepMetrics.avgCompletionTime)}
            </Typography>
          </Paper>
        </Grid>

        {/* Блок 2: Показатели попыток и взаимодействия */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Попытки и Взаимодействие
            </Typography>
            <Typography>
              <b>Успешность попыток (Верные / Все):</b>{" "}
              {formatPercentage(stepMetrics.successRate)}
            </Typography>
            <Typography>
              <b>Среднее число попыток на прошедшего:</b>{" "}
              {formatNumber(stepMetrics.avgAttempts)}
            </Typography>
            <Typography>
              <b>Количество комментариев:</b>{" "}
              {formatInteger(stepMetrics.commentsCount)}
            </Typography>
          </Paper>
        </Grid>

        {/* TODO: Блок 3: Рекомендации (потребует отдельного API или логики) */}
        <Grid item xs={12}>
          <Paper sx={{ p: 2, mt: 2, backgroundColor: "#f5f5f5" }}>
            <Typography variant="h6" gutterBottom>
              Рекомендации (Заглушка)
            </Typography>
            <Typography paragraph>
              Здесь будут отображаться автоматические рекомендации на основе
              анализа метрик (например, если результативность низкая или время
              большое). Пока не реализовано.
            </Typography>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default StepAnalysis;
