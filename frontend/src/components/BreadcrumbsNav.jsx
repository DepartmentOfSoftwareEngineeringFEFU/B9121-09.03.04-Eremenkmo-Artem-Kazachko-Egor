// src/components/BreadcrumbsNav.jsx
import React, { useState, useEffect } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";
// Убираем Container, импортируем Box
import { Breadcrumbs, Link as MuiLink, Typography, Box } from "@mui/material";

// Функция для получения имени курса из localStorage по ДЕКОДИРОВАННОМУ ID
const getCourseNameFromStorage = (decodedCourseId) => {
  if (!decodedCourseId) return null;
  try {
    const storedCourses = localStorage.getItem("uploadedCourses");
    const courses = storedCourses ? JSON.parse(storedCourses) : [];
    // Ищем курс, сравнивая переданный ДЕКОДИРОВАННЫЙ ID с ДЕКОДИРОВАННЫМ ID из localStorage
    const currentCourse = courses.find((course) => {
      try {
        // Декодируем ID из localStorage перед сравнением
        return decodeURIComponent(course.id) === decodedCourseId;
      } catch (e) {
        console.error(
          `Ошибка декодирования ID "${course.id}" из localStorage:`,
          e
        );
        return false; // Пропускаем курс с некорректным ID
      }
    });
    return currentCourse ? currentCourse.name : null;
  } catch (e) {
    console.error("Ошибка чтения localStorage для хлебных крошек:", e);
    return null;
  }
};

// Функция для получения ЗАКОДИРОВАННОГО ID курса из localStorage по ДЕКОДИРОВАННОМУ ID
const getEncodedCourseIdFromStorage = (decodedCourseId) => {
  if (!decodedCourseId) return null;
  try {
    const storedCourses = localStorage.getItem("uploadedCourses");
    const courses = storedCourses ? JSON.parse(storedCourses) : [];
    const currentCourse = courses.find((course) => {
      try {
        return decodeURIComponent(course.id) === decodedCourseId;
      } catch {
        return false;
      }
    });
    return currentCourse ? currentCourse.id : null; // Возвращаем закодированный ID
  } catch (e) {
    console.error("Ошибка при поиске закодированного ID:", e);
    return null;
  }
};

function BreadcrumbsNav() {
  const location = useLocation();
  const [currentCourseName, setCurrentCourseName] = useState("");
  // Сохраняем декодированный ID из URL для поиска
  const [courseIdDecoded, setCourseIdDecoded] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const decodedId = params.get("courseId"); // Получаем декодированный ID
    setCourseIdDecoded(decodedId || ""); // Сохраняем его

    if (decodedId) {
      const name = getCourseNameFromStorage(decodedId);
      setCurrentCourseName(name || ""); // Устанавливаем имя
    } else {
      setCurrentCourseName(""); // Сбрасываем, если ID нет
    }
  }, [location.search]); // Зависим от параметров поиска

  const generateBreadcrumbs = () => {
    const pathnames = location.pathname.split("/").filter((x) => x);
    const params = new URLSearchParams(location.search);
    // Получаем актуальный закодированный ID для ссылок (может быть null)
    const courseIdForLink = getEncodedCourseIdFromStorage(courseIdDecoded);

    let items = [];

    // 1. Базовый элемент "Курсы"
    if (location.pathname !== "/") {
      items.push({
        name: "Курсы",
        path: "/upload",
        isLast: location.pathname === "/upload",
      });
    } else {
      return []; // На главной крошек нет
    }

    // 2. Дашборд (если есть ID и мы не на /upload)
    if (courseIdForLink && location.pathname !== "/upload") {
      const dashboardPath = `/dashboard?courseId=${courseIdForLink}`;
      // Используем имя из state. Если его нет, но ID есть, покажем запасной вариант.
      const courseNameDisplay = currentCourseName || "Дашборд курса";
      const isDashboardPage = pathnames[0] === "dashboard";

      items.push({
        name: courseNameDisplay,
        path: dashboardPath,
        // Дашборд - последний, только если мы на странице дашборда
        isLast: isDashboardPage,
      });
    }

    // 3. Анализ шага (если мы на странице шага)
    if (pathnames[0] === "step" && pathnames[1] && courseIdForLink) {
      const stepId = pathnames[1];
      const stepPath = `/step/${stepId}?courseId=${courseIdForLink}`;
      items.push({
        name: `Анализ шага ${stepId}`,
        path: stepPath,
        isLast: true, // Страница шага всегда последняя в этой ветке
      });
    }

    // 4. Сравнение шагов (если мы на странице сравнения)
    if (pathnames[0] === "compare" && courseIdForLink) {
      const steps = params.get("steps");
      const comparePath = `/compare?courseId=${courseIdForLink}&steps=${
        steps || ""
      }`;
      items.push({
        name: "Сравнение шагов",
        path: comparePath,
        isLast: true, // Страница сравнения всегда последняя в этой ветке
      });
    }

    // Переопределяем isLast для последнего элемента массива
    // Это нужно, чтобы корректно обработать случаи, когда добавляется несколько элементов
    items.forEach((item, index) => {
      item.isLast = index === items.length - 1;
    });

    return items;
  };

  const breadcrumbLinks = generateBreadcrumbs();

  if (breadcrumbLinks.length === 0) {
    return null;
  }

  return (
    // Используем Box вместо Container
    // pl/pr: theme.spacing(3) дает отступ 24px, как у стандартного Container lg
    // Настройте pl/pr по вашему усмотрению для позиционирования
    <Box sx={{ width: "100%", pl: 3, pr: 3, mt: 2, mb: 1 }}>
      <Breadcrumbs aria-label="breadcrumb">
        {breadcrumbLinks.map((link) =>
          link.isLast ? (
            <Typography key={link.path} color="text.primary">
              {link.name}
            </Typography>
          ) : (
            <MuiLink
              key={link.path}
              component={RouterLink}
              to={link.path}
              underline="hover"
              color="inherit"
            >
              {link.name}
            </MuiLink>
          )
        )}
      </Breadcrumbs>
    </Box>
  );
}

export default BreadcrumbsNav;
