import React, { useState, useEffect } from "react";
import { useLocation, Link as RouterLink } from "react-router-dom";
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
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

import MetricSelector from "./MetricSelector";
import Recommendations from "./Recommendations";

// --- Вставьте сюда ваши mock-данные ---
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
      id: index + 1, // Уникальный ID для DataGrid
      step_id: id,
      name: `Шаг ${id}`, // Пока используем ID в названии
      completions: metrics.completions_per_step[id] || 0,
      dropouts: metrics.dropouts_per_step[id] || 0,
      avg_time: metrics.avg_time_per_step[id] || 0,
      success_rate: (metrics.success_rate[id] * 100).toFixed(1) + "%" || "0%", // Форматируем для отображения
      avg_attempts: metrics.avg_attempts[id] || 0,
      comments: metrics.comments_per_step[id] || 0,
      question_freq: (metrics.question_freq[id] * 100).toFixed(1) + "%" || "0%", // Форматируем для отображения
      self_correction_rate:
        (metrics.self_correction_rate[id] * 100).toFixed(1) + "%" || "0%", // Форматируем для отображения
    };
  });
};
const mockStepData = generateMockStepData(mockMetrics);
// --- Конец mock-данных ---

// Определяем доступные метрики для выбора
const availableMetrics = [
  { value: "completions", label: "Завершения", dataKey: "completions" },
  { value: "dropouts", label: "Отсевы", dataKey: "dropouts" },
  { value: "avg_time", label: "Среднее время (сек)", dataKey: "avg_time" },
  {
    value: "avg_attempts",
    label: "Среднее число попыток",
    dataKey: "avg_attempts",
  },
  // Добавьте другие метрики при необходимости
];

