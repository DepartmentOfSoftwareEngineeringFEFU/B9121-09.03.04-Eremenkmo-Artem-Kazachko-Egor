import React, { useState, useEffect } from "react";
import { useNavigate, Link as RouterLink } from "react-router-dom";
import {
  Button,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Grid,
  Paper,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  TextField,
  IconButton, // Добавляем IconButton
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete"; // Добавляем иконку удаления
import { csvExamples } from "./UploadCourseExamples"; // Убедитесь, что этот файл существует и экспортирует csvExamples

const requiredFileTypes = ["learners", "structure", "submissions", "comments"];

function UploadCourse() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false); // Для диалога примеров
  const [dialogData, setDialogData] = useState({
    title: "",
    headers: [],
    rows: [],
  }); // Для диалога примеров
  const [selectedFiles, setSelectedFiles] = useState(
    requiredFileTypes.reduce((acc, type) => {
      acc[type] = null;
      return acc;
    }, {})
  );
  const [error, setError] = useState(null);
  const [uploadedCourses, setUploadedCourses] = useState(() => {
    // Получаем из localStorage при инициализации
    const storedCourses = localStorage.getItem("uploadedCourses");
    try {
      // Добавляем проверку на валидность JSON
      return storedCourses ? JSON.parse(storedCourses) : [];
    } catch (e) {
      console.error("Ошибка парсинга localStorage['uploadedCourses']:", e);
      localStorage.removeItem("uploadedCourses"); // Очищаем невалидные данные
      return [];
    }
  });

  // --- Состояния для модального окна названия курса ---
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [modalCourseName, setModalCourseName] = useState("");
  const [modalError, setModalError] = useState(null);
  // --- Конец состояний ---

  // --- Состояния для диалога подтверждения удаления ---
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null); // Храним ID и имя курса для удаления
  // --- Конец состояний ---

  // Сохраняем в localStorage при изменении uploadedCourses
  useEffect(() => {
    try {
      localStorage.setItem("uploadedCourses", JSON.stringify(uploadedCourses));
    } catch (e) {
      console.error("Ошибка сохранения в localStorage:", e);
      setError(
        "Не удалось сохранить список курсов. Возможно, хранилище переполнено."
      );
    }
  }, [uploadedCourses]);

  // Открываем модальное окно при выборе всех файлов
  useEffect(() => {
    const allFilesSelected = requiredFileTypes.every(
      (type) => selectedFiles[type]
    );
    // Открываем модалку только если все файлы выбраны И она еще не открыта
    if (allFilesSelected && !isNameModalOpen) {
      setError(null); // Сбрасываем предыдущие ошибки при готовности
      setIsNameModalOpen(true);
    }
  }, [selectedFiles, isNameModalOpen]);

  // --- Обработчики ---
  const handleFileChange = (event, fileType) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFiles((prev) => ({ ...prev, [fileType]: file }));
      setError(null); // Сбрасываем общую ошибку
    }
    event.target.value = null; // Позволяет выбрать тот же файл снова
  };

  const handleShowExample = (fileType) => {
    if (csvExamples[fileType]) {
      setDialogData(csvExamples[fileType]);
      setDialogOpen(true);
    }
  };

  const handleCloseDialog = () => setDialogOpen(false);

  const handleModalCourseNameChange = (event) => {
    setModalCourseName(event.target.value);
    if (modalError) setModalError(null); // Сбрасываем ошибку при вводе
  };

  const handleCloseNameModal = () => {
    setIsNameModalOpen(false);
    setModalCourseName(""); // Очищаем поле
    setModalError(null); // Очищаем ошибку
    // Сбрасываем выбранные файлы при отмене, чтобы модалка не открылась снова
    setSelectedFiles(
      requiredFileTypes.reduce((acc, type) => {
        acc[type] = null;
        return acc;
      }, {})
    );
  };

  const handleSaveCourse = async () => {
    const trimmedName = modalCourseName.trim();
    if (!trimmedName) {
      setModalError("Пожалуйста, введите название курса.");
      return;
    }

    const courseName = trimmedName;
    // Генерируем ID здесь, чтобы он был доступен для сохранения и ссылки
    const courseId = `${encodeURIComponent(courseName)}-${Date.now()}`;
    setModalError(null);
    setIsNameModalOpen(false); // Закрываем модальное окно до "загрузки"

    console.log("Выбранные файлы для сохранения:", selectedFiles);
    console.log("Название курса:", courseName);
    console.log("ID курса:", courseId); // Логгируем ID

    try {
      // --- Здесь будет логика отправки на бэкенд ---
      const formData = new FormData();
      requiredFileTypes.forEach((type) => {
        formData.append(type, selectedFiles[type], selectedFiles[type].name);
      });
      formData.append("courseName", courseName);
      formData.append("courseId", courseId); // Отправляем и ID на бэкенд (если нужно)

      console.log("Имитация отправки данных на backend...");
      // const response = await fetch('/api/upload', { method: 'POST', body: formData });
      // if (!response.ok) { throw new Error(`Ошибка сервера: ${response.statusText}`) }
      // const result = await response.json();
      // const backendCourseId = result.courseId; // ID может прийти от бэкенда
      // --- Конец логики отправки ---

      await new Promise((resolve) => setTimeout(resolve, 500)); // Имитация задержки сети

      const newCourse = {
        id: courseId, // Сохраняем сгенерированный (или полученный от бэкенда) ID
        name: courseName,
        date: new Date().toLocaleDateString("ru-RU"), // Формат даты
        dashboardLink: `/dashboard?courseId=${courseId}`, // Используем ID в ссылке
      };

      // Обновляем состояние и localStorage
      setUploadedCourses((prevCourses) => [...prevCourses, newCourse]);

      // Очищаем состояния
      setModalCourseName("");
      setSelectedFiles(
        requiredFileTypes.reduce((acc, type) => {
          acc[type] = null;
          return acc;
        }, {})
      );

      console.log("Переход на дашборд:", newCourse.dashboardLink);
      navigate(newCourse.dashboardLink); // Переходим на дашборд
    } catch (err) {
      console.error("Ошибка при сохранении курса:", err);
      setError(`Ошибка сохранения: ${err.message}`);
      // Не сбрасываем файлы здесь, чтобы пользователь мог попробовать сохранить снова
      setIsNameModalOpen(true); // Открываем модалку снова при ошибке сохранения
    }
  };

  const openDeleteDialog = (course) => {
    setCourseToDelete(course); // Сохраняем весь объект курса
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setCourseToDelete(null); // Сбрасываем курс для удаления
  };

  const confirmDeleteCourse = () => {
    if (courseToDelete) {
      console.log("Удаление курса с ID:", courseToDelete.id);
      setUploadedCourses((prevCourses) =>
        prevCourses.filter((course) => course.id !== courseToDelete.id)
      );
      // Данные автоматически сохранятся в localStorage благодаря useEffect
    }
    closeDeleteDialog(); // Закрываем диалог после удаления
  };
  // --- Конец обработчиков ---

  return (
    <Box sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        Загрузка данных курса
      </Typography>
      <Typography paragraph align="center" sx={{ mb: 4 }}>
        Пожалуйста, загрузите 4 CSV файла с данными вашего курса.
      </Typography>

      {/* Компоновка для загрузки файлов */}
      <Grid container spacing={4} justifyContent="center">
        {requiredFileTypes.map((fileType) => (
          <Grid item xs={12} sm={6} md={3} key={fileType}>
            <Paper
              elevation={3}
              sx={{ p: 3, textAlign: "center", height: "100%" }}
            >
              <Typography variant="h6" gutterBottom>
                {fileType.charAt(0).toUpperCase() + fileType.slice(1)} Data
              </Typography>
              <Typography variant="body2" color="textSecondary" gutterBottom>
                ({fileType}.csv)
              </Typography>
              {/* Кнопки Пример / Выбрать файл */}
              <Box
                sx={{
                  mt: 2,
                  mb: 2,
                  display: "flex",
                  justifyContent: "space-around",
                  alignItems: "center",
                }}
              >
                <Button
                  variant="text"
                  size="small"
                  startIcon={<VisibilityIcon />}
                  onClick={() => handleShowExample(fileType)}
                >
                  Пример
                </Button>
                <Button
                  variant="contained"
                  component="label"
                  startIcon={<UploadFileIcon />}
                  size="small"
                >
                  Выбрать файл
                  <input
                    type="file"
                    accept=".csv"
                    hidden
                    onChange={(e) => handleFileChange(e, fileType)}
                  />
                </Button>
              </Box>
              {/* Отображение выбранного файла */}
              {selectedFiles[fileType] ? (
                <Chip
                  label={selectedFiles[fileType].name}
                  onDelete={() =>
                    setSelectedFiles((prev) => ({ ...prev, [fileType]: null }))
                  }
                  color="primary"
                  variant="outlined"
                  size="small"
                  sx={{
                    mt: 1,
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                />
              ) : (
                // Placeholder для выравнивания высоты
                <Box sx={{ height: "31px", mt: 1 }} />
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Отображение общей ошибки */}
      {error && (
        <Alert
          severity="error"
          sx={{ mt: 3, width: "fit-content", margin: "24px auto 0" }}
        >
          {error}
        </Alert>
      )}

      {/* Список загруженных курсов */}
      <Typography variant="h6" gutterBottom sx={{ mt: 5, mb: 2 }}>
        Загруженные курсы:
      </Typography>
      {uploadedCourses.length > 0 ? (
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }} aria-label="saved courses table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>
                  Название курса
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="right">
                  Дата загрузки
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="center">
                  Дашборд
                </TableCell>
                <TableCell sx={{ fontWeight: "bold" }} align="center">
                  Удалить
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {uploadedCourses.map((course) => (
                <TableRow
                  hover // Добавляем эффект при наведении
                  key={course.id} // Используем уникальный ID как ключ
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    {course.name}
                  </TableCell>
                  <TableCell align="right">{course.date}</TableCell>
                  <TableCell align="center">
                    {" "}
                    {/* Центрируем кнопку */}
                    <Button
                      size="small"
                      component={RouterLink}
                      to={course.dashboardLink}
                    >
                      Перейти
                    </Button>
                  </TableCell>
                  <TableCell align="center">
                    {" "}
                    {/* Центрируем кнопку */}
                    <IconButton
                      aria-label={`Удалить курс ${course.name}`}
                      size="small"
                      onClick={() => openDeleteDialog(course)} // Открываем диалог удаления
                      color="error" // Делаем кнопку красной для наглядности
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography
          sx={{ textAlign: "center", color: "text.secondary", mt: 2 }}
        >
          Вы еще не загружали курсы.
        </Typography>
      )}

      {/* Модальное окно для ввода названия курса */}
      <Dialog
        open={isNameModalOpen}
        onClose={handleCloseNameModal}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Введите название курса</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="course-name-modal" // Добавляем id для ясности
            label="Название курса"
            type="text"
            fullWidth
            variant="outlined" // Используем Outlined для консистентности
            value={modalCourseName}
            onChange={handleModalCourseNameChange}
            error={!!modalError}
            helperText={modalError}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ padding: "16px 24px" }}>
          <Button onClick={handleCloseNameModal} color="inherit">
            Отмена
          </Button>
          <Button
            onClick={handleSaveCourse}
            variant="contained"
            color="primary"
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалоговое окно для показа примера */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{dialogData.title}</DialogTitle>
        <DialogContent dividers>
          {/* Код отображения примера CSV */}
          {dialogData.headers.length > 0 ? (
            <TableContainer component={Paper}>
              <Table size="small" aria-label="example table">
                <TableHead>
                  <TableRow>
                    {dialogData.headers.map((header, index) => (
                      <TableCell key={index} sx={{ fontWeight: "bold" }}>
                        {header}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dialogData.rows.map((row, rowIndex) => (
                    <TableRow key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <TableCell key={cellIndex}>{cell}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography>Нет данных для отображения.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Закрыть</Button>
        </DialogActions>
      </Dialog>

      {/* Диалог подтверждения удаления */}
      <Dialog
        open={isDeleteDialogOpen}
        onClose={closeDeleteDialog}
        aria-labelledby="delete-confirm-dialog-title"
        aria-describedby="delete-confirm-dialog-description"
      >
        <DialogTitle id="delete-confirm-dialog-title">
          {"Подтверждение удаления"}
        </DialogTitle>
        <DialogContent>
          <Typography id="delete-confirm-dialog-description">
            Вы уверены, что хотите удалить курс "{courseToDelete?.name}"? Это
            действие необратимо.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ padding: "16px 24px" }}>
          <Button onClick={closeDeleteDialog} color="inherit">
            Отмена
          </Button>
          <Button
            onClick={confirmDeleteCourse}
            color="error"
            variant="contained"
            autoFocus
          >
            Удалить
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default UploadCourse;
