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
// Импортируем mock-данные
const mockMetrics = {
  completions_per_step: {
    157554: 12000,
    157555: 10000,
    157556: 8000,
    1032504: 9500,
    1042109: 11500,
    157557: 7500,
    157558: 9000,
    1032505: 10500,
    1042110: 12500,
    157559: 8500,
    157560: 11000,
    1032506: 9800,
    1042111: 10200,
    157561: 13000,
    157562: 9200,
    1032507: 8200,
    1042112: 11800,
    157563: 10800,
    157564: 7800,
    1032508: 9300,
    1042113: 12200,
    157565: 11200,
    157566: 8800,
    1032509: 10100,
    1042114: 9900,
    157567: 12800,
    157568: 8300,
    1032510: 11300,
    1042115: 7200,
  },
  dropouts_per_step: {
    157554: 500,
    157555: 300,
    157556: 200,
    1032504: 400,
    1042109: 600,
    157557: 250,
    157558: 350,
    1032505: 450,
    1042110: 550,
    157559: 320,
    157560: 480,
    1032506: 380,
    1042111: 420,
    157561: 580,
    157562: 330,
    1032507: 280,
    1042112: 520,
    157563: 430,
    157564: 220,
    1032508: 370,
    1042113: 570,
    157565: 470,
    157566: 390,
    1032509: 410,
    1042114: 360,
    157567: 530,
    157568: 270,
    1032510: 460,
    1042115: 290,
  },
  avg_time_per_step: {
    157554: 150,
    157555: 120,
    157556: 90,
    1032504: 180,
    1042109: 210,
    157557: 110,
    157558: 140,
    1032505: 190,
    1042110: 220,
    157559: 130,
    157560: 200,
    1032506: 170,
    1042111: 160,
    157561: 230,
    157562: 100,
    1032507: 155,
    1042112: 215,
    157563: 185,
    157564: 95,
    1032508: 165,
    1042113: 225,
    157565: 195,
    157566: 135,
    1032509: 175,
    1042114: 145,
    157567: 205,
    157568: 115,
    1032510: 178,
    1042115: 85,
  },
  success_rate: {
    157554: 0.85,
    157555: 0.92,
    157556: 0.78,
    1032504: 0.88,
    1042109: 0.9,
    157557: 0.95,
    157558: 0.82,
    1032505: 0.75,
    1042110: 0.8,
    157559: 0.89,
    157560: 0.72,
    1032506: 0.91,
    1042111: 0.83,
    157561: 0.93,
    157562: 0.77,
    1032507: 0.86,
    1042112: 0.94,
    157563: 0.79,
    157564: 0.81,
    1032508: 0.9,
    1042113: 0.87,
    157565: 0.84,
    157566: 0.96,
    1032509: 0.73,
    1042114: 0.85,
    157567: 0.91,
    157568: 0.76,
    1032510: 0.89,
    1042115: 0.97,
  },
  avg_attempts: {
    157554: 2.3,
    157555: 1.8,
    157556: 2.1,
    1032504: 1.5,
    1042109: 2.5,
    157557: 1.9,
    157558: 2.2,
    1032505: 1.6,
    1042110: 2.4,
    157559: 1.7,
    157560: 2.6,
    1032506: 1.4,
    1042111: 2.0,
    157561: 2.8,
    157562: 1.6,
    1032507: 2.4,
    1042112: 1.9,
    157563: 2.7,
    157564: 1.7,
    1032508: 1.3,
    1042113: 2.1,
    157565: 2.5,
    157566: 1.2,
    1032509: 2.9,
    1042114: 1.8,
    157567: 2.2,
    157568: 1.1,
    1032510: 2.6,
    1042115: 1.4,
  },
  avg_completion_percent: 0.75,
  comments_per_step: {
    157554: 15,
    157555: 10,
    157556: 22,
    1032504: 8,
    1042109: 18,
    157557: 12,
    157558: 25,
    1032505: 9,
    1042110: 16,
    157559: 14,
    157560: 21,
    1032506: 7,
    1042111: 19,
    157561: 11,
    157562: 23,
    1032507: 13,
    1042112: 17,
    157563: 20,
    157564: 6,
    1032508: 16,
    1042113: 19,
    157565: 13,
    157566: 9,
    1032509: 24,
    1042114: 17,
    157567: 10,
    157568: 5,
    1032510: 21,
    1042115: 14,
  },
  question_freq: {
    157554: 0.2,
    157555: 0.1,
    157556: 0.3,
    1032504: 0.15,
    1042109: 0.25,
    157557: 0.18,
    157558: 0.22,
    1032505: 0.12,
    1042110: 0.28,
    157559: 0.16,
    157560: 0.24,
    1032506: 0.11,
    1042111: 0.19,
    157561: 0.27,
    157562: 0.13,
    1032507: 0.21,
    1042112: 0.17,
    157563: 0.26,
    157564: 0.14,
    1032508: 0.23,
    1042113: 0.1,
    157565: 0.19,
    157566: 0.29,
    1032509: 0.16,
    1042114: 0.22,
    157567: 0.28,
    157568: 0.11,
    1032510: 0.13,
    1042115: 0.31,
  },
  self_correction_rate: {
    157554: 0.15,
    157555: 0.1,
    157556: 0.2,
    1032504: 0.12,
    1042109: 0.18,
    157557: 0.11,
    157558: 0.21,
    1032505: 0.13,
    1042110: 0.19,
    157559: 0.17,
    157560: 0.23,
    1032506: 0.09,
    1042111: 0.16,
    157561: 0.22,
    157562: 0.14,
    1032507: 0.19,
    1042112: 0.11,
    157563: 0.17,
    157564: 0.21,
    1032508: 0.15,
    1042113: 0.13,
    157565: 0.19,
    157566: 0.25,
    1032509: 0.1,
    1042114: 0.18,
    157567: 0.24,
    157568: 0.16,
    1032510: 0.12,
    1042115: 0.2,
  },
  avg_time_between_steps: 240,
  full_course_completion: 0.6,
};

