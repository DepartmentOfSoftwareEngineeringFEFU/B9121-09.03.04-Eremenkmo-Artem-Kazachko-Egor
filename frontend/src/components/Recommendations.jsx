import React from "react";
import { Paper, Typography } from "@mui/material";

function Recommendations() {
  // В будущем здесь будет логика генерации рекомендаций
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Рекомендации
      </Typography>
      <Typography paragraph>
        Здесь будут отображаться рекомендации по улучшению курса на основе
        анализа метрик.
      </Typography>
      <ul>
        <li>
          {" "}
          Шаг "X" имеет низкий показатель завершения. Возможно, стоит упростить
          задание или добавить подсказки.
        </li>
        <li>
          {" "}
          На шаге "Y" много комментариев с вопросами. Рассмотрите возможность
          добавления дополнительного объяснения.
        </li>
      </ul>
    </Paper>
  );
}

export default Recommendations;
