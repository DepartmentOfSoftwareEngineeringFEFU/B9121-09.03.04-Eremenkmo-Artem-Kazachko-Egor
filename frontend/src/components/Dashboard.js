// src/components/Dashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
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

import { getStepsStructure, getCourseCompletionRates } from "../api/apiService";
import MetricSelector from "./MetricSelector";
import Recommendations from "./Recommendations";

// --- Функции-хелперы для форматирования ---
const formatPercentage = (value) => {
  if (value === null || typeof value !== "number" || !isFinite(value)) return "N/A"; // Добавил value === null
  // Если значение уже процент (например, от 0 до 100), не умножаем на 100
  const displayValue = (value >= 0 && value <= 1 && (value * 100) <= 100 && !(value > 1 && value <=100)) ? value * 100 : value;
  return `${displayValue.toFixed(1)}%`;
};
const formatNumber = (value, decimals = 1) => {
  if (value === null || typeof value === "undefined" || !isFinite(value)) return "N/A";
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return "N/A"; // Технически уже покрыто isFinite
  return numValue.toFixed(decimals);
};
const formatIntegerWithZero = (value) => {
  if (value === null || typeof value === "undefined") return "N/A";
  const intValue = parseInt(value, 10);
  return isNaN(intValue) || !isFinite(intValue) ? "N/A" : intValue;
};
// ---------------------------------------------------------------------------------

const availableMetrics = [
  { value: "success_rate", label: "Успешность шага (%)", dataKey: "success_rate" },
  { value: "passed_users_sub", label: "Прошли шаг (чел.)", dataKey: "passed_users_sub" },
  { value: "all_users_attempted", label: "Пытались сдать (чел.)", dataKey: "all_users_attempted" },
  { value: "avg_attempts_per_passed", label: "Ср. попытки (успех)", dataKey: "avg_attempts_per_passed" },
  { value: "comment_count", label: "Комментарии (кол-во)", dataKey: "comment_count" },
  { value: "difficulty_index", label: "Сложность (индекс)", dataKey: "difficulty_index" },
  { value: "discrimination_index", label: "Дискриминативность (индекс)", dataKey: "discrimination_index" },
  { value: "skip_rate", label: "Доля пропуска шага (%)", dataKey: "skip_rate" },
  { value: "completion_index", label: "Индекс \"дропа\" после шага (%)", dataKey: "completion_index" },
  { value: "comment_rate", label: "Доля комментирующих (%)", dataKey: "comment_rate" },
  { value: "usefulness_index", label: "Полезность (просмотры)", dataKey: "usefulness_index" },
  { value: "avg_completion_time_filtered_seconds", label: "Ср. время (сек, фильтр.)", dataKey: "avg_completion_time_filtered_seconds" },
  { value: "views", label: "Просмотры (всего)", dataKey: "views" },
  { value: "unique_views", label: "Уникальные просмотры", dataKey: "unique_views" },
];

