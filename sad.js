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
import Recommendations from "./Recommendations"; // Импортируем обновленный Recommendations

// --- Функции-хелперы для форматирования (предполагаются актуальными) ---
const formatPercentage = (value) => {
  if (value === null || typeof value !== "number" || !isFinite(value)) return "N/A";
  const isLikelyIndex = value >= 0 && value <= 1; // Успешность, доля и т.д.
  // difficulty_index и discrimination_index обычно не умножают на 100, если они уже индексы
  // но если они приходят как доли (0-1) и должны быть процентами, то нужно
  // Для большинства "rate" метрик, которые приходят как 0.xx, умножаем на 100
  const displayValue = isLikelyIndex ? value * 100 : value;
  return `${displayValue.toFixed(1)}%`;
};
const formatNumber = (value, decimals = 1) => {
  if (value === null || typeof value === "undefined" || !isFinite(value)) return "N/A";
  const numValue = parseFloat(value);
  if (isNaN(numValue)) return "N/A";
  return numValue.toFixed(decimals);
};
const formatIntegerWithZero = (value) => {
  if (value === null || typeof value === "undefined") return "N/A";
  const intValue = parseInt(value, 10);
  return isNaN(intValue) || !isFinite(intValue) ? "N/A" : intValue; // Возвращаем 0, если было 0
};
// ---------------------------------------------------------------------------------

const availableMetrics = [
  { value: "success_rate", label: "Успешность шага (%)", dataKey: "success_rate", format: formatPercentage },
  { value: "passed_users_sub", label: "Прошли шаг (чел.)", dataKey: "passed_users_sub", format: formatIntegerWithZero },
  { value: "all_users_attempted", label: "Пытались сдать (чел.)", dataKey: "all_users_attempted", format: formatIntegerWithZero },
  { value: "avg_attempts_per_passed", label: "Ср. попытки (успех)", dataKey: "avg_attempts_per_passed", format: (v) => formatNumber(v,1) },
  { value: "comment_count", label: "Комментарии (кол-во)", dataKey: "comment_count", format: formatIntegerWithZero },
  { value: "difficulty_index", label: "Сложность (индекс)", dataKey: "difficulty_index", format: (v) => formatNumber(v,3) }, // Индекс обычно 0-1
  { value: "discrimination_index", label: "Дискриминативность (индекс)", dataKey: "discrimination_index", format: (v) => formatNumber(v,3) }, // Индекс обычно 0-1
  { value: "skip_rate", label: "Доля пропуска шага (%)", dataKey: "skip_rate", format: formatPercentage },
  { value: "completion_index", label: "Индекс \"дропа\" после шага (%)", dataKey: "completion_index", format: formatPercentage },
  { value: "comment_rate", label: "Доля комментирующих (%)", dataKey: "comment_rate", format: formatPercentage },
  { value: "usefulness_index", label: "Полезность (просмотры/уник.)", dataKey: "usefulness_index", format: (v) => formatNumber(v,1) },
  { value: "avg_completion_time_filtered_seconds", label: "Ср. время (сек, фильтр.)", dataKey: "avg_completion_time_filtered_seconds", format: formatIntegerWithZero },
  { value: "views", label: "Просмотры (всего)", dataKey: "views", format: formatIntegerWithZero },
  { value: "unique_views", label: "Уникальные просмотры", dataKey: "unique_views", format: formatIntegerWithZero },
];

