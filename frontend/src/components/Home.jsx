// frontend/src/components/Home.jsx
import React from "react";
import { Typography, Container, Box, Button } from "@mui/material";
import { styled } from "@mui/system";
import AnimatedBackground from "./AnimatedBackground";
import AnimatedLinesBackground from './AnimatedLinesBackground'; // Импортируем 
const StyledButton = styled(Button)(({ theme }) => ({
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.common.white,
  "&:hover": {
    backgroundColor: theme.palette.primary.dark,
  },
}));

function Home() {
  return (
    <Box // Заменяем React.Fragment на Box
      sx={{
        width: "100%", // Занимает всю ширину экрана
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        height: "92vh",
      }}
    >
      {/* Контент на сером фоне */}
      <Box
        sx={{
          backgroundColor: "#171718",
          width: "100%", // Важно!
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "5rem",
          flexGrow: 1,
          textAlign: "center", // Выравниваем текст по центру
        }}
      >
        <AnimatedLinesBackground /> {/* Добавляем AnimatedLinesBackground */}
        <Typography
          variant="h3"
          gutterBottom
          sx={{ mt: 4, fontWeight: "bold", color: "#fff", zIndex: "2" }}
        >
          Аналитика{" "}
          <Typography
            variant="h3"
            component="span"
            sx={{ mt: 4, fontWeight: "bold", color: "#5c62ec", zIndex: "2" }}
          >
            онлайн-курсов
          </Typography>
        </Typography>
        <Typography paragraph variant="h4" sx={{ color: "#fff", zIndex: "2" }}>
          Этот сайт предоставляет инструменты для анализа данных онлайн-курсов.
        </Typography>
        <Typography paragraph variant="h5" sx={{ color: "#fff", zIndex: "2" }}>
          Загрузите CSV файлы с данными вашего курса (перейдите на вкладку
          "Загрузить" в шапке сайта),
        </Typography>
        <Typography paragraph variant="h6" sx={{ color: "#fff", zIndex: "2" }}>
          и мы предоставим вам подробную аналитику метрик, визуализации и
          рекомендации по улучшению.
        </Typography>
        <Box sx={{ mt: 4 }}>
          <StyledButton
            variant="contained"
            component="a"
            href="/upload"
            sx={{ backgroundColor: "#5c62ec" }}
          >
            Загрузить данные
          </StyledButton>
        </Box>
      </Box>

      {/* Контент на белом фоне */}
      <Box
        sx={{
          textAlign: "center",

          backgroundColor: "#5c62ec",
          width: "100%",

          display: "flex",
          flexDirection: "column",
          paddingBottom: "20px",
          alignItems: "center",
        }}
      >
        <Typography variant="body2" color="#fff" sx={{ mt: 3 }}>
          © {new Date().getFullYear()} Course Analytics
        </Typography>
      </Box>
    </Box>
  );
}

export default Home;
