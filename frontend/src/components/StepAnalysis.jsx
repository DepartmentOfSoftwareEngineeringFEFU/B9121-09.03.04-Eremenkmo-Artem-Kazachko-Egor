import React from "react";
import { useParams } from "react-router-dom";
import { Container, Typography, Paper, Box } from "@mui/material";

function StepAnalysis() {
  const { stepId } = useParams(); // Получаем stepId из URL

  // Mock-данные для примера (заменить на реальные данные с API)
  const mockStepData = {
    step_id: stepId,
    name: `Шаг ${stepId}`,
    strong_points: "Отличная вовлеченность пользователей",
    weak_points: "Низкий процент успешных решений с первой попытки",
    recommendations:
      "Предложить пользователям больше подсказок и упростить задание.",
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Анализ шага {mockStepData.name} (ID: {mockStepData.step_id})
      </Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Сильные стороны
        </Typography>
        <Typography paragraph>{mockStepData.strong_points}</Typography>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Слабые стороны
        </Typography>
        <Typography paragraph>{mockStepData.weak_points}</Typography>
      </Paper>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Рекомендации
        </Typography>
        <Typography paragraph>{mockStepData.recommendations}</Typography>
      </Paper>
    </Container>
  );
}

export default StepAnalysis;
