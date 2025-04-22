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
  TextField, // Убедитесь, что TextField импортирован
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { csvExamples } from "./UploadCourseExamples";

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
    const storedCourses = localStorage.getItem("uploadedCourses");
    return storedCourses ? JSON.parse(storedCourses) : [];
  });

  // --- Новые состояния для модального окна названия курса ---
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [modalCourseName, setModalCourseName] = useState("");
  const [modalError, setModalError] = useState(null);
  // --- Конец новых состояний ---

  useEffect(() => {
    localStorage.setItem("uploadedCourses", JSON.stringify(uploadedCourses));
  }, [uploadedCourses]);

  // --- Эффект для открытия модального окна при выборе всех файлов ---
  useEffect(() => {
    const allFilesSelected = requiredFileTypes.every(
      (type) => selectedFiles[type]
    );
    if (allFilesSelected) {
      setIsNameModalOpen(true); // Открываем модальное окно
    }
  }, [selectedFiles]);
  // --- Конец эффекта ---

  const handleFileChange = (event, fileType) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFiles((prev) => ({ ...prev, [fileType]: file }));
      setError(null); // Сбрасываем общую ошибку
    }
    event.target.value = null;
  };

  const handleShowExample = (fileType) => {
    if (csvExamples[fileType]) {
      setDialogData(csvExamples[fileType]);
      setDialogOpen(true);
    }
  };

  const handleCloseDialog = () => setDialogOpen(false);

  // --- Обработчики для модального окна названия курса ---
  const handleModalCourseNameChange = (event) => {
    setModalCourseName(event.target.value);
    if (modalError) setModalError(null); // Сбрасываем ошибку при вводе
  };

  const handleCloseNameModal = () => {
    setIsNameModalOpen(false);
    setModalCourseName(""); // Очищаем поле
    setModalError(null); // Очищаем ошибку
    // Важно: Очищаем выбранные файлы при отмене, чтобы модалка не открылась снова сразу
    setSelectedFiles(
      requiredFileTypes.reduce((acc, type) => {
        acc[type] = null;
        return acc;
      }, {})
    );
  };

  const handleSaveCourse = async () => {
    if (!modalCourseName.trim()) {
      setModalError("Пожалуйста, введите название курса.");
      return;
    }

    const courseName = modalCourseName.trim();
    setModalError(null);
    setIsNameModalOpen(false); // Закрываем модальное окно

    console.log("Выбранные файлы для сохранения:", selectedFiles);
    console.log("Название курса:", courseName);

    try {
      const formData = new FormData();
      requiredFileTypes.forEach((type) => {
        formData.append(type, selectedFiles[type], selectedFiles[type].name);
      });
      // Добавляем название курса в formData, если нужно отправить на бэкенд
      formData.append("courseName", courseName);

      // --- Здесь будет логика отправки на бэкенд ---
      console.log("Отправка данных на backend...");
      // const response = await fetch('/api/upload', { method: 'POST', body: formData });
      // if (!response.ok) { throw new Error(...) }
      // const result = await response.json();
      // --- Конец логики отправки ---

      await new Promise((resolve) => setTimeout(resolve, 500)); // Имитация задержки сети

      const newCourse = {
        name: courseName,
        date: new Date().toLocaleDateString(),
        // В будущем ID курса может приходить от бэкенда
        dashboardLink: `/dashboard?courseId=${encodeURIComponent(
          courseName
        )}-${Date.now()}`, // Генерируем псевдо-уникальный ID
      };

      setUploadedCourses((prevCourses) => [...prevCourses, newCourse]);
      setModalCourseName(""); // Очищаем поле модалки
      setSelectedFiles(
        requiredFileTypes.reduce((acc, type) => {
          acc[type] = null;
          return acc;
        }, {})
      ); // Очищаем выбранные файлы

      console.log("Переход на дашборд...");
      navigate(newCourse.dashboardLink); // Переходим на дашборд
    } catch (err) {
      console.error("Ошибка при сохранении курса:", err);
      // Отображаем ошибку пользователю (можно использовать Alert или Snackbar)
      setError(`Ошибка сохранения: ${err.message}`);
      // Очищаем файлы при ошибке, чтобы можно было попробовать снова
      setSelectedFiles(
        requiredFileTypes.reduce((acc, type) => {
          acc[type] = null;
          return acc;
        }, {})
      );
    }
  };
  // --- Конец обработчиков модального окна ---

  return (
    <Box sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        Загрузка данных курса
      </Typography>
      <Typography paragraph align="center" sx={{ mb: 4 }}>
        Пожалуйста, загрузите 4 CSV файла с данными вашего курса.
      </Typography>

      {/* Убираем TextField для названия курса отсюда */}

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
                <Box sx={{ height: "31px", mt: 1 }} />
              )}
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* Общая ошибка (если возникнет при сохранении) */}
      {error && (
        <Alert
          severity="error"
          sx={{ mt: 3, width: "fit-content", margin: "24px auto 0" }}
        >
          {error}
        </Alert>
      )}

      {/* Убираем основную кнопку загрузки, так как действие происходит через модалку */}

      {/* Список загруженных курсов */}
      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
        Загруженные курсы:
      </Typography>
      {uploadedCourses.length > 0 ? (
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 650 }} aria-label="simple table">
            <TableHead>
              <TableRow>
                <TableCell>Название курса</TableCell>
                <TableCell align="right">Дата загрузки</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {uploadedCourses.map((course, index) => (
                <TableRow
                  key={index}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    {course.name}
                  </TableCell>
                  <TableCell align="right">{course.date}</TableCell>
                  <TableCell align="right">
                    <Button component={RouterLink} to={course.dashboardLink}>
                      Перейти на дашборд
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography>Нет загруженных курсов.</Typography>
      )}

      {/* --- Модальное окно для ввода названия курса --- */}
      <Dialog
        open={isNameModalOpen}
        onClose={handleCloseNameModal}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Введите название курса</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus // Фокус на поле при открытии
            margin="dense"
            id="course-name"
            label="Название курса"
            type="text"
            fullWidth
            variant="standard"
            value={modalCourseName}
            onChange={handleModalCourseNameChange}
            error={!!modalError} // Показываем ошибку, если она есть
            helperText={modalError} // Текст ошибки
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseNameModal}>Отмена</Button>
          <Button onClick={handleSaveCourse} variant="contained">
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>
      {/* --- Конец модального окна --- */}

      {/* Диалоговое окно для показа примера */}
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{dialogData.title}</DialogTitle>
        <DialogContent dividers>
          {dialogData.headers.length > 0 ? (
            <TableContainer component={Paper}>
              <Table size="small" aria-label="simple table">
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
    </Box>
  );
}

export default UploadCourse;