const generateMockStepData = (metrics) => {
  const stepIds = Object.keys(metrics.completions_per_step);
  return stepIds.map((stepId, index) => {
    const id = parseInt(stepId, 10);
    return {
      id: index + 1,
      step_id: id,
      name: `Шаг ${id}`,
      completions: metrics.completions_per_step[id] || 0,
      dropouts: metrics.dropouts_per_step[id] || 0,
      avg_time: metrics.avg_time_per_step[id] || 0,
      success_rate:
        metrics.success_rate[id] !== undefined
          ? (metrics.success_rate[id] * 100).toFixed(1) + "%"
          : "0%",
      avg_attempts: metrics.avg_attempts[id] || 0,
      comments: metrics.comments_per_step[id] || 0,
      question_freq:
        metrics.question_freq[id] !== undefined
          ? (metrics.question_freq[id] * 100).toFixed(1) + "%"
          : "0%",
      self_correction_rate:
        metrics.self_correction_rate[id] !== undefined
          ? (metrics.self_correction_rate[id] * 100).toFixed(1) + "%"
          : "0%",
    };
  });
};
const allMockStepData = generateMockStepData(mockMetrics); // Все mock-данные

function StepComparison() {
  const location = useLocation();
  const navigate = useNavigate();
  const [comparisonData, setComparisonData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseId, setCourseId] = useState(null); // ID курса (закодированный)
  const [courseTitle, setCourseTitle] = useState(""); // Название курса
  const [stepIds, setStepIds] = useState([]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const courseIdParamDecoded = params.get("courseId"); // Получаем декодированный ID из URL
    const stepsParam = params.get("steps");

    console.log("--- StepComparison useEffect ---");
    console.log("1. Декодированный ID из URL:", courseIdParamDecoded);

    if (courseIdParamDecoded) {
      setCourseId(courseIdParamDecoded); // Сохраняем декодированный ID

      // --- Получаем название курса из localStorage ---
      const storedCourses = localStorage.getItem("uploadedCourses");
      console.log("2. Данные из localStorage:", storedCourses);
      let courseName = "Неизвестный курс";
      if (storedCourses) {
        try {
          const courses = JSON.parse(storedCourses);
          console.log("3. Распарсенные курсы:", courses);

          // Ищем курс, сравнивая ДЕКОДИРОВАННЫЙ ID из URL с ДЕКОДИРОВАННЫМ ID из localStorage
          const currentCourse = courses.find((course) => {
            const localStorageIdDecoded = decodeURIComponent(course.id); // <<<--- ДЕКОДИРУЕМ ID ИЗ LOCALSTORAGE
            console.log(
              `Сравнение: localStorage Decoded ID (${typeof localStorageIdDecoded}) "${localStorageIdDecoded}" === URL Decoded ID (${typeof courseIdParamDecoded}) "${courseIdParamDecoded}"`
            );
            return localStorageIdDecoded === courseIdParamDecoded; // <<<--- СРАВНИВАЕМ ДЕКОДИРОВАННЫЕ
          });
          console.log("4. Найденный курс:", currentCourse); // Логгируем результат поиска

          if (currentCourse) {
            courseName = currentCourse.name; // Нашли название
          } else {
            console.warn(
              `Курс с ID (декодированным) ${courseIdParamDecoded} не найден в localStorage для заголовка.`
            );
          }
        } catch (e) {
          console.error("Ошибка парсинга localStorage в StepComparison:", e);
          setError("Ошибка чтения данных о курсе."); // Устанавливаем ошибку
        }
      }
      setCourseTitle(courseName);
      // --- Конец получения названия ---

      // --- Логика загрузки данных для сравнения (остается как есть) ---
      if (stepsParam) {
        const ids = stepsParam.split(",").map((id) => parseInt(id.trim(), 10));
        setStepIds(ids);
        setLoading(true);
        setError(null);
        try {
          console.log(
            "Загрузка данных для сравнения шагов:",
            ids,
            "для курса ID (декодированного):",
            courseIdParamDecoded
          );
          const filteredData = allMockStepData.filter((step) =>
            ids.includes(step.step_id)
          );
          if (filteredData.length !== ids.length) {
            console.warn("Не все шаги найдены");
          }
          setTimeout(() => {
            setComparisonData(filteredData);
            setLoading(false);
          }, 500);
        } catch (err) {
          /* ... */
        }
      } else {
        /* ... */
      }
      // --- Конец логики загрузки данных ---
    } else {
      setError("Не указан ID курса.");
      setLoading(false);
    }
  }, [location.search]);

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
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(-1)} // Переход на предыдущую страницу истории
          sx={{ mr: 2 }} // Добавляем отступ справа
        >
          Назад к Дашборду
        </Button>
        <Typography variant="h4" gutterBottom>
          {/* Отображаем название курса из состояния courseTitle */}
          Сравнение шагов курса: {courseTitle}
        </Typography>
      </Box>
      <Typography variant="h6" gutterBottom>
        Сравниваемые шаги: {stepIds.join(", ")}
      </Typography>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        {/* ... код отображения сравнения ... */}
        {comparisonData.map((step) => (
          <Grid
            item
            xs={12}
            md={comparisonData.length > 2 ? 4 : 6}
            key={step.step_id}
          >
            {" "}
            {/* Адаптивная ширина */}
            <Paper elevation={3} sx={{ p: 3, height: "100%" }}>
              <Typography
                variant="h5"
                gutterBottom
                component="div"
                color="primary"
              >
                {step.name} (ID: {step.step_id})
              </Typography>
              <Box>
                <Typography>
                  <strong>Завершения:</strong> {step.completions}
                </Typography>
                <Typography>
                  <strong>Отсевы:</strong> {step.dropouts}
                </Typography>
                <Typography>
                  <strong>Ср. время (сек):</strong> {step.avg_time}
                </Typography>
                <Typography>
                  <strong>Успешность:</strong> {step.success_rate}
                </Typography>
                <Typography>
                  <strong>Ср. попытки:</strong> {step.avg_attempts}
                </Typography>
                <Typography>
                  <strong>Комментарии:</strong> {step.comments}
                </Typography>
                <Typography>
                  <strong>Частота "?":</strong> {step.question_freq}
                </Typography>
                <Typography>
                  <strong>Самокоррекция:</strong> {step.self_correction_rate}
                </Typography>
                {/* Добавьте другие метрики при необходимости */}
              </Box>
            </Paper>
          </Grid>
        ))}
        {comparisonData.length === 0 && !loading && (
          <Grid item xs={12}>
            <Typography sx={{ textAlign: "center", color: "text.secondary" }}>
              Данные для выбранных шагов не найдены.
            </Typography>
          </Grid>
        )}
      </Grid>
    </Container>
  );
}

export default StepComparison;
