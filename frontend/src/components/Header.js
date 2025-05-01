import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { styled } from "@mui/system";

// Стилизованный компонент для AppBar
const StyledAppBar = styled(AppBar)(({ theme }) => ({
  backgroundColor: "#171718", // Устанавливаем нужный цвет
  height: "8vh",
}));

// Стилизованный компонент для Button
const StyledButton = styled(Button)(({ theme }) => ({
  color: "inherit", // Наследуем цвет от родителя
  "&:hover": {
    textDecoration: "none", // Убираем стандартное подчеркивание
    borderBottom: "3px solid #5c62ec", // Добавляем border-bottom
  },
}));

function Header() {
  return (
    <StyledAppBar position="static">
      <Toolbar>
        {/* Оборачиваем логотип в RouterLink */}
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          <RouterLink
            to="/"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {" "}
            {/* Стили для ссылки */}
            Course
            <Typography variant="h6" component="span" sx={{ color: "#5c62ec" }}>
              Analytics
            </Typography>
          </RouterLink>
        </Typography>

        {/* Навигационные кнопки */}
        <Box>
          {/* ... кнопки ... */}
          <StyledButton color="inherit" component={RouterLink} to="/">
            Главная
          </StyledButton>
          <StyledButton color="inherit" component={RouterLink} to="/upload">
            Курсы
          </StyledButton>
          
          <StyledButton color="inherit" >
            Регистрация
          </StyledButton>
        </Box>
      </Toolbar>
    </StyledAppBar>
  );
}

export default Header;