function Dashboard() {
  console.log("--- Dashboard Component Render ---");

  const navigate = useNavigate();
  const location = useLocation();

  const [courseIdForLocalStorage, setCourseIdForLocalStorage] = useState(null); // Строковый ID из URL для ссылок
  const [currentNumericCourseId, setCurrentNumericCourseId] = useState(null); // Числовой ID для API и Recommendations
  const [courseTitle, setCourseTitle] = useState("Загрузка...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [allStepsDataFromApi, setAllStepsDataFromApi] = useState([]);
  const [filteredStepsData, setFilteredStepsData] = useState([]);
  const [modules, setModules] = useState([]);
  const [globalMetricsState, setGlobalMetricsState] = useState(null);

  const [selectedModuleIds, setSelectedModuleIds] = useState([]);
  const [showOnlyWithNewIndices, setShowOnlyWithNewIndices] = useState(false); // Это состояние не используется явно в фильтрах, но оставлю
  const [selectedMetric, setSelectedMetric] = useState(availableMetrics[0]);
  const [selectedStepIds, setSelectedStepIds] = useState([]);

  useEffect(() => {
    console.log("--- Dashboard: useEffect [location.search] - ЗАГРУЗКА API ---");
    const params = new URLSearchParams(location.search);
    const idFromUrl = params.get("courseId");
    console.log("   ID из URL:", idFromUrl);

    if (!idFromUrl) {
      setCourseTitle("Курс не выбран");
      setError("Не указан ID курса в адресе страницы.");
      setLoading(false); setGlobalMetricsState(null); setAllStepsDataFromApi([]); setModules([]);
      setCurrentNumericCourseId(null); setCourseIdForLocalStorage(null);
      return;
    }

    let numericIdForApi;
    try {
      numericIdForApi = parseInt(idFromUrl, 10);
      if (isNaN(numericIdForApi)) {
        throw new Error("ID курса в URL не является числом.");
      }
      setCurrentNumericCourseId(numericIdForApi);
      setCourseIdForLocalStorage(idFromUrl); // Сохраняем исходную строку из URL для ссылок
    } catch (e) {
      console.error("   Ошибка обработки courseId из URL:", e);
      setError(`Некорректный ID курса в URL: ${e.message}`);
      setLoading(false);
      setCurrentNumericCourseId(null); setCourseIdForLocalStorage(null);
      return;
    }

    setLoading(true); setError(null); setGlobalMetricsState(null);
    setSelectedModuleIds([]); setShowOnlyWithNewIndices(false);
    setAllStepsDataFromApi([]); setFilteredStepsData([]); setModules([]);
    setSelectedMetric(availableMetrics[0]);

    const storedCourses = localStorage.getItem("uploadedCourses");
    let courseName = `Курс ID ${numericIdForApi}`;
    if (storedCourses) {
      try {
        const courses = JSON.parse(storedCourses);
        const currentCourse = courses.find(c => c.id === numericIdForApi); // Ищем по числовому ID
        if (currentCourse) courseName = currentCourse.name;
      } catch (e) { console.error("   Ошибка чтения localStorage для имени курса:", e); }
    }
    setCourseTitle(courseName);

    const fetchData = async () => {
      console.log(`   fetchData: Начало загрузки API для курса ID ${numericIdForApi}...`);
      try {
        const [allCoursesCompletionData, stepsStructureData] = await Promise.all([
          getCourseCompletionRates(),
          getStepsStructure(numericIdForApi),
        ]);

        console.log("   fetchData: Получены ответы API.");
        if (allCoursesCompletionData && typeof allCoursesCompletionData === 'object' && !allCoursesCompletionData.error) {
          const currentCourseMetrics = allCoursesCompletionData[numericIdForApi.toString()];
          if (currentCourseMetrics && !currentCourseMetrics.error) {
            setGlobalMetricsState(currentCourseMetrics);
          } else {
            setGlobalMetricsState({ error: `Данные о результативности для курса ID ${numericIdForApi} не найдены или содержат ошибку.`, details: currentCourseMetrics?.details || "Нет деталей" });
          }
        } else {
          setGlobalMetricsState({ error: "Не удалось загрузить данные о результативности курсов.", details: allCoursesCompletionData?.error || "Нет деталей" });
        }

        if (stepsStructureData && !stepsStructureData.error && Array.isArray(stepsStructureData)) {
          setAllStepsDataFromApi(stepsStructureData);
        } else {
          const errorMsgBase = `Не удалось загрузить данные по шагам для курса ${numericIdForApi}.`;
          const stepErrorDetails = stepsStructureData?.details || stepsStructureData?.error || "Неизвестная ошибка структуры шагов";
          const finalErrorMsg = `${errorMsgBase} Детали: ${stepErrorDetails}`;
          setAllStepsDataFromApi([]);
          setError(prevError => prevError ? `${prevError} Также: ${finalErrorMsg}` : finalErrorMsg);
        }
      } catch (err) {
        console.error("   fetchData: КРИТИЧЕСКАЯ ОШИБКА загрузки данных:", err);
        setError(err.message || "Не удалось загрузить данные.");
        setAllStepsDataFromApi([]); setGlobalMetricsState(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [location.search]);

  const filterAndSetSteps = useCallback(
    (allData, currentSelectedModuleIds) => { // Убрал uiFilters, т.к. showOnlyWithNewIndices не используется
      console.log("--- filterAndSetSteps START ---");
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
      if (currentSelectedModuleIds && currentSelectedModuleIds.length > 0) {
        const selectedSet = new Set(currentSelectedModuleIds);
        currentlyFilteredData = currentlyFilteredData.filter((step) => step.module_id && selectedSet.has(step.module_id));
      }

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
      filterAndSetSteps(allStepsDataFromApi, selectedModuleIds);
    } else {
      setFilteredStepsData([]); setModules([]);
    }
  }, [allStepsDataFromApi, selectedModuleIds, filterAndSetSteps]);

  const chartData = filteredStepsData.map((item) => {
    let value = null;
    const dataKey = selectedMetric?.dataKey;
    const metricValue = dataKey ? item[dataKey] : null;

    if (metricValue !== null && typeof metricValue === "number" && isFinite(metricValue)) {
      value = metricValue;
      // Для процентных метрик, которые приходят как доли (0-1), умножаем на 100
      const percentageMetricsDataKeys = ["success_rate", "skip_rate", "completion_index", "comment_rate"];
      if (percentageMetricsDataKeys.includes(dataKey) && value >= 0 && value <= 1) {
        value = value * 100;
      }
    }
    return { step_label: item.step_title_short || `Шаг ${item.step_id}`, value: value, step_id: item.step_id };
  });

  const validValuesForChart = chartData.map(item => item.value).filter(v => v !== null && typeof v === 'number' && isFinite(v));
  const minValue = validValuesForChart.length ? Math.min(...validValuesForChart) : 0;
  const maxValue = validValuesForChart.length ? Math.max(...validValuesForChart) : 0;

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
    if (!courseIdForLocalStorage) {
      console.error("Не удалось получить ID курса для URL сравнения");
      setError("Произошла ошибка при формировании ссылки для сравнения."); return;
    }
    navigate(`/compare?courseId=${encodeURIComponent(courseIdForLocalStorage)}&steps=${stepsQueryParam}`);
  };

  const columns = [
    {
      field: "selection", headerName: "Выбор", width: 70, sortable: false, filterable: false,
      renderCell: (params) => (
        <Checkbox size="small" checked={selectedStepIds.includes(params.row.step_id)} onChange={() => handleStepSelection(params.row.step_id)} />
      ),
    },
    { field: "step_id", headerName: "ID", width: 80 },
    { field: "step_title_full", headerName: "Название шага", width: 300, valueGetter: (v, row) => row.step_title_full || row.step_title_short || `Шаг ${row.step_id}` },
    { field: "step_title_short", headerName: "Метка", width: 150 },
    {
      field: "module_title", headerName: "Модуль", width: 200,
      valueGetter: (v, row) => modules.find(m => m.id === row.module_id)?.title || `ID: ${row.module_id}`,
    },
    // Динамически добавляем колонки для всех метрик, чтобы пользователь мог их видеть и сортировать
    ...availableMetrics.map(metric => ({
      field: metric.dataKey,
      headerName: metric.label.replace('(%)', '').replace('(чел.)', '').replace('(успех)', '').replace('(кол-во)', '').replace('(индекс)','').replace('(сек, фильтр.)','').replace('(всего)','').replace('(просмотры/уник.)','').trim(), // Более короткое название для заголовка
      type: "number",
      width: metric.label.includes("время") || metric.label.includes("Название") ? 130 : 110,
      valueGetter: (v, row) => row[metric.dataKey],
      valueFormatter: (value) => metric.format(value), // Используем свою функцию форматирования
      headerAlign: 'right',
      align: 'right',
    })),
    {
      field: "actions", headerName: "Анализ", width: 100, sortable: false, filterable: false,
      renderCell: (params) => (
        <Button variant="outlined" size="small" component={RouterLink} disabled={!courseIdForLocalStorage}
          to={courseIdForLocalStorage ? `/step/${params.row.step_id}?courseId=${encodeURIComponent(courseIdForLocalStorage)}` : "#"}
        > Детали </Button>
      ),
    },
  ];

  // Пропускаем первый шаг для таблицы и графика, если есть данные (часто это "Информация о курсе" или подобное)
  // Это предположение, если оно неверно, удали .slice(1)
  const dataForGrid = filteredStepsData.length > 0 ? filteredStepsData : []; // Показываем все отфильтрованные
  const dataForChart = chartData.length > 0 ? chartData : [];


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
                  setSelectedModuleIds(modules.length > 0 && currentValidSelectedIds.length === allValidModuleIds.length ? [] : allValidModuleIds);
                } else {
                  setSelectedModuleIds(value.filter((id) => id != null));
                }
            }}
            input={<OutlinedInput label="Модули" />}
            renderValue={(selected) => {
                const validSelected = selected.filter(id => id != null);
                const allValidModuleIds = modules.map(m => m.id).filter(id => id != null);
                if (modules.length > 0 && validSelected.length === allValidModuleIds.length) return <em>Все модули ({modules.length})</em>;
                if (validSelected.length === 0) return <em>Все модули ({modules.length || 0})</em>;
                return (
                    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                      {validSelected.map((id) => (<Chip key={id} label={modules.find((m) => m.id === id)?.title || `ID: ${id}`} size="small" />))}
                    </Box>
                );
            }}
            MenuProps={{ PaperProps: { style: { maxHeight: 224, width: 300 } }, }}
           >
             <MenuItem value="___SELECT_ALL___" disabled={modules.length === 0}>
                <Checkbox size="small"
                    checked={modules.length > 0 && selectedModuleIds.filter(id => id != null).length === modules.map(m => m.id).filter(id => id != null).length}
                    indeterminate={selectedModuleIds.filter(id => id != null).length > 0 && selectedModuleIds.filter(id => id != null).length < modules.map(m => m.id).filter(id => id != null).length}
                />
                <ListItemText primary={<em>{modules.length > 0 && selectedModuleIds.filter(id => id != null).length === modules.map(m => m.id).filter(id => id != null).length ? "Снять выделение" : "Выбрать все"}</em>} />
             </MenuItem>
             {modules.map((module) => module.id != null ? ( <MenuItem key={module.id} value={module.id}> <Checkbox checked={selectedModuleIds.includes(module.id)} size="small" /> <ListItemText primary={module.title || `Модуль ${module.id}`} /> </MenuItem> ) : null )}
           </Select>
        </FormControl>
      </Paper>

      {dataForChart.length > 0 ? (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", mb: 2, }}>
            <Typography variant="h6">Статистика по шагам ({selectedMetric?.label ?? "Выберите метрику"})</Typography>
            <MetricSelector metrics={availableMetrics} selectedMetric={selectedMetric || availableMetrics[0]} onChange={setSelectedMetric} />
          </Box>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dataForChart} margin={{ top: 5, right: 30, left: 0, bottom: 55 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="step_label" angle={-45} textAnchor="end" interval="preserveStartEnd" tick={{ fontSize: 10 }} height={70} />
              <YAxis tickFormatter={(value) => typeof value === 'number' ? value.toFixed(selectedMetric?.dataKey?.includes("index") ? 2 : 0) : value} />
              <Tooltip formatter={(value, name, props) => [selectedMetric.format(props.payload[selectedMetric.dataKey]), selectedMetric.label]}/>
              <Legend verticalAlign="top" height={36}/>
              <Line isAnimationActive={false} type="monotone" dataKey="value" name={selectedMetric?.label ?? ""} stroke="#8884d8" activeDot={{ r: 6 }} dot={{ r: 2 }} connectNulls />
              {minValue !== maxValue && typeof minValue === 'number' && isFinite(minValue) && (<ReferenceLine y={minValue} label={{ value: `Min: ${selectedMetric.format(minValue / (selectedMetric.label.includes('(%)') && minValue <=1 ? 100 : 1) )}`, position: "insideTopLeft" }} stroke="red" strokeDasharray="3 3" />)}
              {minValue !== maxValue && typeof maxValue === 'number' && isFinite(maxValue) && (<ReferenceLine y={maxValue} label={{ value: `Max: ${selectedMetric.format(maxValue / (selectedMetric.label.includes('(%)') && maxValue <=1 ? 100 : 1) )}`, position: "insideTopRight" }} stroke="green" strokeDasharray="3 3" />)}
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      ) : (
        !loading && !error && (<Typography sx={{ textAlign: "center", color: "text.secondary", my: 5 }}>Нет шагов для отображения на графике (проверьте фильтры или данные курса).</Typography>)
      )}

      {dataForGrid.length > 0 && (
        <>
          <Paper sx={{ height: 600, width: "100%", mb: 3 }}>
            <DataGrid
              density="compact"
              getRowId={(row) => row.step_id}
              rows={dataForGrid}
              columns={columns}
              initialState={{
                sorting: { sortModel: [{ field: "step_id", sort: "asc" }] },
                pagination: { paginationModel: { pageSize: 50 } },
              }}
              pageSizeOptions={[25, 50, 100]}
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
      {/* Показываем рекомендации, только если нет основной ошибки загрузки и есть ID курса */}
      {!loading && currentNumericCourseId && (!isMajorError || (isMajorError && globalMetricsState && !globalMetricsState.error)) && (
          <Recommendations courseId={currentNumericCourseId} />
      )}
    </Container>
  );
}
export default Dashboard;