function Dashboard() {
  const location = useLocation();
  const [courseId, setCourseId] = useState(null); // Состояние для ID курса
  const [courseTitle, setCourseTitle] = useState("Загрузка..."); // Состояние для заголовка

  const [metrics, setMetrics] = useState(mockMetrics); // Пока используем mock
  const [stepData, setStepData] = useState(mockStepData); // Пока используем mock
  const [selectedMetric, setSelectedMetric] = useState(availableMetrics[0]);
  const [selectedStepIds, setSelectedStepIds] = useState([]);

  // --- Эффект для получения ID курса из URL и названия из localStorage ---
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    // Получаем закодированное значение напрямую, если это возможно (зависит от реализации роутера/браузера)
    // Более надежный способ - извлечь значение вручную
    const searchParamsString = location.search; // Получаем строку "?courseId=..."
    let idFromUrlEncoded = null;
    if (searchParamsString.includes("courseId=")) {
      // Извлекаем значение параметра courseId как есть (закодированное)
      idFromUrlEncoded = searchParamsString.split("courseId=")[1].split("&")[0];
    }

    console.log("--- Dashboard useEffect ---");
    console.log("1. Закодированный ID из URL:", idFromUrlEncoded);

    if (idFromUrlEncoded) {
      // Сохраняем декодированный ID для отображения или других нужд, если нужно
      const idFromUrlDecoded = decodeURIComponent(idFromUrlEncoded);
      setCourseId(idFromUrlDecoded); // Сохраняем декодированный ID

      const storedCourses = localStorage.getItem("uploadedCourses");
      console.log("2. Данные из localStorage:", storedCourses);

      let courses = [];
      try {
        courses = storedCourses ? JSON.parse(storedCourses) : [];
        console.log("3. Распарсенные курсы:", courses);
      } catch (e) {
        console.error("Ошибка парсинга JSON из localStorage:", e);
        setCourseTitle("Ошибка чтения данных");
        setMetrics(null);
        setStepData([]);
        return;
      }

      // Ищем курс, сравнивая ЗАКОДИРОВАННЫЕ ID
      const currentCourse = courses.find((course) => {
        console.log(
          `Сравнение: localStorage ID (${typeof course.id}) "${
            course.id
          }" === URL Encoded ID (${typeof idFromUrlEncoded}) "${idFromUrlEncoded}"`
        );
        return course.id === idFromUrlEncoded; // Сравниваем закодированные строки
      });
      console.log("4. Найденный курс:", currentCourse);

      if (currentCourse) {
        setCourseTitle(currentCourse.name); // Название берем из найденного курса
        console.log(`Найден курс: ${currentCourse.name}. Загрузка данных...`);
        setMetrics(mockMetrics);
        setStepData(generateMockStepData(mockMetrics));
      } else {
        setCourseTitle("Курс не найден");
        console.error(
          `Курс с ID "${idFromUrlEncoded}" не найден в localStorage.`
        );
        setMetrics(null);
        setStepData([]);
      }
    } else {
      setCourseTitle("Курс не выбран");
      console.warn("ID курса не найден в URL.");
      setMetrics(null);
      setStepData([]);
    }
  }, [location.search]);

  // Подготовка данных для графика
  const dataForChart = stepData.map((item) => ({
    step: item.name,
    value: item[selectedMetric.dataKey],
  }));

  const valuesForChart = dataForChart
    .map((item) => item.value)
    .filter((v) => typeof v === "number");
  const minValue = valuesForChart.length > 0 ? Math.min(...valuesForChart) : 0;
  const maxValue = valuesForChart.length > 0 ? Math.max(...valuesForChart) : 0;

  const handleStepSelection = (stepId) => {
    setSelectedStepIds((prev) => {
      if (prev.includes(stepId)) {
        return prev.filter((id) => id !== stepId);
      } else {
        return [...prev, stepId];
      }
    });
  };

  // Колонки для DataGrid
  const columns = [
    {
      field: "selection",
      headerName: "Выбор",
      width: 80,
      renderCell: (params) => (
        <FormControlLabel
          control={
            <Checkbox
              checked={selectedStepIds.includes(params.row.step_id)}
              onChange={() => handleStepSelection(params.row.step_id)}
            />
          }
          label=""
        />
      ),
    },
    { field: "step_id", headerName: "ID шага", width: 100 },
    { field: "name", headerName: "Название шага", width: 150 },
    // ... другие колонки ...
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
    { field: "success_rate", headerName: "Успешность", width: 120 },
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
    { field: "question_freq", headerName: 'Частота "?"', width: 120 },
    { field: "self_correction_rate", headerName: "Самокоррекция", width: 130 },
    {
      field: "actions",
      headerName: "Анализ",
      sortable: false,
      width: 120,
      renderCell: (params) => (
        <Button
          variant="outlined"
          size="small"
          component={RouterLink}
          to={`/step/${params.row.step_id}`}
        >
          Детали
        </Button>
      ),
    },
  ];

  const handleCompareSteps = () => {
    if (selectedStepIds.length < 2) {
      alert("Пожалуйста, выберите хотя бы два шага для сравнения.");
      return;
    }
    // TODO: Реализовать переход на страницу сравнения
    console.log("Сравнение шагов:", selectedStepIds);
    // navigate(`/compare?courseId=${courseId}&steps=${selectedStepIds.join(',')}`);
  };

  // --- Отображение лоадера или ошибки, если данных нет ---
  if (!metrics || !stepData) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Дашборд аналитики курса: {courseTitle}
        </Typography>
        <Typography>Загрузка данных...</Typography>
        {/* Или отображение сообщения об ошибке, если курс не найден */}
      </Container>
    );
  }
  // --- Конец лоадера/ошибки ---

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        {/* Используем состояние courseTitle для заголовка */}
        Дашборд аналитики курса: {courseTitle}
      </Typography>

      {/* Отображение глобальных метрик */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* ... код глобальных метрик ... */}
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
              {(metrics.full_course_completion * 100).toFixed(1)}%
            </Typography>
          </Paper>
        </Grid>
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
              {(metrics.avg_completion_percent * 100).toFixed(1)}%
            </Typography>
          </Paper>
        </Grid>
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
              {metrics.avg_time_between_steps} сек
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* График */}
      <Paper sx={{ p: 2, mb: 3 }}>
        {/* ... код графика ... */}
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
        {/* Обертка для адаптивности графика */}
        <ResponsiveContainer width="100%" height={400}>
          <LineChart
            data={dataForChart}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" />
            {/* Ось X с названиями шагов */}
            <XAxis
              dataKey="step"
              angle={-30}
              textAnchor="end"
              height={70}
              interval={0}
            />
            <YAxis />
            {/* Всплывающая подсказка при наведении */}
            <Tooltip />
            <Legend />
            {/* Линия графика */}
            <Line
              type="monotone"
              dataKey="value"
              name={selectedMetric.label}
              stroke="#8884d8"
              activeDot={{ r: 8 }}
            />
            {/* Линии для минимального и максимального значений */}
            {minValue !== Infinity && (
              <ReferenceLine
                y={minValue}
                label={`Min: ${minValue}`}
                stroke="red"
                strokeDasharray="3 3"
              />
            )}
            {maxValue !== -Infinity && (
              <ReferenceLine
                y={maxValue}
                label={`Max: ${maxValue}`}
                stroke="green"
                strokeDasharray="3 3"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      {/* Таблица с метриками по шагам */}
      <Paper sx={{ height: 600, width: "100%", mb: 3 }}>
        <DataGrid
          rows={stepData}
          columns={columns}
          pageSize={10}
          rowsPerPageOptions={[10, 25, 50]}
          checkboxSelection={false}
          disableSelectionOnClick
          getRowId={(row) => row.step_id} // Используем step_id как ID строки
        />
      </Paper>
      <Box sx={{ mt: 2, textAlign: "center" }}>
        <Button
          variant="contained"
          color="primary"
          size="large"
          onClick={handleCompareSteps}
          disabled={selectedStepIds.length < 2}
        >
          Сравнить выбранные шаги
        </Button>
      </Box>

      {/* Рекомендации */}
      <Recommendations />
    </Container>
  );
}

export default Dashboard;
