// src/components/Recommendations.js
import React from "react";
import {
  Paper,
  Typography,
  List,
  ListItem,
  ListItemText,
  Alert,
  Box,
  Divider,
} from "@mui/material";

// Объект с рекомендациями для каждого courseId

const courseSpecificRecommendations = {
  63054: {
    general: [
      "Студенты показывают хороший уровень вовлеченности в начале, но наблюдается спад активности к середине курса. Рассмотрите возможность добавления интерактивного элемента или проектной работы в модуле 3.",
      "Время, затрачиваемое на теоретические шаги в модуле 2, выше среднего. Возможно, материал слишком плотный или требует дополнительных пояснений.",
    ],
    metricsFocus: [
      {
        metric: "Шаг 1037221 (текст)",
        suggestion:
          "Низкий 'Индекс вовлеченности'. Возможно, стоит добавить практический пример или задание после этого текстового блока для лучшего усвоения.",
      },
      {
        metric: "Модуль 112676 в целом",
        suggestion:
          "Проанализируйте шаги с высокой 'Долей пропуска шага', возможно, они не воспринимаются как обязательные или слишком сложны без достаточной мотивации.",
      },
    ],
    strengths: [
      "Высокая успешность выполнения практических заданий с автопроверкой.",
      "Активное обсуждение в комментариях к сложным задачам, что способствует взаимопомощи.",
    ],
  },
  99786: {
    general: [
      "Общий процент завершения курса выше среднего, что является отличным показателем!",
      "Рекомендуется обновить данные в примерах, используемых в практических заданиях, на более актуальные.",
    ],
    metricsFocus: [
      {
        metric: "Шаг 2244231 (SQL)",
        suggestion:
          "Высокий 'avg_attempts_per_passed'. Проверьте, нет ли неоднозначности в условии задачи или слишком строгих тестов.",
      },
      {
        metric: "Шаг 2244277 (Тест)",
        suggestion:
          "Низкая дискриминативность. Вопросы могут быть либо слишком простыми для всех, либо запутанными, не отражающими реальные знания.",
      },
    ],
    strengths: [
      "Студенты высоко оценивают структуру курса и логику изложения материала.",
      "Практические задания на SQL хорошо вовлекают аудиторию.",
    ],
  },
  122310: {
    general: [
      "Курс имеет хороший потенциал, но требует доработки в части интерактивности.",
      "Рассмотрите возможность проведения вебинаров с разбором сложных тем или ответами на вопросы.",
      "Добавьте больше ссылок на внешние ресурсы для углубленного изучения.",
    ],
    metricsFocus: [],
    strengths: [
      "Начальные модули хорошо структурированы и понятны для новичков.",
    ],
  },
  // Добавь сюда другие ID и их рекомендации, если они появятся
};

function Recommendations({ courseId, courseTitleFromUpload }) {
  const numericCourseId = parseInt(courseId, 10);
  const recommendationsContent = courseSpecificRecommendations[numericCourseId];

  let displayTitle;
  if (courseTitleFromUpload) {
    displayTitle = `Рекомендации для анализа: "${courseTitleFromUpload}"`;
  } else if (courseId && !isNaN(numericCourseId)) {
    displayTitle = `Рекомендации для курса ID: ${numericCourseId}`;
  } else {
    displayTitle = "Рекомендации";
  }

  if (!courseId || isNaN(numericCourseId) || !recommendationsContent) {
    let alertMessageDetail = "";
    if (courseId && !isNaN(numericCourseId)) {
      if (courseTitleFromUpload) {
        alertMessageDetail = ` Специфические рекомендации для анализа "${courseTitleFromUpload}" (связан с курсом ID ${numericCourseId}) не подготовлены.`;
      } else {
        alertMessageDetail = ` Специфические рекомендации для курса ID ${numericCourseId} не подготовлены.`;
      }
    } else {
      alertMessageDetail = ` Выберите или добавьте анализ курса для получения специфических рекомендаций.`;
    }

    return (
      <Paper sx={{ p: 2, mt: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Рекомендации
        </Typography>
        <Alert severity="info" variant="outlined">
          Это общие рекомендации: регулярно анализируйте метрики вовлеченности,
          результативности и качества заданий. Своевременно реагируйте на
          проблемные зоны.
          {alertMessageDetail}
        </Alert>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, mt: 2, mb: 3 }}>
      <Typography variant="h5" component="h2" gutterBottom color="primary">
        {displayTitle}
      </Typography>
      {}
      {courseTitleFromUpload && courseId && !isNaN(numericCourseId) && (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: 1.5, mt: -1 }}
        >
          (Данные для курса с ID: {numericCourseId})
        </Typography>
      )}
      <Divider sx={{ mb: 2 }} />

      {recommendationsContent.strengths &&
        recommendationsContent.strengths.length > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: "medium", color: "success.dark" }}
              gutterBottom
            >
              Сильные стороны курса:
            </Typography>
            <List dense disablePadding>
              {recommendationsContent.strengths.map((strength, index) => (
                <ListItem key={`strength-${index}`} sx={{ pt: 0, pb: 0.5 }}>
                  <ListItemText primary={`✅ ${strength}`} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

      {recommendationsContent.general &&
        recommendationsContent.general.length > 0 && (
          <Box sx={{ mb: 2.5 }}>
            <Typography
              variant="h6"
              sx={{ fontWeight: "medium", color: "text.primary" }}
              gutterBottom
            >
              Общие предложения по улучшению:
            </Typography>
            <List dense disablePadding>
              {recommendationsContent.general.map((rec, index) => (
                <ListItem key={`gen-${index}`} sx={{ pt: 0, pb: 0.5 }}>
                  <ListItemText primary={`➡️ ${rec}`} />
                </ListItem>
              ))}
            </List>
          </Box>
        )}

      {recommendationsContent.metricsFocus &&
        recommendationsContent.metricsFocus.length > 0 && (
          <Box>
            <Typography
              variant="h6"
              sx={{ fontWeight: "medium", color: "warning.dark" }}
              gutterBottom
            >
              Точки роста (на основе метрик):
            </Typography>
            <List dense disablePadding>
              {recommendationsContent.metricsFocus.map((focus, index) => (
                <ListItem
                  key={`focus-${index}`}
                  sx={{ pt: 0, pb: 0.5, display: "block" }}
                >
                  <Typography component="div" variant="body1">
                    <Box component="span" sx={{ fontWeight: "bold" }}>
                      🎯 {focus.metric}:
                    </Box>
                    <Typography
                      variant="body2"
                      component="span"
                      sx={{ display: "block", pl: 2.5 }}
                    >
                      ↳ {focus.suggestion}
                    </Typography>
                  </Typography>
                </ListItem>
              ))}
            </List>
          </Box>
        )}

      {(!recommendationsContent.general ||
        recommendationsContent.general.length === 0) &&
        (!recommendationsContent.metricsFocus ||
          recommendationsContent.metricsFocus.length === 0) &&
        (!recommendationsContent.strengths ||
          recommendationsContent.strengths.length === 0) && (
          <Typography sx={{ fontStyle: "italic", mt: 1 }}>
            Для этого курса пока нет специфических письменных рекомендаций.
          </Typography>
        )}
    </Paper>
  );
}

export default Recommendations;
