// src/components/Dashboard.js
import React, { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Container,
  Typography,
  CircularProgress,
  Alert,
  Box,
  Button, // <--- Убедись, что Button здесь импортирован
} from "@mui/material";

// Импортируем новые компоненты (предполагаем, что они лежат рядом в src/components/)
import GlobalCourseMetrics from './GlobalCourseMetrics';
import DashboardFilters from './DashboardFilters';
import DashboardChart from './DashboardChart';
import DashboardTable from './DashboardTable';
import Recommendations from "./Recommendations";

// Утилиты и константы
import { availableMetrics } from './dashboardUtils'; // Предполагаем, что dashboardUtils.js лежит в src/components/

// API сервис
import { getStepsStructure, getCourseCompletionRates } from "../api/apiService"; // <--- ИСПРАВЛЕН ПУТЬ

function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();

  // --- Состояния ---
  const [courseIdForLocalStorage, setCourseIdForLocalStorage] = useState(null);
  const [currentNumericCourseId, setCurrentNumericCourseId] = useState(null);
  const [courseTitle, setCourseTitle] = useState("Загрузка...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [allStepsDataFromApi, setAllStepsDataFromApi] = useState([]);
  const [filteredStepsData, setFilteredStepsData] = useState([]);
  const [modules, setModules] = useState([]);
  const [globalMetricsState, setGlobalMetricsState] = useState(null);

  const [selectedModuleIds, setSelectedModuleIds] = useState([]);
  const [selectedMetric, setSelectedMetric] = useState(availableMetrics.find(m => m.value === "success_rate") || availableMetrics[0]);
  const [selectedStepIds, setSelectedStepIds] = useState([]);

  // --- useEffect для загрузки данных ---
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const idFromUrl = params.get("courseId");

    if (!idFromUrl) {
      setLoading(false);
      setCurrentNumericCourseId(null);
      setCourseIdForLocalStorage(null);
      setCourseTitle("Курс не выбран");
      setError("Не указан ID курса в URL.");
      return;
    }

    let numericIdForApi;
    // Всегда пытаемся получить числовой ID для API
    const parsedId = parseInt(idFromUrl, 10);
    if (!isNaN(parsedId)) {
        numericIdForApi = parsedId;
    } else {
        // Если не число, это проблема для текущей логики API вызовов
        setError(`Некорректный ID курса в URL для API: "${idFromUrl}" не является числом.`);
        setLoading(false);
        setCurrentNumericCourseId(null);
        setCourseIdForLocalStorage(idFromUrl); // Сохраняем оригинальный для отображения
        setCourseTitle(`Ошибка ID: ${idFromUrl}`);
        return;
    }
    
    setCurrentNumericCourseId(numericIdForApi);
    setCourseIdForLocalStorage(idFromUrl);

    setLoading(true);
    setError(null);
    setGlobalMetricsState(null);
    setSelectedModuleIds([]);
    setAllStepsDataFromApi([]);
    setFilteredStepsData([]);
    setModules([]);
    setSelectedMetric(availableMetrics.find(m => m.value === "success_rate") || availableMetrics[0]);
    setSelectedStepIds([]);

    const storedCourses = localStorage.getItem("uploadedCourses");
    let cName = `Курс ID ${numericIdForApi}`;
    if (storedCourses) {
      try {
        const courses = JSON.parse(storedCourses);
        const currentCourse = courses.find(c => c.id.toString() === idFromUrl.toString());
        if (currentCourse) {
          cName = currentCourse.name;
        }
      } catch (e) {
        console.error("Ошибка чтения localStorage для названия курса:", e);
      }
    }
    setCourseTitle(cName);

    const fetchData = async () => {
      try {
        const [allCoursesCompletionData, stepsStructureData] = await Promise.all([
          getCourseCompletionRates(),
          getStepsStructure(numericIdForApi),
        ]);

        if (allCoursesCompletionData && typeof allCoursesCompletionData === 'object' && !allCoursesCompletionData.error) {
          const courseCompletionMetrics = allCoursesCompletionData[numericIdForApi.toString()];
          if (courseCompletionMetrics && !courseCompletionMetrics.error) {
            setGlobalMetricsState(courseCompletionMetrics);
          } else {
            setGlobalMetricsState({ error: `Нет данных результативности для курса ID ${numericIdForApi}.`, details: courseCompletionMetrics?.details });
          }
        } else {
          setGlobalMetricsState({ error: "Ошибка загрузки результативности курсов.", details: allCoursesCompletionData?.error });
        }

        if (stepsStructureData && !stepsStructureData.error && Array.isArray(stepsStructureData)) {
          setAllStepsDataFromApi(stepsStructureData);
        } else {
          const errorSource = stepsStructureData?.details || stepsStructureData?.error || "Неизвестная ошибка API";
          const formattedErrorMessage = `Не удалось загрузить структуру шагов для курса ID ${numericIdForApi}. Детали: ${errorSource}`;
          setAllStepsDataFromApi([]);
          setError(prevError => (prevError ? `${prevError} Также: ${formattedErrorMessage}` : formattedErrorMessage));
        }
      } catch (err) {
        console.error("Критическая ошибка при загрузке данных дашборда:", err);
        setError(err.message || "Произошла критическая ошибка при загрузке данных.");
        setAllStepsDataFromApi([]);
        setGlobalMetricsState(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [location.search]);

  const filterAndSetSteps = useCallback((allData, currentSelectedModuleIds) => {
    const nonTextSteps = allData.filter(step => step.step_type !== 'text');
    if (!nonTextSteps || nonTextSteps.length === 0) {
      setFilteredStepsData([]);
      setModules([]);
      return;
    }

    const uniqueModules = [];
    const seenModuleIds = new Set();
    nonTextSteps.forEach(step => {
      if (step.module_id != null && !seenModuleIds.has(step.module_id)) {
        uniqueModules.push({
          id: step.module_id,
          title: step.module_title || `Модуль ${step.module_id}`,
          position: step.module_position,
        });
        seenModuleIds.add(step.module_id);
      }
    });
    uniqueModules.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity));
    setModules(uniqueModules);

    let currentlyFilteredData = [...nonTextSteps];
    if (currentSelectedModuleIds && currentSelectedModuleIds.length > 0) {
      const selectedSet = new Set(currentSelectedModuleIds);
      currentlyFilteredData = currentlyFilteredData.filter(step => step.module_id != null && selectedSet.has(step.module_id));
    }

    currentlyFilteredData.sort((a, b) => {
      const moduleAOrder = a.module_position ?? Infinity;
      const moduleBOrder = b.module_position ?? Infinity;
      if (moduleAOrder !== moduleBOrder) return moduleAOrder - moduleBOrder;
      const lessonAOrder = a.lesson_position ?? Infinity;
      const lessonBOrder = b.lesson_position ?? Infinity;
      if (lessonAOrder !== lessonBOrder) return lessonAOrder - lessonBOrder;
      return (a.step_position ?? Infinity) - (b.step_position ?? Infinity);
    });
    setFilteredStepsData(currentlyFilteredData);
  }, []);

  useEffect(() => {
    filterAndSetSteps(allStepsDataFromApi, selectedModuleIds);
  }, [allStepsDataFromApi, selectedModuleIds, filterAndSetSteps]);

  const chartData = filteredStepsData.map(item => {
    let displayValue = null;
    const dataKey = selectedMetric?.dataKey;
    const originalMetricValue = dataKey ? item[dataKey] : null;
    if (originalMetricValue !== null && typeof originalMetricValue === 'number' && isFinite(originalMetricValue)) {
      displayValue = originalMetricValue;
      if (selectedMetric?.isRate && displayValue >= 0 && displayValue <= 1) {
        displayValue = displayValue * 100;
      }
    }
    return {
      ...item,
      step_label: item.step_title_short || `Шаг ${item.step_id}`,
      value: displayValue,
    };
  });

  let yAxisDomainCalculated = ["auto", "auto"];
  if (selectedMetric?.yAxisDomainFixed) {
    yAxisDomainCalculated = [...selectedMetric.yAxisDomainFixed];
  } else {
    const dataValuesForDomain = chartData.map(p => p.value).filter(v => typeof v === 'number' && isFinite(v));
    let calcMin = 0, calcMax = (selectedMetric?.isRate ? 100 : 10);
    if (dataValuesForDomain.length > 0) {
      calcMin = Math.min(...dataValuesForDomain);
      calcMax = Math.max(...dataValuesForDomain);
    }
    const range = calcMax - calcMin;
    let padding;
    if (range === 0) {
        padding = selectedMetric?.isRate ? 5 : (selectedMetric?.dataKey?.includes("index") ? 0.1 : 2);
    } else {
        padding = Math.max(Math.abs(range * 0.1), selectedMetric?.isRate ? 2 : (selectedMetric?.dataKey?.includes("index") ? 0.02 : 1));
    }
    let domainMin = calcMin - padding;
    let domainMax = calcMax + padding;
    if (selectedMetric?.isRate) {
      domainMin = Math.max(0, Math.floor(domainMin / 5) * 5);
      domainMax = Math.min(100.5, Math.ceil(domainMax / 5) * 5);
    } else if (selectedMetric?.dataKey?.includes("index")) {
      domainMin = Math.max(selectedMetric.dataKey === "discrimination_index" ? -0.2 : 0, parseFloat(domainMin.toFixed(2)));
      domainMax = Math.min(1.05, parseFloat(domainMax.toFixed(2)));
    } else {
      domainMin = Math.floor(domainMin);
      domainMax = Math.ceil(domainMax);
    }
    if (domainMin >= domainMax) {
        domainMax = domainMin + (selectedMetric?.isRate ? 10 : (selectedMetric?.dataKey?.includes("index") ? 0.2 : 5));
    }
    yAxisDomainCalculated = [domainMin, domainMax];
  }

  const handleStepSelection = (stepId) => {
    setSelectedStepIds(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(stepId)) {
        newSelected.delete(stepId);
      } else {
        newSelected.add(stepId);
      }
      return Array.from(newSelected);
    });
  };

  const handleCompareSteps = () => {
    if (selectedStepIds.length < 2) {
      alert("Пожалуйста, выберите хотя бы два шага для сравнения.");
      return;
    }
    if (!courseIdForLocalStorage) {
      setError("ID курса не определен. Невозможно перейти к сравнению.");
      return;
    }
    const stepsQueryParam = selectedStepIds.join(',');
    navigate(`/compare?courseId=${encodeURIComponent(courseIdForLocalStorage)}&steps=${stepsQueryParam}`);
  };

  if (loading && !allStepsDataFromApi.length && !globalMetricsState) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress size={60} />
      </Container>
    );
  }

  const isMajorError = error && !allStepsDataFromApi.length &&
                       (!globalMetricsState || (globalMetricsState && globalMetricsState.error && Object.keys(globalMetricsState).length <= 2));

  if (isMajorError) {
    return (
      <Container sx={{ mt: 4, textAlign: 'center' }}>
        <Alert severity="error" sx={{ mb: 2 }}>
            Ошибка загрузки данных курса: {error}
        </Alert>
        <Button onClick={() => window.location.reload()} variant="outlined"> {/* Кнопка теперь определена */}
          Попробовать снова
        </Button>
      </Container>
    );
  }

  const partialError = error && !isMajorError;

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Дашборд аналитики курса: {courseTitle}
      </Typography>

      {partialError && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          При загрузке данных произошла ошибка: {error} Некоторые данные могут быть недоступны.
        </Alert>
      )}

      <GlobalCourseMetrics globalMetricsState={globalMetricsState} isLoading={loading && !globalMetricsState} />

      <DashboardFilters
        modules={modules}
        selectedModuleIds={selectedModuleIds}
        setSelectedModuleIds={setSelectedModuleIds}
        isLoading={loading && !modules.length}
      />

      {loading && (filteredStepsData.length === 0 && allStepsDataFromApi.length > 0) && (
          <Box sx={{display: 'flex', justifyContent: 'center', my: 5}}><CircularProgress /></Box>
      )}

      {(!loading || filteredStepsData.length > 0) &&
        <DashboardChart
          chartData={chartData}
          selectedMetric={selectedMetric}
          availableMetrics={availableMetrics}
          onMetricChange={setSelectedMetric}
          yAxisDomain={yAxisDomainCalculated}
          goodThresholdValue={selectedMetric?.isRate ? (selectedMetric?.thresholdGood != null ? selectedMetric.thresholdGood * 100 : null) : selectedMetric?.thresholdGood}
          badThresholdValue={selectedMetric?.isRate ? (selectedMetric?.thresholdBad != null ? selectedMetric.thresholdBad * 100 : null) : selectedMetric?.thresholdBad}
          invertThresholds={selectedMetric?.invertThresholds}
          isRateMetric={selectedMetric?.isRate}
        />
      }

      {(!loading || filteredStepsData.length > 0) &&
        <DashboardTable
          dataForGrid={filteredStepsData}
          availableMetrics={availableMetrics}
          selectedStepIds={selectedStepIds}
          onStepSelection={handleStepSelection}
          onCompareSteps={handleCompareSteps}
          courseIdForLocalStorage={courseIdForLocalStorage}
          modulesForTitle={modules}
          isLoading={loading && filteredStepsData.length === 0 && allStepsDataFromApi.length > 0}
        />
      }

      {!isMajorError && currentNumericCourseId != null && !isNaN(currentNumericCourseId) && ( // Проверяем, что currentNumericCourseId - число
         <Recommendations
            courseId={currentNumericCourseId}
            courseTitleFromUpload={courseTitle}
         />
      )}
    </Container>
  );
}

export default Dashboard;