// src/components/BreadcrumbsNav.jsx
import React, { useState, useEffect } from "react";
import { Link as RouterLink, useLocation } from "react-router-dom";

import { Breadcrumbs, Link as MuiLink, Typography, Box } from "@mui/material";

const getCourseNameFromStorage = (decodedCourseId) => {
  if (!decodedCourseId) return null;
  try {
    const storedCourses = localStorage.getItem("uploadedCourses");
    const courses = storedCourses ? JSON.parse(storedCourses) : [];

    const currentCourse = courses.find((course) => {
      try {
        return decodeURIComponent(course.id) === decodedCourseId;
      } catch (e) {
        console.error(
          `Ошибка декодирования ID "${course.id}" из localStorage:`,
          e
        );
        return false;
      }
    });
    return currentCourse ? currentCourse.name : null;
  } catch (e) {
    console.error("Ошибка чтения localStorage для хлебных крошек:", e);
    return null;
  }
};

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
    return currentCourse ? currentCourse.id : null;
  } catch (e) {
    console.error("Ошибка при поиске закодированного ID:", e);
    return null;
  }
};

function BreadcrumbsNav() {
  const location = useLocation();
  const [currentCourseName, setCurrentCourseName] = useState("");

  const [courseIdDecoded, setCourseIdDecoded] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const decodedId = params.get("courseId");
    setCourseIdDecoded(decodedId || "");

    if (decodedId) {
      const name = getCourseNameFromStorage(decodedId);
      setCurrentCourseName(name || "");
    } else {
      setCurrentCourseName("");
    }
  }, [location.search]);

  const generateBreadcrumbs = () => {
    const pathnames = location.pathname.split("/").filter((x) => x);
    const params = new URLSearchParams(location.search);

    const courseIdForLink = getEncodedCourseIdFromStorage(courseIdDecoded);

    let items = [];

    if (location.pathname !== "/") {
      items.push({
        name: "Курсы",
        path: "/upload",
        isLast: location.pathname === "/upload",
      });
    } else {
      return [];
    }

    if (courseIdForLink && location.pathname !== "/upload") {
      const dashboardPath = `/dashboard?courseId=${courseIdForLink}`;

      const courseNameDisplay = currentCourseName || "Дашборд курса";
      const isDashboardPage = pathnames[0] === "dashboard";

      items.push({
        name: courseNameDisplay,
        path: dashboardPath,

        isLast: isDashboardPage,
      });
    }

    if (pathnames[0] === "step" && pathnames[1] && courseIdForLink) {
      const stepId = pathnames[1];
      const stepPath = `/step/${stepId}?courseId=${courseIdForLink}`;
      items.push({
        name: `Анализ шага ${stepId}`,
        path: stepPath,
        isLast: true,
      });
    }

    if (pathnames[0] === "compare" && courseIdForLink) {
      const steps = params.get("steps");
      const comparePath = `/compare?courseId=${courseIdForLink}&steps=${
        steps || ""
      }`;
      items.push({
        name: "Сравнение шагов",
        path: comparePath,
        isLast: true,
      });
    }

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
