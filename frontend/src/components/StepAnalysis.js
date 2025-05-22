// src/components/StepAnalysis.jsx
import React, { useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import {
  Container,
  Typography,
  Paper,
  Box,
  CircularProgress,
  Alert,
  Grid,
  Divider,
  List, // Для списка инсайтов
  ListItem, // Для списка инсайтов
  ListItemText, // Для списка инсайтов
} from "@mui/material";

import { getStepsStructure } from "../api/apiService";

// Функции форматирования
const formatPercentage = (value, isIndexNotRate = false) => {
  if (value === null || typeof value !== "number" || !isFinite(value))
    return "N/A";
  if (!isIndexNotRate) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return parseFloat(value).toFixed(3);
};

const formatTime = (valueInSeconds) => {
  if (
    valueInSeconds === null ||
    typeof valueInSeconds !== "number" ||
    !isFinite(valueInSeconds) ||
    valueInSeconds < 0
  )
    return "N/A";
  const minutes = Math.floor(valueInSeconds / 60);
  const seconds = Math.round(valueInSeconds % 60);
  if (
    minutes === 0 &&
    seconds === 0 &&
    valueInSeconds > 0 &&
    valueInSeconds < 1
  ) {
    // Для очень малых значений < 1 сек
    return `<1 сек`;
  }
  if (minutes === 0) {
    return `${seconds} сек`;
  }
  return `${minutes} мин ${seconds} сек`;
};

const formatNumber = (value, decimals = 1) => {
  if (value === null || typeof value !== "number" || !isFinite(value))
    return "N/A";
  return parseFloat(value).toFixed(decimals);
};

const formatInteger = (value) => {
  if (value === null || typeof value !== "number" || !isFinite(value))
    return "N/A";
  const intVal = parseInt(value, 10);
  return isNaN(intVal) ? "N/A" : intVal;
};

function StepAnalysis() {
  const { stepId: stepIdFromParams } = useParams();
  const location = useLocation();

  const [stepMetrics, setStepMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseTitle, setCourseTitle] = useState("");

  useEffect(() => {
    const fetchStepData = async () => {
      const params = new URLSearchParams(location.search);
      const courseIdParam = params.get("courseId");

      if (!stepIdFromParams) {
        setError("ID шага не найден в URL.");
        setLoading(false);
        return;
      }
      if (!courseIdParam) {
        setError("ID курса не найден в URL. Невозможно загрузить данные шага.");
        setLoading(false);
        return;
      }

      let numericCourseId;
      let numericStepId;
      try {
        numericCourseId = parseInt(courseIdParam, 10);
        numericStepId = parseInt(stepIdFromParams, 10);
        if (isNaN(numericCourseId) || isNaN(numericStepId)) {
          throw new Error("ID курса или шага не является числом.");
        }
      } catch (e) {
        setError(`Некорректный ID курса или шага: ${e.message}`);
        setLoading(false);
        return;
      }

      const storedCourses = localStorage.getItem("uploadedCourses");
      let cName = `Анализ шага в курсе ID ${numericCourseId}`;
      if (storedCourses) {
        try {
          const courses = JSON.parse(storedCourses);
          const currentCourseData = courses.find(
            (c) => c.id === numericCourseId
          );
          if (currentCourseData) cName = currentCourseData.name;
        } catch (e) {
          console.error("Ошибка чтения localStorage для имени курса:", e);
        }
      }
      setCourseTitle(cName);

      setLoading(true);
      setError(null);
      setStepMetrics(null);

      try {
        console.log(
          `StepAnalysis: Загрузка структуры ВСЕХ шагов для курса ${numericCourseId}, чтобы найти шаг ${numericStepId}...`
        );
        const allStepsInCourse = await getStepsStructure(numericCourseId);

        if (
          !allStepsInCourse ||
          allStepsInCourse.error ||
          !Array.isArray(allStepsInCourse)
        ) {
          throw new Error(
            allStepsInCourse?.details ||
              allStepsInCourse?.error ||
              `Ошибка API при загрузке структуры курса ${numericCourseId}`
          );
        }

        const foundStep = allStepsInCourse.find(
          (s) => s.step_id === numericStepId
        );

        if (foundStep) {
          console.log(
            `StepAnalysis: Найден шаг ${numericStepId} с данными:`,
            JSON.stringify(foundStep, null, 2)
          );
          setStepMetrics(foundStep);
        } else {
          throw new Error(
            `Шаг с ID ${numericStepId} не найден в курсе ID ${numericCourseId}.`
          );
        }
      } catch (err) {
        console.error(
          `StepAnalysis: Ошибка загрузки данных для шага ${numericStepId} в курсе ${numericCourseId}:`,
          err
        );
        setError(err.message || "Не удалось загрузить метрики шага.");
        setStepMetrics(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStepData();
  }, [stepIdFromParams, location.search]);

  // Функция для генерации аналитических заметок
  const getStepInsights = (metrics) => {
    if (!metrics) return { strengths: [], areasForImprovement: [] };

    const insights = {
      strengths: [],
      areasForImprovement: [],
    };

    const {
      success_rate,
      difficulty_index,
      discrimination_index,
      comment_count,
      unique_views,
      completion_index,
      skip_rate,
      avg_attempts_per_passed,
      usefulness_index,
      passed_users_sub,
    } = metrics;

    // Success Rate
    if (typeof success_rate === "number") {
      if (success_rate >= 0.85)
        insights.strengths.push({
          metric: "Успешность шага",
          value: formatPercentage(success_rate),
          note: "Отличная проходимость, студенты хорошо справляются.",
        });
      else if (success_rate < 0.6)
        insights.areasForImprovement.push({
          metric: "Успешность шага",
          value: formatPercentage(success_rate),
          note: "Низкая, рассмотрите упрощение или доп. материалы.",
        });
    }

    // Difficulty Index
    if (typeof difficulty_index === "number") {
      if (difficulty_index >= 0.75)
        insights.strengths.push({
          metric: "Сложность (индекс)",
          value: formatPercentage(difficulty_index, true),
          note: "Шаг воспринимается как относительно легкий.",
        });
      else if (difficulty_index < 0.4)
        insights.areasForImprovement.push({
          metric: "Сложность (индекс)",
          value: formatPercentage(difficulty_index, true),
          note: "Высокая сложность, может требовать пересмотра.",
        });
    }

    // Discrimination Index
    if (typeof discrimination_index === "number") {
      if (discrimination_index >= 0.35)
        insights.strengths.push({
          metric: "Дискриминативность",
          value: formatPercentage(discrimination_index, true),
          note: "Шаг хорошо разделяет сильных и слабых студентов.",
        });
      else if (discrimination_index < 0.15 && discrimination_index !== null)
        insights.areasForImprovement.push({
          metric: "Дискриминативность",
          value: formatPercentage(discrimination_index, true),
          note: "Плохо разделяет студентов, требует анализа (слишком легкий/сложный, нечеткая формулировка).",
        });
    }

    // Avg Attempts
    if (typeof avg_attempts_per_passed === "number") {
      if (avg_attempts_per_passed <= 1.5)
        insights.strengths.push({
          metric: "Ср. попытки (успех)",
          value: formatNumber(avg_attempts_per_passed, 1),
          note: "Студенты быстро находят верное решение.",
        });
      else if (avg_attempts_per_passed > 3.5)
        insights.areasForImprovement.push({
          metric: "Ср. попытки (успех)",
          value: formatNumber(avg_attempts_per_passed, 1),
          note: "Много попыток, возможно, задание неясно или слишком вариативно.",
        });
    }

    // Completion Index ("Дроп")
    if (typeof completion_index === "number") {
      if (completion_index <= 0.03 && completion_index !== null)
        insights.strengths.push({
          metric: "Удержание (низкий 'дроп')",
          value: formatPercentage(completion_index),
          note: "Студенты активно продолжают обучение после этого шага.",
        });
      else if (completion_index > 0.15)
        insights.areasForImprovement.push({
          metric: "Индекс 'дропа'",
          value: formatPercentage(completion_index),
          note: "Высокий, критическая точка отвала студентов.",
        });
    }

    // Usefulness Index
    if (typeof usefulness_index === "number") {
      if (usefulness_index >= 8)
        insights.strengths.push({
          metric: "Полезность (просмотры/уник.)",
          value: formatNumber(usefulness_index, 1),
          note: "Высокая вовлеченность в просмотры, материал интересен.",
        });
      else if (usefulness_index < 2.5 && unique_views > 20)
        insights.areasForImprovement.push({
          metric: "Полезность (просмотры/уник.)",
          value: formatNumber(usefulness_index, 1),
          note: "Низкая, студенты мало пересматривают материал.",
        });
    }

    // Comment Rate
    if (typeof comment_rate === "number" && typeof comment_count === "number") {
      if (comment_rate >= 0.08 && comment_count > 5)
        insights.strengths.push({
          metric: "Активность в комментариях",
          value: `${formatInteger(comment_count)} (${formatPercentage(
            comment_rate
          )})`,
          note: "Студенты активно обсуждают, что может способствовать обучению.",
        });
      else if (comment_count > 15 && comment_rate < 0.05 && unique_views > 30)
        insights.areasForImprovement.push({
          metric: "Комментарии",
          value: formatInteger(comment_count),
          note: "Много комментариев, но низкая доля комментирующих от просмотров. Возможно, группа активных студентов задает много вопросов или есть технические проблемы.",
        });
    }

    // Skip Rate
    if (typeof skip_rate === "number") {
      if (skip_rate > 0.35)
        insights.areasForImprovement.push({
          metric: "Доля пропуска шага",
          value: formatPercentage(skip_rate),
          note: "Значительная часть студентов, не справившись, пропускает шаг. Возможно, он слишком сложен или не воспринимается как обязательный.",
        });
    }

    if (
      insights.strengths.length === 0 &&
      insights.areasForImprovement.length === 0
    ) {
      insights.areasForImprovement.push({
        note: "Ключевые метрики находятся в средних диапазонах или требуют дополнительного контекста для интерпретации. Для более глубокого анализа изучите все показатели.",
      });
    }
    return insights;
  };

  if (loading) {
    return (
      <Container
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "50vh",
        }}
      >
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
  if (!stepMetrics) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="info">
          Данные для этого шага не найдены или не загружены.
        </Alert>
      </Container>
    );
  }

  // Деструктуризация уже сделана для getStepInsights, здесь можно использовать те же переменные
  const {
    step_id,
    step_title_full,
    step_title_short,
    step_type,
    step_cost,
    lesson_id,
    lesson_position,
    module_id,
    module_position,
    module_title,
    course_id,
    step_position,
    views,
    unique_views,
    passed_users_sub,
    all_users_attempted,
    difficulty_index,
    success_rate,
    discrimination_index,
    skip_rate,
    completion_index,
    avg_attempts_per_passed,
    comment_count,
    comment_rate,
    usefulness_index,
    avg_completion_time_filtered_seconds,
  } = stepMetrics;

  const insights = getStepInsights(stepMetrics);

  return (
    <Container maxWidth="lg" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          {step_title_full || step_title_short || `Анализ шага ID: ${step_id}`}
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Курс: "{courseTitle}" (ID: {course_id})
          {module_title && ` | Модуль: ${module_title}`}
          {!module_title && module_id && ` | Модуль ID: ${module_id}`}
          {lesson_id && ` | Урок ID: ${lesson_id}`}
        </Typography>
        <Typography
          variant="caption"
          display="block"
          color="text.secondary"
          sx={{ mt: 0.5 }}
        >
          {step_type && `Тип: ${step_type}`}
          {typeof step_cost === "number" && ` | Баллы: ${step_cost}`}
          {typeof module_position === "number" &&
            ` | Поз. модуля: ${module_position}`}
          {typeof lesson_position === "number" &&
            ` | Поз. урока: ${lesson_position}`}
          {typeof step_position === "number" &&
            ` | Поз. шага: ${step_position}`}
        </Typography>
      </Box>

      <Grid container spacing={2.5}>
        <Grid item xs={12} md={6} lg={4}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Просмотры и Вовлеченность
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Typography>
              <b>Просмотры (всего):</b> {formatInteger(views)}
            </Typography>
            <Typography>
              <b>Уникальные просмотры:</b> {formatInteger(unique_views)}
            </Typography>
            <Typography>
              <b>Полезность (просмотры/уник.):</b>{" "}
              {formatNumber(usefulness_index, 2)}
            </Typography>
            <Typography>
              <b>Пытались сдать:</b> {formatInteger(all_users_attempted)}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Результативность
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Typography>
              <b>Успешно справились:</b> {formatInteger(passed_users_sub)}
            </Typography>
            <Typography>
              <b>Успешность (% прошли/пытались):</b>{" "}
              {formatPercentage(success_rate)}
            </Typography>
            <Typography>
              <b>Среднее кол-во попыток (для успеха):</b>{" "}
              {formatNumber(avg_attempts_per_passed, 1)}
            </Typography>
            <Typography>
              <b>Среднее время выполнения:</b>{" "}
              {formatTime(avg_completion_time_filtered_seconds)}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Качество Задания
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Typography>
              <b>Сложность (индекс):</b>{" "}
              {formatPercentage(difficulty_index, true)}
            </Typography>
            <Typography>
              <b>Дискриминативность (индекс):</b>{" "}
              {formatPercentage(discrimination_index, true)}
            </Typography>
            <Typography>
              <b>Доля пропуска (% не сдавших, пошли дальше):</b>{" "}
              {formatPercentage(skip_rate)}
            </Typography>
            <Typography>
              <b>Индекс "дропа" (% решивших, дропнули курс):</b>{" "}
              {formatPercentage(completion_index)}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6} lg={4}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" gutterBottom color="primary">
              Обратная связь
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            <Typography>
              <b>Кол-во комментариев:</b> {formatInteger(comment_count)}
            </Typography>
            <Typography>
              <b>Доля комментирующих (% от уник. просмотров):</b>{" "}
              {formatPercentage(comment_rate)}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 2, mt: 1, backgroundColor: "action.hover" }}>
            <Typography variant="h6" gutterBottom>
              Аналитические заметки по шагу
            </Typography>

            {insights.strengths.length > 0 && (
              <>
                <Typography
                  variant="subtitle1"
                  sx={{ color: "success.dark", fontWeight: "medium", mt: 1 }}
                >
                  Положительные моменты:
                </Typography>
                <List dense disablePadding sx={{ pl: 1 }}>
                  {insights.strengths.map((item, index) => (
                    <ListItem
                      key={`strength-${index}`}
                      sx={{ pt: 0.2, pb: 0.2 }}
                    >
                      <ListItemText
                        primary={
                          <>
                            <b>{item.metric}:</b> {item.value}
                          </>
                        }
                        secondary={item.note}
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}

            {insights.areasForImprovement.length > 0 && (
              <>
                <Typography
                  variant="subtitle1"
                  sx={{
                    color: "warning.dark",
                    mt: insights.strengths.length > 0 ? 2 : 1,
                    fontWeight: "medium",
                  }}
                >
                  Области для внимания / улучшения:
                </Typography>
                <List dense disablePadding sx={{ pl: 1 }}>
                  {insights.areasForImprovement.map((item, index) => (
                    <ListItem
                      key={`improvement-${index}`}
                      sx={{ pt: 0.2, pb: 0.2 }}
                    >
                      <ListItemText
                        primary={
                          item.metric ? (
                            <>
                              <Box
                                component="span"
                                sx={{ fontWeight: "medium" }}
                              >
                                {item.metric}:
                              </Box>{" "}
                              {item.value}
                            </>
                          ) : null
                        }
                        secondary={item.note}
                        primaryTypographyProps={
                          item.metric ? {} : { fontStyle: "italic" }
                        }
                        secondaryTypographyProps={
                          item.metric
                            ? { sx: { color: "text.secondary" } }
                            : {
                                sx: {
                                  color: "text.primary",
                                  fontStyle: "italic",
                                },
                              }
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              </>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
}

export default StepAnalysis;
