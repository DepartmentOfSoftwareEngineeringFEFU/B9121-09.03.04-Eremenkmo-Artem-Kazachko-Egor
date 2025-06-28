// src/components/Dashboard/GlobalCourseMetrics.js
import React from 'react';
import { Grid, Paper, Typography, Alert } from '@mui/material';


const formatPercentage = (value) => {
    if (value === null || typeof value !== 'number' || !isFinite(value)) return "N/A";
    if (value > 1 && value <= 100) { // Если уже передано как 0-100
        return `${value.toFixed(1)}%`;
    }
    if (value >= 0 && value <= 1) { // Если передано как 0.0-1.0
        return `${(value * 100).toFixed(1)}%`;
    }
    return `${value.toFixed(1)}%`; // Общий случай, если формат другой
};


function GlobalCourseMetrics({ globalMetricsState, isLoading }) {
  if (isLoading) {

    return null; 
  }

  if (!globalMetricsState || globalMetricsState.error || !globalMetricsState.ranges) {
    let errorMessage = "Данные о результативности курса не загружены или отсутствуют.";
    if (globalMetricsState?.details) {
      errorMessage = `Не удалось загрузить глобальные метрики: ${globalMetricsState.details}`;
    } else if (globalMetricsState?.error) {
      errorMessage = `Ошибка при загрузке глобальных метрик: ${globalMetricsState.error}`;
    }
    return (
      <Alert severity="warning" sx={{ mb: 3 }}>
        {errorMessage}
      </Alert>
    );
  }

  const { ranges, total_learners_on_course } = globalMetricsState;

  // Если ranges пустой или не объект
  if (!ranges || typeof ranges !== 'object' || Object.keys(ranges).length === 0) {
      return (
          <Alert severity="info" sx={{ mb: 3 }}>
              Нет данных по диапазонам результативности для этого курса.
          </Alert>
      );
  }


  const rangeTitles = {
    gte_80: "Завершили (≥80%)",
    gte_50_lt_80: "Прогресс (50-79%)",
    gte_25_lt_50: "Начали (25-49%)",
    lt_25: "Низкий прогресс (<25%)",
  };

  return (
    <Grid container spacing={2} sx={{ mb: 3 }}>
      {Object.entries(ranges).map(([key, rangeData]) => {
        // Проверка, что rangeData существует и содержит нужные поля
        if (!rangeData || typeof rangeData.percentage !== 'number' || typeof rangeData.count !== 'number') {
          console.warn(`GlobalCourseMetrics: Некорректные данные для диапазона "${key}":`, rangeData);
          return (
            <Grid item xs={12} sm={6} md={3} key={key}>
              <Paper sx={{ p: 2, textAlign: 'center', height: '100%' }}>
                <Typography component="h2" variant="h6" color="primary" gutterBottom>
                  {rangeTitles[key] || key}
                </Typography>
                <Typography variant="body1" color="error">Данные недоступны</Typography>
              </Paper>
            </Grid>
          );
        }

        return (
          <Grid item xs={12} sm={6} md={3} key={key}>
            <Paper
              sx={{
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                height: '100%',
              }}
            >
              <Typography
                component="h2"
                variant="h6"
                color="primary"
                gutterBottom
                sx={{ textAlign: 'center' }}
              >
                {rangeTitles[key] || key}
              </Typography>
              <Typography component="p" variant="h4">
                {formatPercentage(rangeData.percentage)} 
              </Typography>
              <Typography variant="caption" color="textSecondary">
                ({rangeData.count} из {total_learners_on_course ?? '?'})
              </Typography>
            </Paper>
          </Grid>
        );
      })}
    </Grid>
  );
}

export default GlobalCourseMetrics;