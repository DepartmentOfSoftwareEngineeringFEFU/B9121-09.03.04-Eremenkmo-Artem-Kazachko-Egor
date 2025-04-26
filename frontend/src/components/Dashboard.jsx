// src/components/Dashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  Grid, // Импортируем Grid
  Paper,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Alert,
  Select,
  MenuItem,
  InputLabel,
  OutlinedInput,
  Chip,
  ListItemText,
  FormControl,
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

// Импорт API функций
import { getStepsStructure, getCourseCompletionRates } from "../api/apiService";

// Импорт компонентов
import MetricSelector from "./MetricSelector";
import Recommendations from "./Recommendations"; // Компонент-заглушка для рекомендаций

// --- Функции-хелперы для форматирования (можно вынести в отдельный файл utils) ---
const formatPercentage = (value) => {
  if (typeof value !== "number" || !isFinite(value)) return "N/A";
  // Умножаем на 100 только если значение действительно доля (0-1),
  // иначе просто форматируем как есть (если бэкенд вдруг вернет уже в %)
  const displayValue = value >= 0 && value <= 1 ? value * 100 : value;
  return `${displayValue.toFixed(1)}%`;
};
const formatNumber = (value, decimals = 1) => {
  if (value === null || typeof value === "undefined") return "N/A";
  const numValue = parseFloat(value);
  if (isNaN(numValue) || !isFinite(numValue)) return "N/A";
  return numValue.toFixed(decimals);
};

// Форматтер для целых чисел, отображающий 0
const formatIntegerWithZero = (value) => {
  const intValue = parseInt(value, 10);
  return isNaN(intValue) || !isFinite(intValue) ? "N/A" : intValue;
};
// ---------------------------------------------------------------------------------

// --- Описание метрик для селектора и графика ---
// Обновляем список в соответствии с данными, приходящими от ИЗМЕНЕННОГО /steps/structure
const availableMetrics = [
  {
    value: "step_effectiveness",
    label: "Эффективность (%)",
    dataKey: "step_effectiveness",
  },
  { value: "success_rate", label: "Успешность (%)", dataKey: "success_rate" },
  { value: "users_passed", label: "Прошли (чел.)", dataKey: "users_passed" },
  {
    value: "all_users_attempted",
    label: "Пытались (чел.)",
    dataKey: "all_users_attempted",
  },
  {
    value: "avg_attempts_per_passed_user",
    label: "Ср. попытки",
    dataKey: "avg_attempts_per_passed_user",
  },
  { value: "comments_count", label: "Комментарии", dataKey: "comments_count" },
  { value: "difficulty", label: "Difficulty", dataKey: "difficulty" },
  {
    value: "discrimination",
    label: "Discrimination",
    dataKey: "discrimination",
  },
  // Закомментированы метрики, которые НЕ рассчитываются в текущей версии /steps/structure
  // { value: "avg_time", label: "Среднее время (сек)", dataKey: "avg_completion_time_seconds" },
];
// --- Конец описания метрик ---

