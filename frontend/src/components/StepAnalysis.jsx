import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Container, Typography, Paper, Box, Button } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";

function StepAnalysis() {
  const { stepId } = useParams(); // Получаем stepId из URL
  const navigate = useNavigate();
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
          Анализ шага: {mockStepData.name} 
        </Typography>
      </Box>
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
