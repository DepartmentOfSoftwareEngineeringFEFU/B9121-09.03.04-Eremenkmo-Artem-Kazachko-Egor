// src/components/StepComparison.js
import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  Container,
  Typography,
  Grid,
  Paper,
  Box,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
} from "@mui/material";
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ReportProblemOutlinedIcon from '@mui/icons-material/ReportProblemOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline'; // Для "нейтральных" или общих заметок

import { getStepsStructure } from "../api/apiService";
import {
    getStepInsights,
    availableMetrics as allMetricDefinitions,
    // Функции форматирования, если они еще не были импортированы глобально или в getStepInsights
    // formatPercentage, formatNumber, formatTime, formatIntegerWithZero 
} from './dashboardUtils';

function StepComparison() {
  const location = useLocation();
  const [comparisonData, setComparisonData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [stepIdsToCompare, setStepIdsToCompare] = useState([]);

  // ... (useEffect для загрузки данных остается таким же) ...
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const courseIdParam = params.get("courseId");
    const stepsParam = params.get("steps");

    if (!courseIdParam) { setError("ID курса не найден в URL для сравнения шагов."); setLoading(false); return; }
    if (!stepsParam) { setError("ID шагов для сравнения не найдены в URL."); setLoading(false); return; }

    let numericCourseId;
    try {
      numericCourseId = parseInt(courseIdParam, 10);
      if (isNaN(numericCourseId)) throw new Error("ID курса не является числом.");
    } catch (e) { setError(`Некорректный ID курса: ${e.message}`); setLoading(false); return; }

    const storedCourses = localStorage.getItem("uploadedCourses");
    let cName = `Сравнение шагов в курсе ID ${numericCourseId}`;
    if (storedCourses) {
      try {
        const courses = JSON.parse(storedCourses);
        const currentCourseData = courses.find(c => c.id.toString() === courseIdParam.toString());
        if (currentCourseData) cName = currentCourseData.name;
      } catch (e) { console.error("Ошибка чтения localStorage (Сравнение):", e); }
    }
    setCourseTitle(cName);

    const idsForComparison = stepsParam.split(",").map(idStr => parseInt(idStr.trim(), 10)).filter(id => !isNaN(id));
    if (idsForComparison.length < 1) { setError("Для сравнения необходимо выбрать хотя бы один шаг."); setLoading(false); return; }
    setStepIdsToCompare(idsForComparison);
    setLoading(true); setError(null); setComparisonData([]);

    const fetchComparisonData = async () => {
      try {
        const allStepsInCourse = await getStepsStructure(numericCourseId);
        if (!allStepsInCourse || allStepsInCourse.error || !Array.isArray(allStepsInCourse)) {
          throw new Error(allStepsInCourse?.details || allStepsInCourse?.error || `Ошибка API при загрузке структуры курса ${numericCourseId}`);
        }
        const selectedStepsData = allStepsInCourse.filter(step => idsForComparison.includes(step.step_id));
        
        if (selectedStepsData.length !== idsForComparison.length) {
            const foundIds = selectedStepsData.map(s => s.step_id);
            const missingIds = idsForComparison.filter(id => !foundIds.includes(id));
            console.warn(`Не все шаги для сравнения найдены. Отсутствуют ID: [${missingIds.join(", ")}].`);
             if(selectedStepsData.length === 0){ setError(`Ни один из запрошенных шагов не найден (ID: [${missingIds.join(", ")}]).`); }
             else { setError(`Некоторые шаги не найдены (ID: [${missingIds.join(", ")}]). Показывается сравнение для найденных.`); }
        }
        if(selectedStepsData.length === 0 && !error) { setError(`Не найдено данных для указанных шагов.`); }
        setComparisonData(selectedStepsData);
      } catch (err) {
        setError(err.message || "Не удалось загрузить данные для сравнения.");
        setComparisonData([]);
      } finally { setLoading(false); }
    };
    fetchComparisonData();
  }, [location.search]);

  if (loading) { return ( <Container sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}><CircularProgress /></Container> );}
  if (error && (!comparisonData || comparisonData.length === 0)) { return ( <Container sx={{ mt: 4 }}><Alert severity="error">{error}</Alert></Container> ); }
  if (!loading && (!comparisonData || comparisonData.length === 0) && !error) { return ( <Container sx={{ mt: 4 }}><Alert severity="info">Нет данных для отображения по выбранным шагам.</Alert></Container> ); }


  const MAX_INSIGHTS_TO_SHOW = 3; // Сколько инсайтов каждого типа показывать

  return (
    <Container maxWidth="xl" sx={{ mt: 2, mb: 4 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h4" component="h1">
          Сравнение шагов курса: "{courseTitle}"
        </Typography>
        <Typography variant="subtitle1" color="text.secondary">
          Сравниваемые ID шагов: {stepIdsToCompare.join(", ")}
        </Typography>
      </Box>

      {error && comparisonData && comparisonData.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {error} (Сравнение может быть неполным)
        </Alert>
      )}

      <Grid container spacing={2.5} alignItems="stretch">
        {comparisonData.map((step) => {
          const insights = getStepInsights(step); // Получаем инсайты для текущего шага

          return (
            <Grid item
              xs={12}
              sm={comparisonData.length >= 2 ? 6 : 12}
              md={comparisonData.length >= 3 ? 4 : (comparisonData.length === 2 ? 6 : 12)}
              lg={comparisonData.length >= 4 ? 3 : (comparisonData.length === 3 ? 4 : (comparisonData.length === 2 ? 6 : 12) )}
              key={step.step_id}
            >
              <Paper elevation={3} sx={{ p: 2, height: "100%", display: "flex", flexDirection: "column" }}>
                <Typography variant="h6" component="div" color="primary" sx={{ mb: 0.5, fontSize: '1.0rem', fontWeight: 'medium' }}>
                  {step.step_title_short || step.step_title_full || `Шаг ${step.step_id}`}
                </Typography>
                {step.step_title_short && step.step_title_full && step.step_title_short !== step.step_title_full && (
                     <Typography variant="caption" display="block" sx={{fontSize: '0.75rem', color: 'text.secondary', mb:1}}>{step.step_title_full}</Typography>
                )}
                <Divider sx={{mb:1.5}} />

                <Box sx={{ fontSize: '0.8rem', mb: 2, flexGrow: 1, overflowY: 'auto', pr: 1 /* небольшой отступ справа для скроллбара */ }}>
                  {allMetricDefinitions.map(metricDef => {
                    if (step.hasOwnProperty(metricDef.dataKey)) {
                      const rawValue = step[metricDef.dataKey];
                      const formattedValue = metricDef.format ? metricDef.format(rawValue) : rawValue;
                      let textClassName = '';
                      if (metricDef.getTextCellClassName) {
                          textClassName = metricDef.getTextCellClassName(rawValue, metricDef);
                      }
                      return (
                        <Typography variant="body2" key={metricDef.value} className={textClassName} sx={{mb: 0.3, display: 'flex', justifyContent: 'space-between'}}>
                          <Box component="span" sx={{fontWeight: 'medium', mr: 1}}>{metricDef.label.replace(/\s*\(.*?\)\s*|\s*шага\s*/gi, "").trim()}:</Box>
                          <Box component="span">{formattedValue}</Box>
                        </Typography>
                      );
                    }
                    return null;
                  })}
                </Box>

                <Box sx={{ mt: 'auto', pt: 1.5, borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <Typography variant="subtitle2" sx={{ mb: 0.5, fontWeight: 'medium', fontSize: '0.85rem' }}>Ключевые моменты:</Typography>
                  
                  {(insights.strengths.length === 0 && insights.areasForImprovement.length === 0) && 
                    !insights.areasForImprovement.some(item => item.note && !item.metric) && ( // Проверяем, что нет общей заметки
                     <Typography variant="caption" color="textSecondary" sx={{display: 'block', fontStyle: 'italic'}}>Нет выраженных особенностей.</Typography>
                  )}

                  {insights.strengths.length > 0 && (
                    <Box sx={{mb: 1}}>
                        <List dense disablePadding>
                        {insights.strengths.slice(0, MAX_INSIGHTS_TO_SHOW).map((item, index) => (
                            <ListItem key={`strength-${step.step_id}-${index}`} sx={{p:0, pb: 0.2, alignItems: 'flex-start'}}>
                            <ListItemIcon sx={{minWidth: 20, mt: 0.4, mr: 0.5 }}><CheckCircleOutlineIcon sx={{fontSize: '1rem'}} color="success" /></ListItemIcon>
                            <ListItemText 
                                primaryTypographyProps={{variant:'caption', color: 'text.primary', sx:{lineHeight: 1.35}}} 
                                primary={<><b>{item.metric}:</b> {item.value} <Typography component="span" variant="caption" color="textSecondary">({item.note})</Typography></>}
                            />
                            </ListItem>
                        ))}
                        </List>
                    </Box>
                  )}
                  {insights.areasForImprovement.length > 0 && (
                     <Box>
                        <List dense disablePadding>
                        {insights.areasForImprovement.slice(0, MAX_INSIGHTS_TO_SHOW).map((item, index) => {
                            let iconColor = "warning";
                            let IconComponent = ReportProblemOutlinedIcon;
                            // Если это просто общая заметка без конкретной метрики (как "Ключевые метрики в средних значениях...")
                            if (!item.metric && item.note) {
                                iconColor = "info";
                                IconComponent = HelpOutlineIcon;
                            }
                            const primaryText = item.metric 
                                ? <><b>{item.metric}:</b> {item.value} <Typography component="span" variant="caption" color="textSecondary">({item.note})</Typography></>
                                : <Typography component="span" variant="caption" color="textSecondary" sx={{fontStyle:'italic'}}>{item.note}</Typography>;

                            return (
                                <ListItem key={`improve-${step.step_id}-${index}`} sx={{p:0, pb: 0.2, alignItems: 'flex-start'}}>
                                <ListItemIcon sx={{minWidth: 20, mt: 0.4, mr: 0.5}}><IconComponent sx={{fontSize: '1rem'}} color={iconColor} /></ListItemIcon>
                                <ListItemText 
                                    primaryTypographyProps={{variant:'caption', color: 'text.primary', sx:{lineHeight: 1.35}}} 
                                    primary={primaryText} 
                                />
                                </ListItem>
                            );
                        })}
                        </List>
                    </Box>
                  )}
                </Box>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Container>
  );
}

export default StepComparison;