function Dashboard() {
  console.log("--- Dashboard Component Render ---");

  const navigate = useNavigate();
  const location = useLocation();
  const [courseIdFromUrl, setCourseIdFromUrl] = useState(null); // Декодированный ID из URL (для заголовка и ссылок)
  const [courseTitle, setCourseTitle] = useState("Загрузка...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- Состояния данных ---
  const [allStepsDataFromApi, setAllStepsDataFromApi] = useState([]); // Все шаги из API (включая метрики)
  const [filteredStepsData, setFilteredStepsData] = useState([]); // Шаги после фильтрации по UI
  const [modules, setModules] = useState([]); // Уникальные модули курса 63054
  const [globalMetricsState, setGlobalMetricsState] = useState(null); // Глобальные метрики из API

  // --- Состояния UI фильтров ---
  const [selectedModuleIds, setSelectedModuleIds] = useState([]); // ID выбранных модулей для фильтрации
  const [showOnlyWithDifficulty, setShowOnlyWithDifficulty] = useState(false); // Фильтр по наличию Difficulty/Discrimination

  // --- Состояния для графика и таблицы ---
  const [selectedMetric, setSelectedMetric] = useState(availableMetrics[0]); // Метрика для графика (начинаем с первой)
  const [selectedStepIds, setSelectedStepIds] = useState([]); // ID шагов, выбранных для сравнения

  // --- Функция фильтрации данных (запускается после загрузки и при смене UI фильтров) ---
  const filterAndSetSteps = useCallback(
    (allData, courseIdToFilter, selectedModulesFilter, uiFilters) => {
      console.log("--- filterAndSetSteps START ---");
      console.log(`   Исходные данные: ${allData?.length} шагов`);
      console.log(`   Фильтр по курсу ID: ${courseIdToFilter}`);
      console.log(
        `   Выбранные модули: [${selectedModulesFilter?.join(", ")}]`
      );
      console.log(`   Фильтры UI:`, uiFilters);

      if (courseIdToFilter === null || !allData || allData.length === 0) {
        console.log(
          "   Фильтрация прервана: нет ID курса для фильтрации или исходных данных."
        );
        setFilteredStepsData([]);
        setModules([]);
        console.log("--- filterAndSetSteps END (прервано) ---");
        return;
      }

      // --- 1. Фильтр по ID курса ---
      let courseSteps = allData.filter(
        (step) => step.course_id === courseIdToFilter
      );
      console.log(
        `   Шагов для курса ${courseIdToFilter} ПОСЛЕ ФИЛЬТРА по ID: ${courseSteps.length}`
      );

      // --- 2. Формирование списка модулей ЭТОГО курса (на основе отфильтрованных шагов) ---
      const uniqueModules = [];
      const seenModuleIds = new Set();
      courseSteps.forEach((step) => {
        if (step.module_id && !seenModuleIds.has(step.module_id)) {
          // Используем module_title, если оно пришло от API, иначе формируем название
          const moduleTitle = step.module_title || `Модуль ${step.module_id}`;
          uniqueModules.push({
            id: step.module_id,
            title: moduleTitle,
            position: step.module_position,
          });
          seenModuleIds.add(step.module_id);
        }
      });
      uniqueModules.sort(
        (a, b) => (a.position ?? Infinity) - (b.position ?? Infinity)
      ); // Сортировка с учетом null/undefined
      setModules(uniqueModules);
      console.log("   Сформирован список модулей:", uniqueModules);

      // --- 3. Применение UI фильтров к шагам этого курса ---
      let currentlyFilteredData = [...courseSteps]; // Начинаем с шагов этого курса

      // 3.1 Фильтр по наличию Difficulty/Discrimination
      if (uiFilters.showOnlyWithDifficulty) {
        const countBefore = currentlyFilteredData.length;
        currentlyFilteredData = currentlyFilteredData.filter(
          (step) =>
            step.difficulty !== null &&
            typeof step.difficulty === "number" &&
            step.discrimination !== null &&
            typeof step.discrimination === "number"
        );
        console.log(
          `   После фильтра по difficulty/disc: ${currentlyFilteredData.length} (было ${countBefore})`
        );
      } else {
        console.log("   Фильтр по difficulty/disc ВЫКЛЮЧЕН.");
      }

      // 3.2 Фильтр по выбранным модулям
      if (selectedModulesFilter && selectedModulesFilter.length > 0) {
        const countBefore = currentlyFilteredData.length;
        const selectedSet = new Set(selectedModulesFilter);
        currentlyFilteredData = currentlyFilteredData.filter(
          (step) => step.module_id && selectedSet.has(step.module_id)
        );
        console.log(
          `   После фильтра по модулям [${selectedModulesFilter.join(", ")}]: ${
            currentlyFilteredData.length
          } (было ${countBefore})`
        );
      } else {
        console.log(
          "   Фильтр по модулям НЕ ПРИМЕНЕН (ни один модуль не выбран)."
        );
      }

      // 3.3 Опциональный фильтр по названию шага (можно убрать, если не нужен)
      const countBeforeTitleFilter = currentlyFilteredData.length;
      currentlyFilteredData = currentlyFilteredData.filter(
        (step) => step.step_title_full && step.step_title_full.trim() !== ""
      );
      if (countBeforeTitleFilter !== currentlyFilteredData.length) {
        console.log(
          `   После фильтра по наличию названия шага: ${currentlyFilteredData.length} (было ${countBeforeTitleFilter})`
        );
      }

      // 3.4 Финальная сортировка отфильтрованных данных
      currentlyFilteredData.sort((a, b) => {
        const modulePosA = a.module_position ?? Infinity;
        const modulePosB = b.module_position ?? Infinity;
        if (modulePosA !== modulePosB) return modulePosA - modulePosB;

        const lessonPosA = a.lesson_position ?? Infinity;
        const lessonPosB = b.lesson_position ?? Infinity;
        if (lessonPosA !== lessonPosB) return lessonPosA - lessonPosB;

        const stepPosA = a.step_position ?? Infinity;
        const stepPosB = b.step_position ?? Infinity;
        return stepPosA - stepPosB;
      });
      console.log("   Финальная сортировка применена.");

      // Устанавливаем итоговый отфильтрованный массив
      setFilteredStepsData(currentlyFilteredData);
      console.log("--- filterAndSetSteps END ---");
    },
    [] // useCallback без зависимостей, т.к. все нужные данные приходят как аргументы
  );

  // --- Эффект для ЗАГРУЗКИ данных с API при монтировании или смене URL ---
  useEffect(() => {
    console.log("--- Dashboard useEffect [location.search] - ЗАГРУЗКА API ---");
    const params = new URLSearchParams(location.search);
    const idFromUrlEncoded = params.get("courseId"); // Закодированный ID из URL
    console.log("   URL Encoded ID:", idFromUrlEncoded);

    // Если нет ID курса в URL, показываем ошибку и выходим
    if (!idFromUrlEncoded) {
      console.log("   ID курса не найден в URL.");
      setCourseTitle("Курс не выбран");
      setError("Не указан ID курса в адресе страницы.");
      setLoading(false);
      setAllStepsDataFromApi([]); // Очищаем данные
      setModules([]);
      setGlobalMetricsState(null);
      return; // Прерываем выполнение эффекта
    }

    // Если ID есть, декодируем его и сбрасываем состояния
    let decodedId;
    try {
      decodedId = decodeURIComponent(idFromUrlEncoded);
      console.log("   URL Decoded ID:", decodedId);
    } catch (e) {
      console.error("   Ошибка декодирования courseId из URL:", e);
      setError("Некорректный ID курса в URL.");
      setLoading(false);
      return;
    }

    // Устанавливаем ID и сбрасываем состояния перед загрузкой
    setCourseIdFromUrl(decodedId); // Сохраняем декодированный ID для заголовка/ссылок
    setLoading(true);
    setError(null);
    setSelectedModuleIds([]); // Сброс фильтров
    setShowOnlyWithDifficulty(false); // Сброс фильтров
    setAllStepsDataFromApi([]);
    setFilteredStepsData([]);
    setModules([]);
    setGlobalMetricsState(null);

    // Получение имени курса из localStorage (логика заглушки)
    const storedCourses = localStorage.getItem("uploadedCourses");
    let courseName = "Курс не найден";
    if (storedCourses) {
      try {
        const courses = JSON.parse(storedCourses);
        const currentCourse = courses.find(
          (c) => decodeURIComponent(c.id) === decodedId
        );
        if (currentCourse) courseName = currentCourse.name;
      } catch (e) {
        console.error("   Ошибка чтения localStorage для имени курса:", e);
      }
    }
    setCourseTitle(courseName);

    // Асинхронная функция для загрузки данных с API
    const fetchData = async () => {
      console.log("   fetchData: Начало загрузки API...");
      try {
        // Запрашиваем данные параллельно
        const [completionData, stepsStructureData] = await Promise.all([
          getCourseCompletionRates(),
          getStepsStructure(), // Этот эндпоинт теперь возвращает шаги С МЕТРИКАМИ
        ]);

        console.log("   fetchData: Получены ответы API.");
        console.log("      Completion Rates:", completionData);
        console.log("      Steps Structure with Metrics:", stepsStructureData);

        // Обработка глобальных метрик
        if (completionData && !completionData.error) {
          setGlobalMetricsState(completionData);
          console.log("      Глобальные метрики установлены.");
        } else {
          console.warn(
            "      Не удалось загрузить Completion Rate:",
            completionData?.details ||
              completionData?.error ||
              "Неизвестная ошибка"
          );
          setGlobalMetricsState(null); // Устанавливаем null, если есть ошибка
        }

        // Обработка структуры шагов с метриками
        if (
          stepsStructureData &&
          !stepsStructureData.error &&
          Array.isArray(stepsStructureData)
        ) {
          setAllStepsDataFromApi(stepsStructureData);
          console.log(
            `      Структура шагов с метриками (${stepsStructureData.length} шт.) сохранена.`
          );
        } else {
          console.error(
            "      Ошибка получения структуры шагов с метриками:",
            stepsStructureData?.error
          );
          setAllStepsDataFromApi([]); // Устанавливаем пустой массив при ошибке
          setError(
            stepsStructureData?.error || "Не удалось загрузить данные по шагам."
          );
        }
      } catch (err) {
        console.error("   fetchData: КРИТИЧЕСКАЯ ОШИБКА загрузки данных:", err);
        setError(err.message || "Не удалось загрузить данные.");
        setAllStepsDataFromApi([]); // Очищаем данные при критической ошибке
        setGlobalMetricsState(null);
      } finally {
        console.log("   fetchData: Загрузка завершена (finally).");
        setLoading(false); // Завершаем загрузку в любом случае
      }
    };

    fetchData(); // Вызываем загрузку данных
  }, [location.search]); // Перезапускаем эффект ТОЛЬКО при смене URL

  // --- Эффект для ПРИМЕНЕНИЯ ФИЛЬТРОВ при изменении исходных данных или UI фильтров ---
  useEffect(() => {
    console.log("--- Dashboard useEffect [ФИЛЬТРАЦИЯ] ---");
    // --- Жестко заданный ID курса для фильтрации ---
    const REQUIRED_COURSE_ID = 63054;
    // ---------------------------------------------

    // Вызываем фильтрацию только если есть исходные данные
    if (allStepsDataFromApi.length > 0) {
      console.log(
        `   Запуск filterAndSetSteps с ID курса: ${REQUIRED_COURSE_ID}...`
      );
      filterAndSetSteps(
        allStepsDataFromApi,
        REQUIRED_COURSE_ID,
        selectedModuleIds,
        { showOnlyWithDifficulty }
      );
    } else {
      console.log("   Пропуск filterAndSetSteps (нет исходных данных).");
      // Если исходных данных нет, убедимся, что отфильтрованные данные тоже пусты
      setFilteredStepsData([]);
      setModules([]);
    }
    // Зависимости: исходные данные и состояния UI фильтров
  }, [
    allStepsDataFromApi,
    selectedModuleIds,
    showOnlyWithDifficulty,
    filterAndSetSteps,
  ]); // filterAndSetSteps добавлен как зависимость, т.к. он useCallback

  // --- Подготовка данных для ГРАФИКА ---
  const chartData = filteredStepsData.map((item) => {
    let value = null;
    // Используем безопасный доступ к dataKey из selectedMetric
    const dataKey = selectedMetric?.dataKey;
    const metricValue = dataKey ? item[dataKey] : null;

    // Обработка числовых значений
    if (typeof metricValue === "number" && isFinite(metricValue)) {
      value = metricValue;
      // Корректировка для процентов (если приходят как доля 0-1)
      if (
        (dataKey === "success_rate" || dataKey === "step_effectiveness") &&
        value >= 0 &&
        value <= 1
      ) {
        value = value * 100;
      }
    }
    // Альтернативная метка для оси X (короткое название или ID)
    const stepLabel = item.step_title_short || `Шаг ${item.step_id}`;
    return {
      step_label: stepLabel, // Ключ для оси X
      value: value, // Значение для оси Y
    };
  });

  // Находим мин/макс для линий на графике
  const validValuesForChart = chartData
    .map((item) => item.value)
    .filter((v) => typeof v === "number" && isFinite(v));
  const minValue =
    validValuesForChart.length > 0 ? Math.min(...validValuesForChart) : 0;
  const maxValue =
    validValuesForChart.length > 0 ? Math.max(...validValuesForChart) : 0;
  console.log(
    `Данные для графика (${selectedMetric?.label}): ${chartData.length} точек`
  );
  // --- Конец подготовки данных для графика ---

  // --- Обработчики событий UI ---
  const handleStepSelection = (stepId) => {
    console.log("handleStepSelection:", stepId);
    setSelectedStepIds((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(stepId)) {
        newSelection.delete(stepId);
      } else {
        newSelection.add(stepId);
      }
      return Array.from(newSelection);
    });
  };

  const handleCompareSteps = () => {
    console.log("handleCompareSteps:", selectedStepIds);
    if (selectedStepIds.length < 2) {
      alert("Пожалуйста, выберите хотя бы два шага для сравнения.");
      return;
    }
    const stepsQueryParam = selectedStepIds.join(",");
    // Логика получения закодированного ID курса (как и раньше)
    let encodedCourseIdForURL = null;
    const storedCourses = localStorage.getItem("uploadedCourses");
    if (storedCourses && courseIdFromUrl) {
      try {
        const courses = JSON.parse(storedCourses);
        const currentCourse = courses.find(
          (c) => decodeURIComponent(c.id) === courseIdFromUrl
        );
        if (currentCourse) encodedCourseIdForURL = currentCourse.id;
      } catch (e) {
        console.error("Ошибка получения encodedId для сравнения:", e);
      }
    }
    if (!encodedCourseIdForURL && courseIdFromUrl)
      encodedCourseIdForURL = encodeURIComponent(courseIdFromUrl);

    if (!encodedCourseIdForURL) {
      console.error("Не удалось получить ID курса для URL сравнения");
      setError("Произошла ошибка при формировании ссылки для сравнения.");
      return;
    }
    navigate(
      `/compare?courseId=${encodedCourseIdForURL}&steps=${stepsQueryParam}`
    );
  };
  // --- Конец обработчиков ---

  // --- Определение колонок для DataGrid ---
  const columns = [
    {
      field: "selection",
      headerName: "Выбор",
      width: 80,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <FormControlLabel
          sx={{ mr: 0 }}
          control={
            <Checkbox
              size="small"
              checked={selectedStepIds.includes(params.row.step_id)}
              onChange={() => handleStepSelection(params.row.step_id)}
              name={`checkbox-${params.row.step_id}`}
              aria-label={`Выбрать шаг ${params.row.step_id}`}
            />
          }
          label=""
        />
      ),
    },
    { field: "step_id", headerName: "ID", width: 90 },
    {
      field: "step_title_full",
      headerName: "Название шага",
      width: 350,
      valueGetter: (value) => value || "-",
    },
    {
      field: "step_title_short",
      headerName: "Метка",
      width: 130,
      valueGetter: (value) => value || "-",
    },
    {
      field: "module_title",
      headerName: "Модуль",
      width: 200,
      // Находим название модуля в состоянии 'modules'
      valueGetter: (value, row) =>
        modules.find((m) => m.id === row.module_id)?.title ||
        `ID: ${row.module_id}` ||
        "-",
    },
    // --- Колонки с метриками ---
    {
      field: "step_effectiveness",
      headerName: "Эффект.(%)",
      type: "number",
      width: 100,
      valueFormatter: (value) => formatPercentage(value),
    },
    {
      field: "success_rate",
      headerName: "Успешн.(%)",
      type: "number",
      width: 100,
      valueFormatter: (value) => formatPercentage(value),
    },
    {
      field: "users_passed",
      headerName: "Прошли",
      type: "number",
      width: 80,
      valueFormatter: (value) => formatIntegerWithZero(value),
    },
    {
      field: "all_users_attempted",
      headerName: "Пытались",
      type: "number",
      width: 90,
      valueFormatter: (value) => formatIntegerWithZero(value),
    },
    {
      field: "avg_attempts_per_passed_user",
      headerName: "Ср. поп.",
      type: "number",
      width: 90,
      valueFormatter: (value) => formatNumber(value, 1),
    },
    {
      field: "comments_count",
      headerName: "Комм.",
      type: "number",
      width: 80,
      valueFormatter: (value) => formatIntegerWithZero(value),
    },
    {
      field: "difficulty",
      headerName: "Diff.",
      type: "number",
      width: 80,
      valueFormatter: (value) =>
        typeof value === "number" ? value.toFixed(3) : "",
    },
    {
      field: "discrimination",
      headerName: "Disc.",
      type: "number",
      width: 80,
      valueFormatter: (value) =>
        typeof value === "number" ? value.toFixed(3) : "",
    },
    // --- Колонка действий ---
    {
      field: "actions",
      headerName: "Анализ",
      sortable: false,
      filterable: false,
      width: 100,
      renderCell: (params) => {
        // Логика получения ID для ссылки (как и раньше)
        let encodedCourseIdForURL = null;
        const storedCourses = localStorage.getItem("uploadedCourses");
        if (storedCourses && courseIdFromUrl) {
          try {
            const courses = JSON.parse(storedCourses);
            const currentCourse = courses.find(
              (c) => decodeURIComponent(c.id) === courseIdFromUrl
            );
            if (currentCourse) encodedCourseIdForURL = currentCourse.id;
          } catch {}
        }
        if (!encodedCourseIdForURL && courseIdFromUrl)
          encodedCourseIdForURL = encodeURIComponent(courseIdFromUrl);
        return (
          <Button
            variant="outlined"
            size="small"
            component={RouterLink}
            disabled={!encodedCourseIdForURL}
            to={
              encodedCourseIdForURL
                ? `/step/${params.row.step_id}?courseId=${encodedCourseIdForURL}`
                : "#"
            }
          >
            {" "}
            Детали{" "}
          </Button>
        );
      },
    },
  ];
  // --- Конец определения колонок ---

  // ========================================================================
  // --- JSX Рендеринг Компонента ---
  // ========================================================================
  console.log(
    `Рендеринг. Loading: ${loading}, Error: ${error}, Filtered Steps: ${filteredStepsData.length}`
  );

  // 1. Состояние загрузки
  if (loading) {
    return (
      <Container sx={{ display: "flex", justifyContent: "center", mt: 5 }}>
        <CircularProgress />
      </Container>
    );
  }

  // 2. Состояние ошибки (если нет данных для отображения)
  if (error && filteredStepsData.length === 0) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Ошибка загрузки данных: {error}</Alert>
        <Button onClick={() => window.location.reload()} sx={{ mt: 2 }}>
          Попробовать снова
        </Button>
      </Container>
    );
  }

  // 3. Основное отображение дашборда
  const globalMetrics = globalMetricsState; // Для краткости

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      {/* Заголовок */}
      <Typography variant="h4" gutterBottom>
        Дашборд аналитики курса: {courseTitle}
      </Typography>

      {/* Отображение частичной ошибки (если есть) */}
      {error && filteredStepsData.length > 0 && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          {error} (Некоторые данные могут быть неактуальны)
        </Alert>
      )}

      {/* Глобальные метрики */}
      {globalMetrics && globalMetrics.ranges ? (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {Object.entries(globalMetrics.ranges).map(([key, rangeData]) => {
            let title = key; // ... (логика названий как раньше)
            if (key === "gte_80") title = "Завершили (≥80%)";
            else if (key === "gte_50_lt_80") title = "Прогресс (50-79%)";
            else if (key === "gte_25_lt_50") title = "Начали (25-49%)";
            else if (key === "lt_25") title = "Низкий прогресс (<25%)";
            return (
              // Используем Grid V2
              <Grid xs={12} sm={6} md={3} key={key}>
                <Paper
                  sx={{
                    p: 2,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    height: "100%",
                  }}
                >
                  <Typography
                    component="h2"
                    variant="h6"
                    color="primary"
                    gutterBottom
                    sx={{ textAlign: "center" }}
                  >
                    {title}
                  </Typography>
                  <Typography component="p" variant="h4">
                    {typeof rangeData.percentage === "number"
                      ? `${(rangeData.percentage * 100).toFixed(1)}%`
                      : "N/A"}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    ({rangeData.count ?? "?"} из{" "}
                    {globalMetrics.total_learners ?? "?"})
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ) : globalMetrics && globalMetrics.error ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Не удалось загрузить глоб. метрики:{" "}
          {globalMetrics.details || globalMetrics.error}
        </Alert>
      ) : (
        !loading && (
          <Typography sx={{ mb: 3, fontStyle: "italic" }}>
            Глобальные метрики не загружены.
          </Typography>
        )
      )}

      {/* Фильтры UI */}
      <Paper
        sx={{
          p: 2,
          mb: 3,
          display: "flex",
          gap: 2,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Метка "Фильтры:" */}
        <Typography variant="body1" sx={{ mr: 1, fontWeight: "bold" }}>
          Фильтры:
        </Typography>

        {/* Селектор Модулей */}
        <FormControl
          sx={{ m: 1, minWidth: 250, maxWidth: 400 }} // Стили для размера и отступов
          size="small" // Компактный размер
          disabled={modules.length === 0} // Блокируем, если список модулей пуст
        >
          <InputLabel id="module-select-label">Модули</InputLabel>
          <Select
            labelId="module-select-label"
            id="module-select"
            multiple // Включаем множественный выбор
            value={selectedModuleIds} // Текущие выбранные ID из состояния
            // Основной обработчик изменения выбора
            onChange={(event) => {
              const value = event.target.value; // value всегда массив для multiple
              const SELECT_ALL_VALUE = "___SELECT_ALL___"; // Специальный маркер

              // Если в массиве есть маркер "Выбрать все"
              if (value.includes(SELECT_ALL_VALUE)) {
                const allValidModuleIds = modules
                  .map((m) => m.id)
                  .filter((id) => id != null);
                const currentValidSelectedIds = selectedModuleIds.filter(
                  (id) => id != null
                );
                const isAllCurrentlySelected =
                  modules.length > 0 &&
                  currentValidSelectedIds.length === allValidModuleIds.length;

                // Если все уже выбраны -> снять выделение
                if (isAllCurrentlySelected) {
                  setSelectedModuleIds([]);
                } else {
                  // Иначе -> выбрать все валидные
                  setSelectedModuleIds(allValidModuleIds);
                }
              } else {
                // Если маркера нет - это обычный выбор/снятие модулей
                // Фильтруем null/undefined перед сохранением
                const validSelection = value.filter((id) => id != null);
                setSelectedModuleIds(validSelection);
              }
            }}
            input={<OutlinedInput label="Модули" />} // Input для отображения label
            // Функция для рендеринга отображения в поле Select
            renderValue={(selected) => {
              // Фильтруем null/undefined перед отображением
              const validSelected = selected.filter((id) => id != null);
              const allValidModuleIds = modules
                .map((m) => m.id)
                .filter((id) => id != null);
              // Проверяем, выбраны ли все валидные
              const isAllSelected =
                modules.length > 0 &&
                validSelected.length === allValidModuleIds.length;

              if (isAllSelected) {
                // Если выбраны все
                return <em>Все модули ({modules.length})</em>;
              } else if (validSelected.length === 0) {
                // Если ничего не выбрано
                return <em>Все модули ({modules.length})</em>; // Показываем общее кол-во
              } else {
                // Если выбраны некоторые - показываем чипы
                return (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                    {validSelected.map((id) => {
                      const module = modules.find((m) => m.id === id);
                      return (
                        <Chip
                          key={id}
                          label={module?.title || `ID: ${id}`}
                          size="small"
                        />
                      );
                    })}
                  </Box>
                );
              }
            }}
            // Настройки выпадающего меню
            MenuProps={{
              PaperProps: { style: { maxHeight: 224, width: 300 } },
            }}
          >
            {/* Опция "Выбрать все / Снять выделение" */}
            <MenuItem
              value="___SELECT_ALL___" // Специальное значение для идентификации
              disabled={modules.length === 0} // Блокируем, если нет модулей
              // Убираем onClick, вся логика в onChange Select'а
            >
              <Checkbox
                // Логика состояния чекбокса (проверяем по валидным ID)
                checked={
                  modules.length > 0 &&
                  selectedModuleIds.filter((id) => id != null).length ===
                    modules.map((m) => m.id).filter((id) => id != null).length
                }
                indeterminate={
                  selectedModuleIds.filter((id) => id != null).length > 0 &&
                  selectedModuleIds.filter((id) => id != null).length <
                    modules.map((m) => m.id).filter((id) => id != null).length
                }
                size="small"
              />
              <ListItemText
                primary={
                  <em>
                    {/* Динамический текст */}
                    {modules.length > 0 &&
                    selectedModuleIds.filter((id) => id != null).length ===
                      modules.map((m) => m.id).filter((id) => id != null).length
                      ? "Снять выделение"
                      : "Выбрать все"}
                  </em>
                }
              />
            </MenuItem>

            {/* Рендеринг списка модулей */}
            {modules.map(
              (module) =>
                // Проверяем, что ID модуля валидный перед рендерингом
                module.id != null ? (
                  <MenuItem key={module.id} value={module.id}>
                    <Checkbox
                      checked={selectedModuleIds.includes(module.id)}
                      size="small"
                    />
                    <ListItemText
                      primary={module.title || `Модуль ${module.id}`}
                    />
                  </MenuItem>
                ) : null // Не рендерим MenuItem для невалидных модулей
            )}
          </Select>
        </FormControl>

        {/* Чекбокс "Только с Difficulty/Discrimination" */}
        <FormControlLabel
          control={
            <Checkbox
              checked={showOnlyWithDifficulty}
              onChange={(event) =>
                setShowOnlyWithDifficulty(event.target.checked)
              }
              size="small"
            />
          }
          label="Только с Difficulty/Discrimination"
          // Добавляем отступ слева для экранов sm и больше
          sx={{ ml: { xs: 0, sm: 2 } }}
        />
      </Paper>

      {/* График */}
      {filteredStepsData.length > 0 ? (
        <Paper sx={{ p: 2, mb: 3 }}>
          {/* Заголовок графика и селектор метрики */}
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              mb: 2,
            }}
          >
            <Typography variant="h6">
              Статистика по шагам ({selectedMetric?.label ?? "Выберите метрику"}
              )
            </Typography>
            <MetricSelector
              metrics={availableMetrics}
              selectedMetric={selectedMetric}
              onChange={setSelectedMetric}
            />
          </Box>
          {/* Сам график */}
          <ResponsiveContainer width="100%" height={400}>
            <LineChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="step_label"
                tick={false}
                angle={-60}
                textAnchor="end"
                height={70}
                interval={0}
              />
              <YAxis />
              <Tooltip />
              <Legend
                verticalAlign="bottom"
                // Функция для рендеринга текста легенды с увеличенным шрифтом
                formatter={(value, entry, index) => (
                  <span style={{ fontSize: "25px", color: entry.color }}>
                    {" "}
                    {/* Можешь изменить '14px' */}
                    {value}
                  </span>
                )}
              />
              <Line
                isAnimationActive={false}
                type="monotone"
                dataKey="value"
                name={selectedMetric?.label ?? ""}
                stroke="#8884d8"
                activeDot={{ r: 6 }}
                dot={{ r: 2 }}
                connectNulls
              />
              {/* Линии Min/Max */}
              {minValue !== maxValue &&
                minValue !== Infinity &&
                minValue !== 0 && (
                  <ReferenceLine
                    y={minValue}
                    label={{
                      value: `Min: ${minValue.toFixed(1)}`,
                      position: "insideTopLeft",
                    }}
                    stroke="red"
                    strokeDasharray="3 3"
                  />
                )}
              {minValue !== maxValue &&
                maxValue !== -Infinity &&
                maxValue !== 0 && (
                  <ReferenceLine
                    y={maxValue}
                    label={{
                      value: `Max: ${maxValue.toFixed(1)}`,
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
        !loading &&
        !error && (
          <Typography
            sx={{ textAlign: "center", color: "text.secondary", my: 5 }}
          >
            Нет шагов, соответствующих выбранным фильтрам.
          </Typography>
        )
      )}

      {/* Таблица */}
      {filteredStepsData.length > 0 && (
        <>
          <Paper sx={{ height: 700, width: "100%", mb: 3 }}>
            <DataGrid
              density="compact"
              getRowId={(row) => row.step_id}
              rows={filteredStepsData}
              columns={columns} // Используем обновленные колонки
              initialState={{
                sorting: { sortModel: [{ field: "step_id", sort: "asc" }] },
                pagination: { paginationModel: { pageSize: 100 } },
              }}
              pageSizeOptions={[25, 50, 100]}
              checkboxSelection={false}
              disableRowSelectionOnClick
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

      {/* Рекомендации (заглушка) */}
      <Recommendations />
    </Container>
  );
}

export default Dashboard;