function Dashboard() {
  console.log("--- Dashboard Component Render ---");

  const navigate = useNavigate();
  const location = useLocation();

  const [courseIdForLocalStorage, setCourseIdForLocalStorage] = useState(null);
  const [courseTitle, setCourseTitle] = useState("Загрузка...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [allStepsDataFromApi, setAllStepsDataFromApi] = useState([]);
  const [filteredStepsData, setFilteredStepsData] = useState([]);
  const [modules, setModules] = useState([]);
  const [globalMetricsState, setGlobalMetricsState] = useState(null);

  const [selectedModuleIds, setSelectedModuleIds] = useState([]);
  const [showOnlyWithNewIndices, setShowOnlyWithNewIndices] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState(availableMetrics[0]);
  const [selectedStepIds, setSelectedStepIds] = useState([]);

  useEffect(() => {
    console.log("--- Dashboard: useEffect [location.search] - ЗАГРУЗКА API ---");
    const params = new URLSearchParams(location.search);
    const idFromUrlEncoded = params.get("courseId");
    console.log("   URL Encoded ID:", idFromUrlEncoded);

    if (!idFromUrlEncoded) {
      setCourseTitle("Курс не выбран");
      setError("Не указан ID курса в адресе страницы.");
      setLoading(false); setGlobalMetricsState(null); setAllStepsDataFromApi([]); setModules([]);
      return;
    }

    let decodedIdFromUrl;
    let numericIdForApiRequests;

    try {
      decodedIdFromUrl = decodeURIComponent(idFromUrlEncoded);
      console.log("   URL Decoded ID (для localStorage/title):", decodedIdFromUrl);
      
      const potentialNumericId = parseInt(decodedIdFromUrl, 10);
      if (!isNaN(potentialNumericId) && potentialNumericId.toString() === decodedIdFromUrl) {
        numericIdForApiRequests = potentialNumericId;
      } else {
        const matchResult = decodedIdFromUrl.match(/(\d+)$/); // Ищем числа в конце строки
        numericIdForApiRequests = matchResult ? parseInt(matchResult[1], 10) : NaN;
      }

      if (isNaN(numericIdForApiRequests)) {
        throw new Error("Не удалось извлечь числовой ID курса из URL.");
      }
      console.log("   Numeric Course ID (для API запросов):", numericIdForApiRequests);

    } catch (e) {
      console.error("   Ошибка обработки courseId из URL:", e);
      setError(`Некорректный ID курса в URL: ${e.message}`);
      setLoading(false);
      return;
    }

    setCourseIdForLocalStorage(decodedIdFromUrl);
    setLoading(true); setError(null); setGlobalMetricsState(null);
    setSelectedModuleIds([]); setShowOnlyWithNewIndices(false);
    setAllStepsDataFromApi([]); setFilteredStepsData([]); setModules([]);
    setSelectedMetric(availableMetrics[0]); // Сброс метрики к дефолтной

    const storedCourses = localStorage.getItem("uploadedCourses");
    let courseName = `Курс ID ${numericIdForApiRequests}`; // Дефолтное название
    if (storedCourses) {
      try {
        const courses = JSON.parse(storedCourses);
        // Ищем по закодированному или декодированному ID для большей гибкости
        const currentCourse = courses.find(c => c.id === idFromUrlEncoded || c.id === decodedIdFromUrl || decodeURIComponent(c.id) === decodedIdFromUrl);
        if (currentCourse) courseName = currentCourse.name;
      } catch (e) { console.error("   Ошибка чтения localStorage для имени курса:", e); }
    }
    setCourseTitle(courseName);

    const fetchData = async () => {
      console.log(`   fetchData: Начало загрузки API для курса ID ${numericIdForApiRequests}...`);
      try {
        const [allCoursesCompletionData, stepsStructureData] = await Promise.all([
          getCourseCompletionRates(),
          getStepsStructure(numericIdForApiRequests), // Передаем числовой ID
        ]);

        console.log("   fetchData: Получены ответы API.");
        console.log("      All Courses Completion Rates:", allCoursesCompletionData);
        console.log("      Steps Structure:", stepsStructureData);
        if (stepsStructureData && stepsStructureData.length > 0) {
            console.log("Структура ПЕРВОГО шага из API:", JSON.stringify(stepsStructureData[0], null, 2));
        }

        // Обработка глобальных метрик
        if (allCoursesCompletionData && typeof allCoursesCompletionData === 'object' && !allCoursesCompletionData.error) {
          const currentCourseMetrics = allCoursesCompletionData[numericIdForApiRequests.toString()];
          if (currentCourseMetrics && !currentCourseMetrics.error) {
            setGlobalMetricsState(currentCourseMetrics);
            console.log(`      Глобальные метрики для курса ${numericIdForApiRequests} установлены.`);
          } else {
            const errorMsg = `Данные о результативности для курса ID ${numericIdForApiRequests} не найдены или содержат ошибку.`;
            console.warn("      ", errorMsg, currentCourseMetrics);
            setGlobalMetricsState({ error: errorMsg, details: currentCourseMetrics?.details || "Нет деталей" });
          }
        } else {
          const errorMsg = "Не удалось загрузить данные о результативности курсов.";
          console.warn(`      ${errorMsg}`, allCoursesCompletionData);
          setGlobalMetricsState({ error: errorMsg, details: allCoursesCompletionData?.details || allCoursesCompletionData?.error || "Нет деталей" });
        }

        // Обработка структуры шагов
        if (stepsStructureData && !stepsStructureData.error && Array.isArray(stepsStructureData)) {
          setAllStepsDataFromApi(stepsStructureData);
          console.log(`      Структура шагов (${stepsStructureData.length} шт.) для курса ${numericIdForApiRequests} сохранена.`);
        } else {
          const errorMsgBase = `Не удалось загрузить данные по шагам для курса ${numericIdForApiRequests}.`;
          const stepErrorDetails = stepsStructureData?.details || stepsStructureData?.error || "Неизвестная ошибка структуры шагов";
          const finalErrorMsg = `${errorMsgBase} Детали: ${stepErrorDetails}`;
          console.error(`      ${errorMsgBase}`, stepErrorDetails);
          setAllStepsDataFromApi([]);
          setError(prevError => prevError ? `${prevError} Также: ${finalErrorMsg}` : finalErrorMsg);
        }
      } catch (err) {
        console.error("   fetchData: КРИТИЧЕСКАЯ ОШИБКА загрузки данных:", err);
        setError(err.message || "Не удалось загрузить данные.");
        setAllStepsDataFromApi([]); setGlobalMetricsState(null);
      } finally {
        console.log("   fetchData: Загрузка завершена (finally).");
        setLoading(false);
      }
    };
    fetchData();
  }, [location.search]); // Зависимость от location.search

  const filterAndSetSteps = useCallback(
    (allData, currentSelectedModuleIds, uiFilters) => {
      console.log("--- filterAndSetSteps START ---");
      console.log(`   Исходные данные: ${allData?.length} шагов`);
      if (!allData || allData.length === 0) {
        setFilteredStepsData([]); setModules([]); return;
      }
      const uniqueModules = []; const seenModuleIds = new Set();
      allData.forEach((step) => {
        if (step.module_id && !seenModuleIds.has(step.module_id)) {
          uniqueModules.push({ id: step.module_id, title: step.module_title || `Модуль ${step.module_id}`, position: step.module_position });
          seenModuleIds.add(step.module_id);
        }
      });
      uniqueModules.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
      setModules(uniqueModules);

      let currentlyFilteredData = [...allData];
      // Фильтр по индексам сложности/дискриминативности
      if (uiFilters.showOnlyWithNewIndices) {
        currentlyFilteredData = currentlyFilteredData.filter(
          (step) =>
            (step.difficulty_index !== null && typeof step.difficulty_index === "number") ||
            (step.discrimination_index !== null && typeof step.discrimination_index === "number")
        );
      }
      // Фильтр по модулям
      if (currentSelectedModuleIds && currentSelectedModuleIds.length > 0) {
        const selectedSet = new Set(currentSelectedModuleIds);
        currentlyFilteredData = currentlyFilteredData.filter((step) => step.module_id && selectedSet.has(step.module_id));
      }

      // Сортировка
      currentlyFilteredData.sort((a, b) => {
        const modulePosA = a.module_position ?? Infinity;
        const modulePosB = b.module_position ?? Infinity;
        if (modulePosA !== modulePosB) return modulePosA - modulePosB;
        const lessonPosA = a.lesson_position ?? Infinity;
        const lessonPosB = b.lesson_position ?? Infinity;
        if (lessonPosA !== lessonPosB) return lessonPosA - lessonPosB;
        return (a.step_position ?? Infinity) - (b.step_position ?? Infinity);
      });
      setFilteredStepsData(currentlyFilteredData);
      console.log("--- filterAndSetSteps END ---");
    },
    []
  );

  useEffect(() => {
    console.log("--- Dashboard: useEffect [ФИЛЬТРАЦИЯ] ---");
    if (allStepsDataFromApi.length > 0) {
      filterAndSetSteps(allStepsDataFromApi, selectedModuleIds, { showOnlyWithNewIndices });
    } else {
      setFilteredStepsData([]); setModules([]); // Очищаем, если нет исходных данных
    }
  }, [allStepsDataFromApi, selectedModuleIds, showOnlyWithNewIndices, filterAndSetSteps]);

  const chartData = filteredStepsData.map((item) => {
    let value = null;
    const dataKey = selectedMetric?.dataKey;
    const metricValue = dataKey ? item[dataKey] : null;

    if (metricValue !== null && typeof metricValue === "number" && isFinite(metricValue)) {
      value = metricValue;
      const percentageMetricsDataKeys = ["success_rate", "skip_rate", "completion_index", "comment_rate", "difficulty_index"];
      // Для difficulty_index не умножаем на 100, если он уже больше 1.
      if (percentageMetricsDataKeys.includes(dataKey) && value >= 0 && value <= 1 && !(dataKey === 'difficulty_index' && value > 1)) {
        value = value * 100;
      }
    }
    return { step_label: item.step_title_short || `Шаг ${item.step_id}`, value: value };
  });

  const validValuesForChart = chartData.map(item => item.value).filter(v => v !== null && typeof v === 'number' && isFinite(v));
  const minValue = validValuesForChart.length ? Math.min(...validValuesForChart) : 0;
  const maxValue = validValuesForChart.length ? Math.max(...validValuesForChart) : 0;
  console.log(`Данные для графика (${selectedMetric?.label}): ${chartData.length} точек, Min: ${minValue}, Max: ${maxValue}`);

  const handleStepSelection = (stepId) => {
    setSelectedStepIds((prev) => {
      const newSelection = new Set(prev);
      if (newSelection.has(stepId)) newSelection.delete(stepId);
      else newSelection.add(stepId);
      return Array.from(newSelection);
    });
  };

  const handleCompareSteps = () => {
    if (selectedStepIds.length < 2) {
      alert("Пожалуйста, выберите хотя бы два шага для сравнения."); return;
    }
    const stepsQueryParam = selectedStepIds.join(",");
    // Используем courseIdForLocalStorage, так как он соответствует ID в URL и localStorage
    const encodedCourseIdForURL = courseIdForLocalStorage ? encodeURIComponent(courseIdForLocalStorage) : null;

    if (!encodedCourseIdForURL) {
      console.error("Не удалось получить ID курса для URL сравнения");
      setError("Произошла ошибка при формировании ссылки для сравнения."); return;
    }
    navigate(`/compare?courseId=${encodedCourseIdForURL}&steps=${stepsQueryParam}`);
  };

  const columns = [
    {
      field: "selection",
      headerName: "Выбор",
      width: 80,
      sortable: false,
      filterable: false,
      // renderCell ВСЕГДА использует params
      renderCell: (params) => {
        if (!params.row || typeof params.row.step_id === 'undefined') {
          return null;
        }
        return (
          <FormControlLabel
            sx={{ mr: 0 }}
            control={
              <Checkbox
                size="small"
                checked={selectedStepIds.includes(params.row.step_id)}
                onChange={() => handleStepSelection(params.row.step_id)}
                aria-label={`Выбрать шаг ${params.row.step_id}`}
              />
            }
            label=""
          />
        );
      },
    },
    { field: "step_id", headerName: "ID", width: 90 },
    {
      field: "step_title_full",
      headerName: "Название шага",
      width: 350,
      valueGetter: (fieldValue, row) => row?.step_title_full, // fieldValue будет row.step_title_full
      valueFormatter: (valueToFormat) => { // Принимает только значение
        if (valueToFormat === null || typeof valueToFormat === 'undefined' || String(valueToFormat).trim() === "") {
            return "N/A";
        }
        return String(valueToFormat);
      }
    },
    {
      field: "step_title_short",
      headerName: "Метка",
      width: 130,
      valueGetter: (fieldValue, row) => row?.step_title_short,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined' || String(valueToFormat).trim() === "") {
            return "N/A";
        }
        return String(valueToFormat);
      }
    },
    {
      field: "module_title", // Это поле может отсутствовать в row, мы его вычисляем
      headerName: "Модуль",
      width: 200,
      // valueGetter здесь КЛЮЧЕВОЙ, так как module_title нет напрямую в row
      valueGetter: (fieldValue, row) => { // fieldValue здесь будет значением row.module_title (если оно есть), но нам нужен row.module_id
        if (!row || typeof row.module_id === 'undefined') return null;
        const module = modules.find((m) => m.id === row.module_id);
        return module ? module.title : `ID: ${row.module_id}`; // Сразу формируем строку, если title нет
      },
      // valueFormatter здесь получает уже результат valueGetter
      valueFormatter: (valueToFormat) => {
        // valueToFormat это либо module.title, либо "ID: xxx"
        if (valueToFormat === null || typeof valueToFormat === 'undefined' || String(valueToFormat).trim() === "") {
            return "N/A"; // Если valueGetter вернул null
        }
        return String(valueToFormat);
      }
    },
    // --- Колонки с метриками ---
    {
      field: "success_rate",
      headerName: "Успешн.(%)",
      type: "number",
      width: 100,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatPercentage(valueToFormat);
      }
    },
    {
      field: "passed_users_sub",
      headerName: "Прошли",
      type: "number",
      width: 80,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatIntegerWithZero(valueToFormat);
      }
    },
    {
      field: "all_users_attempted",
      headerName: "Пытались",
      type: "number",
      width: 90,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatIntegerWithZero(valueToFormat);
      }
    },
    {
      field: "avg_attempts_per_passed",
      headerName: "Ср. поп.",
      type: "number",
      width: 90,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatNumber(valueToFormat, 1);
      }
    },
    {
      field: "comment_count",
      headerName: "Комм.",
      type: "number",
      width: 80,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatIntegerWithZero(valueToFormat);
      }
    },
    {
      field: "difficulty_index",
      headerName: "Сложн.инд",
      type: "number",
      width: 100,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatNumber(valueToFormat, 3);
      }
    },
    {
      field: "discrimination_index",
      headerName: "Дискр.инд",
      type: "number",
      width: 100,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatNumber(valueToFormat, 3);
      }
    },
    {
      field: "skip_rate",
      headerName: "Пропуск(%)",
      type: "number",
      width: 110,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatPercentage(valueToFormat);
      }
    },
    {
      field: "completion_index",
      headerName: "Дроп(%)",
      type: "number",
      width: 90,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatPercentage(valueToFormat);
      }
    },
    {
      field: "comment_rate",
      headerName: "Комм.(%)",
      type: "number",
      width: 100,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatPercentage(valueToFormat);
      }
    },
    {
      field: "usefulness_index",
      headerName: "Полезн.",
      type: "number",
      width: 90,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatNumber(valueToFormat, 1);
      }
    },
    {
      field: "avg_completion_time_filtered_seconds",
      headerName: "Ср.время",
      type: "number",
      width: 100,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return `${formatNumber(valueToFormat, 0)} сек`;
      }
    },
    {
      field: "views",
      headerName: "Просмотры",
      type: "number",
      width: 110,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatIntegerWithZero(valueToFormat);
      }
    },
    {
      field: "unique_views",
      headerName: "Уник.пр.",
      type: "number",
      width: 100,
      valueFormatter: (valueToFormat) => {
        if (valueToFormat === null || typeof valueToFormat === 'undefined') return "N/A";
        return formatIntegerWithZero(valueToFormat);
      }
    },
    {
      field: "actions",
      headerName: "Анализ",
      sortable: false,
      filterable: false,
      width: 100,
      // renderCell ВСЕГДА использует params
      renderCell: (params) => {
        if (!params.row || typeof params.row.step_id === 'undefined') {
            return <Button variant="outlined" size="small" disabled>Детали</Button>;
        }
        const encodedCourseIdForURL = courseIdForLocalStorage ? encodeURIComponent(courseIdForLocalStorage) : null;
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
            Детали
          </Button>
        );
      },
    },
];
  const dataForGrid = filteredStepsData.length > 1 ? filteredStepsData.slice(1) : [];

  console.log(`Рендеринг. Loading: ${loading}, Error: ${error}, Steps for Grid: ${dataForGrid.length}, GlobalMetrics:`, globalMetricsState);


  if (loading) { return (<Container sx={{ display: "flex", justifyContent: "center", mt: 5 }}><CircularProgress /></Container>); }
  
  const isMajorError = error && 
                     !allStepsDataFromApi.length && 
                     (!globalMetricsState || (globalMetricsState && globalMetricsState.error && Object.keys(globalMetricsState).length <=2 && !globalMetricsState.ranges)) ;
  if (isMajorError) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Ошибка загрузки данных: {error}</Alert>
        <Button onClick={() => window.location.reload()} sx={{ mt: 2 }}>Попробовать снова</Button>
      </Container>
    );
  }
  const partialError = error && !isMajorError;


  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Typography variant="h4" gutterBottom>Дашборд аналитики курса: {courseTitle}</Typography>
      {partialError && (<Alert severity="warning" sx={{ mb: 3 }}>{error} (Некоторые данные могут быть неактуальны или не загружены)</Alert> )}

      {globalMetricsState && globalMetricsState.ranges && !globalMetricsState.error ? (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {Object.entries(globalMetricsState.ranges).map(([key, rangeData]) => {
            let title = key;
            if (key === "gte_80") title = "Завершили (≥80%)";
            else if (key === "gte_50_lt_80") title = "Прогресс (50-79%)";
            else if (key === "gte_25_lt_50") title = "Начали (25-49%)";
            else if (key === "lt_25") title = "Низкий прогресс (<25%)";
            return (
              <Grid item xs={12} sm={6} md={3} key={key}>
                <Paper sx={{ p: 2, display: "flex", flexDirection: "column", alignItems: "center", height: "100%" }}>
                  <Typography component="h2" variant="h6" color="primary" gutterBottom sx={{ textAlign: "center" }}>{title}</Typography>
                  <Typography component="p" variant="h4">{formatPercentage(rangeData.percentage)}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    ({rangeData.count ?? "?"} из {globalMetricsState.total_learners_on_course ?? "?"})
                  </Typography>
                </Paper>
              </Grid>
            );
          })}
        </Grid>
      ) : globalMetricsState && globalMetricsState.error ? (
        <Alert severity="warning" sx={{ mb: 3 }}>
          Не удалось загрузить глоб. метрики для этого курса: {globalMetricsState.details || globalMetricsState.error}
        </Alert>
      ) : (
        !loading && (<Typography sx={{ mb: 3, fontStyle: "italic" }}>Глобальные метрики не загружены или не найдены для этого курса.</Typography>)
      )}

      <Paper sx={{ p: 2, mb: 3, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="body1" sx={{ mr: 1, fontWeight: "bold" }}>Фильтры:</Typography>
        <FormControl sx={{ m: 1, minWidth: 250, maxWidth: 400 }} size="small" disabled={modules.length === 0}>
           <InputLabel id="module-select-label">Модули</InputLabel>
           <Select
            labelId="module-select-label"
            id="module-select"
            multiple
            value={selectedModuleIds}
            onChange={(event) => {
                const value = event.target.value;
                const SELECT_ALL_VALUE = "___SELECT_ALL___";
                if (value.includes(SELECT_ALL_VALUE)) {
                  const allValidModuleIds = modules.map((m) => m.id).filter((id) => id != null);
                  const currentValidSelectedIds = selectedModuleIds.filter((id) => id != null);
                  if (modules.length > 0 && currentValidSelectedIds.length === allValidModuleIds.length) {
                    setSelectedModuleIds([]);
                  } else {
                    setSelectedModuleIds(allValidModuleIds);
                  }
                } else {
                  setSelectedModuleIds(value.filter((id) => id != null));
                }
            }}
            input={<OutlinedInput label="Модули" />}
            renderValue={(selected) => {
                const validSelected = selected.filter(id => id != null);
                const allValidModuleIds = modules.map(m => m.id).filter(id => id != null);
                if (modules.length > 0 && validSelected.length === allValidModuleIds.length) {
                  return <em>Все модули ({modules.length})</em>;
                } else if (validSelected.length === 0) {
                  return <em>Все модули ({modules.length || 0})</em>;
                } else {
                  return (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {validSelected.map((id) => {
                        const module = modules.find((m) => m.id === id);
                        return (<Chip key={id} label={module?.title || `ID: ${id}`} size="small" />);
                      })}
                    </Box>
                  );
                }
            }}
            MenuProps={{ PaperProps: { style: { maxHeight: 224, width: 300 } }, }}
           >
             <MenuItem value="___SELECT_ALL___" disabled={modules.length === 0}>
                <Checkbox
                    checked={modules.length > 0 && selectedModuleIds.filter(id => id != null).length === modules.map(m => m.id).filter(id => id != null).length}
                    indeterminate={selectedModuleIds.filter(id => id != null).length > 0 && selectedModuleIds.filter(id => id != null).length < modules.map(m => m.id).filter(id => id != null).length}
                    size="small"
                />
                <ListItemText primary={<em>{modules.length > 0 && selectedModuleIds.filter(id => id != null).length === modules.map(m => m.id).filter(id => id != null).length ? "Снять выделение" : "Выбрать все"}</em>} />
             </MenuItem>
             {modules.map((module) => module.id != null ? ( <MenuItem key={module.id} value={module.id}> <Checkbox checked={selectedModuleIds.includes(module.id)} size="small" /> <ListItemText primary={module.title || `Модуль ${module.id}`} /> </MenuItem> ) : null )}
           </Select>
        </FormControl>
             </Paper>

      {dataForGrid.length > 0 ? ( // Проверяем dataForGrid для графика тоже
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", mb: 2, }}>
            <Typography variant="h6">Статистика по шагам ({selectedMetric?.label ?? "Выберите метрику"})</Typography>
            <MetricSelector
              metrics={availableMetrics}
              selectedMetric={selectedMetric || availableMetrics[0]}
              onChange={setSelectedMetric}
            />
          </Box>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData.length > 1 ? chartData.slice(1) : []} margin={{ top: 5, right: 30, left: 0, bottom: 55 }}> {/* Пропускаем первый шаг и для графика */}
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="step_label" angle={-45} textAnchor="end" interval={9} tick={{ fontSize: 10 }} height={70} />
              <YAxis />
              <Tooltip />
              <Legend verticalAlign="top" height={36}/>
              <Line isAnimationActive={false} type="monotone" dataKey="value" name={selectedMetric?.label ?? ""} stroke="#8884d8" activeDot={{ r: 6 }} dot={{ r: 2 }} connectNulls />
              {minValue !== maxValue && minValue !== Infinity && minValue !== 0 && (<ReferenceLine y={minValue} label={{ value: `Min: ${minValue.toFixed(1)}`, position: "insideTopLeft" }} stroke="red" strokeDasharray="3 3" />)}
              {minValue !== maxValue && maxValue !== -Infinity && maxValue !== 0 && (<ReferenceLine y={maxValue} label={{ value: `Max: ${maxValue.toFixed(1)}`, position: "insideTopRight" }} stroke="green" strokeDasharray="3 3" />)}
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      ) : (
        !loading && !error && (<Typography sx={{ textAlign: "center", color: "text.secondary", my: 5 }}>Нет шагов для отображения (проверьте фильтры или данные курса).</Typography>)
      )}

      {dataForGrid.length > 0 && (
        <>
          <Paper sx={{ height: 600, width: "100%", mb: 3 }}>
            <DataGrid
              density="compact"
              getRowId={(row) => {
                if (typeof row.step_id === 'undefined' || row.step_id === null) {
                  console.error("DataGrid: getRowId - step_id is undefined or null for row. Assigning a temporary ID. Row data:", row);
                  return `temp_id_${Math.random().toString(36).substr(2, 9)}`;
                }
                return row.step_id;
              }}
              rows={dataForGrid} // Используем dataForGrid
              columns={columns}
              initialState={{
                sorting: { sortModel: [{ field: "step_id", sort: "asc" }] },
                pagination: { paginationModel: { pageSize: 50 } },
              }}
              pageSizeOptions={[25, 50, 100]}
              checkboxSelection={false}
              disableRowSelectionOnClick
            />
          </Paper>
          <Box sx={{ mt: 2, mb: 3, textAlign: "center" }}>
            <Button variant="contained" color="primary" size="large" onClick={handleCompareSteps} disabled={selectedStepIds.length < 2}>
              Сравнить выбранные шаги ({selectedStepIds.length})
            </Button>
          </Box>
        </>
      )}
      <Recommendations />
    </Container>
  );
}
export default Dashboard;