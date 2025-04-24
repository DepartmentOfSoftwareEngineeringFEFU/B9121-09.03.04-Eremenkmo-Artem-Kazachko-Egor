// src/components/Dashboard.jsx
import React, { useState, useEffect } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Alert,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// Импорт API функции (убедитесь, что путь правильный)
// Пока закомментируем вызов API для шагов, так как он еще не реализован на бэкенде
import {
  getCourseCompletionRate80Percent /*, getAllStepMetricsForCourse */,
} from "../api/apiService";

// Импорт компонентов
import MetricSelector from "./MetricSelector";
import Recommendations from "./Recommendations";

// ВРЕМЕННО: Оставляем Mock-данные, пока не будет API для метрик шагов
// В будущем этот импорт нужно будет удалить
// Стало так:
import { mockMetrics, generateMockStepData } from "../mocks/mockData.js"; // Или просто '../mocks/mockData' // Предполагается, что вы вынесли моки в отдельный файл

// --- Начало описания метрик (для селектора) ---
const availableMetrics = [
  { value: "completions", label: "Завершения", dataKey: "completions" },
  { value: "dropouts", label: "Отсевы", dataKey: "dropouts" },
  { value: "avg_time", label: "Среднее время (сек)", dataKey: "avg_time" },
  {
    value: "avg_attempts",
    label: "Среднее число попыток",
    dataKey: "avg_attempts",
  },
  { value: "comments", label: "Комментарии", dataKey: "comments" },
  // Добавьте другие метрики при необходимости, когда они появятся в API ответах
];
// --- Конец описания метрик ---

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [courseId, setCourseId] = useState(null); // Декодированный ID курса из URL
  const [courseTitle, setCourseTitle] = useState("Загрузка...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Состояние для хранения данных, полученных с бэкенда или моков
  const [metricsData, setMetricsData] = useState({
    steps: [], // Массив данных по шагам для таблицы/графика
    global: {
      // Объект с глобальными метриками
      completionRate: null,
      usersCompleted: null,
      totalLearners: null,
      // Пока оставим моки для других глобальных метрик
      avg_completion_percent: mockMetrics.avg_completion_percent,
      avg_time_between_steps: mockMetrics.avg_time_between_steps,
    },
  });

  const [selectedMetric, setSelectedMetric] = useState(availableMetrics[0]);
  const [selectedStepIds, setSelectedStepIds] = useState([]);

  // Эффект для загрузки данных при изменении ID курса в URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idFromUrlDecoded = params.get("courseId"); // Получаем декодированный ID

    if (idFromUrlDecoded) {
      setCourseId(idFromUrlDecoded);
      setLoading(true);
      setError(null);

      // --- Получение имени курса (из localStorage, пока нет API для курсов) ---
      const storedCourses = localStorage.getItem("uploadedCourses");
      let courseName = "Курс не найден";
      if (storedCourses) {
        try {
          const courses = JSON.parse(storedCourses);
          // Ищем по ДЕКОДИРОВАННОМУ ID
          const currentCourse = courses.find(
            (c) => decodeURIComponent(c.id) === idFromUrlDecoded
          );
          if (currentCourse) {
            courseName = currentCourse.name;
          } else {
            console.warn(
              `Курс с ID "${idFromUrlDecoded}" не найден в localStorage.`
            );
          }
        } catch (e) {
          console.error("Ошибка парсинга localStorage в Dashboard:", e);
          setError("Ошибка чтения данных о курсе.");
        }
      }
      setCourseTitle(courseName);
      // --- Конец получения имени ---

      // --- Получение данных с API ---
      const fetchData = async () => {
        try {
          const [completionData, stepsData] = await Promise.all([
            getCourseCompletionRate80Percent(), // <-- Изменили вызов
            Promise.resolve(generateMockStepData()), // Mock для шагов
          ]);

          console.log(
            "Dashboard: Получены данные 80% Completion Rate:",
            completionData
          ); // Обновили лог

          // Адаптируем извлечение данных
          const globalMetricsUpdate = {
            completionRate: completionData?.course_completion_rate_80_percent, // <-- Используем новое поле
            usersCompleted: completionData?.users_completed_at_80_percent, // <-- Используем новое поле
            totalLearners: completionData?.total_learners, // Поле вроде то же
            // Можно добавить новые поля для отображения, если нужно
            totalSubmittableSteps: completionData?.total_submittable_steps,
            thresholdSteps: completionData?.threshold_steps_for_80_percent,
            completionMessage: completionData?.message, // Сообщение от бэкенда
          };

          // Проверка на ошибку в ответе API (если она передается в теле)
          if (completionData && completionData.error) {
            throw new Error(
              `Ошибка расчета Completion Rate на бэкенде: ${
                completionData.details || completionData.error
              }`
            );
          }

          setMetricsData((prev) => ({
            steps: stepsData, // Обновляем шаги (пока мок)
            global: { ...prev.global, ...globalMetricsUpdate }, // Обновляем глобальные
          }));
        } catch (err) {
          console.error("Ошибка загрузки данных дашборда:", err);
          setError(err.message || "Не удалось загрузить данные для дашборда.");
          setMetricsData((prev) => ({ ...prev, global: {}, steps: [] })); // Сброс при ошибке
        } finally {
          setLoading(false);
        }
      };

      fetchData();
      // --- Конец получения данных ---
    } else {
      setCourseTitle("Курс не выбран");
      setError("Не указан ID курса в адресе страницы.");
      setMetricsData({ steps: [], global: {} }); // Сбрасываем данные
      setLoading(false);
    }
  }, [location.search]); // Зависимость только от location.search

  // --- Подготовка данных для графика ---
  // Используем данные из состояния metricsData.steps
  const stepData = metricsData.steps;
  const dataForChart = stepData.map((item) => ({
    step: item.name, // Убедитесь, что поле 'name' присутствует в данных
    // Преобразуем строку с '%' обратно в число для графика, если нужно
    value:
      typeof item[selectedMetric.dataKey] === "string" &&
      item[selectedMetric.dataKey].includes("%")
        ? parseFloat(item[selectedMetric.dataKey]) / 100 // Делим на 100, если это %, иначе не трогаем
        : item[selectedMetric.dataKey],
  }));

  const valuesForChart = dataForChart
    .map((item) => item.value)
    .filter((v) => typeof v === "number");
  const minValue = valuesForChart.length > 0 ? Math.min(...valuesForChart) : 0;
  const maxValue = valuesForChart.length > 0 ? Math.max(...valuesForChart) : 0;
  // --- Конец подготовки данных для графика ---

  // --- Обработчики ---
  const handleStepSelection = (stepId) => {
    setSelectedStepIds((prev) => {
      if (prev.includes(stepId)) {
        return prev.filter((id) => id !== stepId);
      } else {
        return [...prev, stepId];
      }
    });
  };

  const handleCompareSteps = () => {
    if (selectedStepIds.length < 2) {
      alert("Пожалуйста, выберите хотя бы два шага для сравнения.");
      return;
    }
    const stepsQueryParam = selectedStepIds.join(",");

    // Получаем ЗАКОДИРОВАННЫЙ ID для URL (из localStorage, т.к. API курсов еще нет)
    let encodedCourseIdForURL = null;
    const storedCourses = localStorage.getItem("uploadedCourses");
    if (storedCourses && courseId) {
      // courseId здесь - декодированный
      try {
        const courses = JSON.parse(storedCourses);
        const currentCourse = courses.find(
          (c) => decodeURIComponent(c.id) === courseId
        );
        if (currentCourse) {
          encodedCourseIdForURL = currentCourse.id; // Берем закодированный
        }
      } catch (e) {
        console.error(e);
      }
    }
    // Если не нашли, кодируем текущий декодированный (запасной вариант)
    if (!encodedCourseIdForURL && courseId) {
      encodedCourseIdForURL = encodeURIComponent(courseId);
    }
    if (!encodedCourseIdForURL) {
      console.error("Не удалось получить ID курса для URL сравнения");
      setError("Произошла ошибка при формировании ссылки для сравнения.");
      return;
    }

    navigate(
      `/compare?courseId=${encodedCourseIdForURL}&steps=${stepsQueryParam}`
    );
    console.log(
      "Переход на сравнение шагов:",
      selectedStepIds,
      "для курса ID (encoded):",
      encodedCourseIdForURL
    );
  };
  // --- Конец обработчиков ---

  // --- Колонки для DataGrid ---
  // Убедитесь, что 'field' соответствует ключам в объектах массива metricsData.steps
  const columns = [
    {
      field: "selection",
      headerName: "Выбор",
      width: 80,
      sortable: false,
      renderCell: (params) => (
        <FormControlLabel
          sx={{ mr: 0 }}
          control={
            <Checkbox
              size="small"
              checked={selectedStepIds.includes(params.row.step_id)}
              onChange={() => handleStepSelection(params.row.step_id)}
              name={`checkbox-${params.row.step_id}`}
            />
          }
          label=""
        />
      ),
    },
    { field: "step_id", headerName: "ID шага", width: 100 },
    { field: "name", headerName: "Название шага", width: 150 },
    {
      field: "completions",
      headerName: "Завершения",
      type: "number",
      width: 120,
    },
    { field: "dropouts", headerName: "Отсевы", type: "number", width: 100 },
    {
      field: "avg_time",
      headerName: "Ср. время (сек)",
      type: "number",
      width: 130,
    },
    { field: "success_rate", headerName: "Успешность (%)", width: 120 }, // Убедитесь, что данные приходят в % или обрабатываются
    {
      field: "avg_attempts",
      headerName: "Ср. попытки",
      type: "number",
      width: 120,
    },
    {
      field: "comments",
      headerName: "Комментарии",
      type: "number",
      width: 120,
    },
    { field: "question_freq", headerName: 'Частота "?" (%)', width: 120 }, // Убедитесь, что данные приходят в % или обрабатываются
    {
      field: "self_correction_rate",
      headerName: "Самокоррекция (%)",
      width: 130,
    }, // Убедитесь, что данные приходят в % или обрабатываются
    {
      field: "actions",
      headerName: "Анализ",
      sortable: false,
      width: 120,
      renderCell: (params) => {
        // Получаем закодированный ID для URL (так же, как для сравнения)
        let encodedCourseIdForURL = null;
        const storedCourses = localStorage.getItem("uploadedCourses");
        if (storedCourses && courseId) {
          try {
            const courses = JSON.parse(storedCourses);
            const currentCourse = courses.find(
              (c) => decodeURIComponent(c.id) === courseId
            );
            if (currentCourse) encodedCourseIdForURL = currentCourse.id;
          } catch {}
        }
        if (!encodedCourseIdForURL && courseId)
          encodedCourseIdForURL = encodeURIComponent(courseId);

        return (
          <Button
            variant="outlined"
            size="small"
            component={RouterLink}
            disabled={!encodedCourseIdForURL}
            to={`/step/${params.row.step_id}?courseId=${encodedCourseIdForURL}`}
          >
            Детали
          </Button>
        );
      },
    },
  ];
  // --- Конец колонок ---

  // --- Отображение загрузки или ошибки ---
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
  // --- Конец отображения загрузки/ошибки ---

  // --- Получаем данные для рендеринга из состояния ---
  const globalMetrics = metricsData.global;
  // stepData уже определена выше

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Дашборд аналитики курса: {courseTitle}
      </Typography>

      {/* Отображение глобальных метрик */}
      {globalMetrics && (
        <Grid container spacing={3} sx={{ mb: 3 }}>
          {/* Карточка "Завершили курс" (данные из API) */}
          <Grid item xs={12} sm={4}>
            <Paper
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <Typography
                component="h2"
                variant="h6"
                color="primary"
                gutterBottom
              >
                Завершили курс
              </Typography>
              <Typography component="p" variant="h4">
                {globalMetrics.completionRate !== null
                  ? `${(globalMetrics.completionRate * 100).toFixed(1)}%`
                  : "N/A"}
              </Typography>
              {globalMetrics.usersCompleted !== null &&
                globalMetrics.totalLearners !== null && (
                  <Typography variant="caption" color="textSecondary">
                    ({globalMetrics.usersCompleted} из{" "}
                    {globalMetrics.totalLearners})
                  </Typography>
                )}
            </Paper>
          </Grid>
          {/* Карточка "Средний % завершения" (пока мок) */}
          <Grid item xs={12} sm={4}>
            <Paper
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <Typography
                component="h2"
                variant="h6"
                color="primary"
                gutterBottom
              >
                Средний % завершения
              </Typography>
              <Typography component="p" variant="h4">
                {globalMetrics.avg_completion_percent !== undefined
                  ? `${(globalMetrics.avg_completion_percent * 100).toFixed(
                      1
                    )}%`
                  : "N/A"}
              </Typography>
            </Paper>
          </Grid>
          {/* Карточка "Среднее время м/у шагами" (пока мок) */}
          <Grid item xs={12} sm={4}>
            <Paper
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <Typography
                component="h2"
                variant="h6"
                color="primary"
                gutterBottom
              >
                Среднее время м/у шагами
              </Typography>
              <Typography component="p" variant="h4">
                {globalMetrics.avg_time_between_steps !== undefined
                  ? `${globalMetrics.avg_time_between_steps} сек`
                  : "N/A"}
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      )}

      {/* График */}
      {stepData.length > 0 ? (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              mb: 2,
            }}
          >
            <Typography variant="h6">
              Статистика по шагам ({selectedMetric.label})
            </Typography>
            <MetricSelector
              metrics={availableMetrics}
              selectedMetric={selectedMetric}
              onChange={setSelectedMetric}
            />
          </Box>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={dataForChart}
              margin={{ top: 5, right: 30, left: 20, bottom: 70 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="step"
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
                tick={false}
              />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="value"
                name={selectedMetric.label}
                stroke="#8884d8"
                activeDot={{ r: 8 }}
              />
              {minValue !== Infinity &&
                minValue !== 0 && ( // Не показываем для 0
                  <ReferenceLine
                    y={minValue}
                    label={{
                      value: `Min: ${minValue}`,
                      position: "insideTopLeft",
                    }}
                    stroke="red"
                    strokeDasharray="3 3"
                  />
                )}
              {maxValue !== -Infinity &&
                maxValue !== 0 && ( // Не показываем для 0
                  <ReferenceLine
                    y={maxValue}
                    label={{
                      value: `Max: ${maxValue}`,
                      position: "insideTopRight",
                    }}
                    stroke="green"
                    strokeDasharray="3 3"
                  />
                )}
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      ) : (
        <Typography
          sx={{ textAlign: "center", color: "text.secondary", my: 3 }}
        >
          Нет данных по шагам для отображения.
        </Typography>
      )}

      {/* Таблица с метриками по шагам */}
      {stepData.length > 0 && (
        <>
          <Paper sx={{ height: 600, width: "100%", mb: 3 }}>
            <DataGrid
              // Убедитесь, что в ваших данных есть уникальный `step_id` для каждой строки
              getRowId={(row) => row.step_id}
              rows={stepData}
              columns={columns}
              initialState={{
                pagination: { paginationModel: { pageSize: 10 } },
              }}
              pageSizeOptions={[10, 25, 50]}
              checkboxSelection={false} // Используем кастомные чекбоксы
              disableRowSelectionOnClick // Отключаем выделение по клику на строку
            />
          </Paper>
          {/* Кнопка сравнения */}
          <Box sx={{ mt: 2, mb: 3, textAlign: "center" }}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              onClick={handleCompareSteps}
              disabled={selectedStepIds.length < 2}
            >
              Сравнить выбранные шаги ({selectedStepIds.length})
            </Button>
          </Box>
        </>
      )}

      {/* Рекомендации (пока статика) */}
      <Recommendations />
    </Container>
  );
}

export default Dashboard;
