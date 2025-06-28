
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
  IconButton,
} from "@mui/material";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import VisibilityIcon from "@mui/icons-material/Visibility";
import DeleteIcon from "@mui/icons-material/Delete";
import { csvExamples } from "./UploadCourseExamples";

const requiredFileTypes = ["learners", "structure", "submissions", "comments"];
const PREDEFINED_BACKEND_COURSE_IDS_QUEUE = [63054, 99786, 122310];

function UploadCourse() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogData, setDialogData] = useState({
    title: "",
    headers: [],
    rows: [],
  });
  const [selectedFiles, setSelectedFiles] = useState(
    requiredFileTypes.reduce((acc, type) => {
      acc[type] = null;
      return acc;
    }, {})
  );
  const [error, setError] = useState(null);
  const [uploadedCourses, setUploadedCourses] = useState(() => {
    const storedCourses = localStorage.getItem("uploadedCourses");
    try {
      return storedCourses ? JSON.parse(storedCourses) : [];
    } catch (e) {
      console.error("Ошибка парсинга localStorage['uploadedCourses']:", e);
      localStorage.removeItem("uploadedCourses");
      return [];
    }
  });

  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [modalCourseName, setModalCourseName] = useState("");
  const [modalError, setModalError] = useState(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState(null);

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

  useEffect(() => {
    const allFilesSelected = requiredFileTypes.every(
      (type) => selectedFiles[type]
    );
    if (allFilesSelected && !isNameModalOpen) {
      setError(null);
      setIsNameModalOpen(true);
    }
  }, [selectedFiles, isNameModalOpen]);

  const handleFileChange = (event, fileType) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFiles((prev) => ({ ...prev, [fileType]: file }));
      setError(null);
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

  const handleModalCourseNameChange = (event) => {
    setModalCourseName(event.target.value);
    if (modalError) setModalError(null);
  };

  const handleCloseNameModal = () => {
    setIsNameModalOpen(false);
    setModalCourseName("");
    setModalError(null);
    setSelectedFiles(
      requiredFileTypes.reduce((acc, type) => ({ ...acc, [type]: null }), {})
    );
  };

  const handleSaveCourse = async () => {
    const trimmedName = modalCourseName.trim();
    if (!trimmedName) {
      setModalError("Пожалуйста, введите название для этого анализа.");
      return;
    }
    setModalError(null);

    let assignedBackendCourseId = null;
    const usedBackendIds = new Set(uploadedCourses.map((course) => course.id));

    for (const id of PREDEFINED_BACKEND_COURSE_IDS_QUEUE) {
      if (!usedBackendIds.has(id)) {
        assignedBackendCourseId = id;
        break;
      }
    }

    if (assignedBackendCourseId === null) {
      setError(
        "Все доступные слоты для анализа курсов заняты. Пожалуйста, удалите существующий анализ, чтобы добавить новый."
      );
      setIsNameModalOpen(false);
      setModalCourseName("");
      setSelectedFiles(
        requiredFileTypes.reduce((acc, type) => ({ ...acc, [type]: null }), {})
      );
      return;
    }

    setIsNameModalOpen(false);

    const courseIdForLinkAndStorage = assignedBackendCourseId;
    const userGivenName = trimmedName;

    console.log("Выбранные файлы для сохранения:", selectedFiles);
    console.log("Название анализа:", userGivenName);
    console.log(
      "Автоматически назначенный ID курса с сервера:",
      courseIdForLinkAndStorage
    );

    try {
      

      await new Promise((resolve) => setTimeout(resolve, 500));

      const newCourseEntry = {
        id: courseIdForLinkAndStorage, 
        name: userGivenName,
        date: new Date().toLocaleDateString("ru-RU"),
        dashboardLink: `/dashboard?courseId=${courseIdForLinkAndStorage}`,
       
      };

      setUploadedCourses((prevCourses) => [...prevCourses, newCourseEntry]);
      setModalCourseName("");
      setSelectedFiles(
        requiredFileTypes.reduce((acc, type) => ({ ...acc, [type]: null }), {})
      );

      navigate(newCourseEntry.dashboardLink);
    } catch (err) {
      console.error("Ошибка при сохранении анализа:", err);
      setError(
        `Ошибка сохранения: ${
          err.message || "Неизвестная ошибка"
        }. Попробуйте снова.`
      );
    }
  };

  const openDeleteDialog = (course) => {
    setCourseToDelete(course);
    setIsDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    setIsDeleteDialogOpen(false);
    setCourseToDelete(null);
  };

  const confirmDeleteCourse = () => {
    if (courseToDelete) {
      console.log(
        "Удаление анализа, связанного с ID курса:",
        courseToDelete.id
      );
      setUploadedCourses((prevCourses) =>
        prevCourses.filter((course) => course.id !== courseToDelete.id)
      );
    }
    closeDeleteDialog();
  };

  return (
    <Box sx={{ mt: 4, mb: 4, pl: 3, pr: 3 }}>
      <Typography variant="h4" gutterBottom align="center">
        Добавление анализа для курса
      </Typography>
      <Typography paragraph align="center" sx={{ mb: 4 }}>
        Пожалуйста, загрузите 4 CSV файла с данными вашего курса. Аналитика
        будет связана с одним из предопределенных курсов на сервере.
      </Typography>
      <Grid container spacing={4} justifyContent="center">
        {/* ... Блок с выбором файлов ... (остается без изменений) */}
        {requiredFileTypes.map((fileType) => (
          <Grid item xs={12} sm={6} md={3} key={fileType}>
            <Paper
              elevation={3}
              sx={{
                p: 3,
                textAlign: "center",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <div>
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
              </div>
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
      {error && (
        <Alert
          severity="error"
          sx={{ mt: 3, width: "fit-content", margin: "24px auto 0" }}
          onClose={() => setError(null)}
        >
          {error}
        </Alert>
      )}
      <Typography variant="h6" gutterBottom sx={{ mt: 5, mb: 2 }}>
        Добавленные анализы курсов:
      </Typography>
      {uploadedCourses.length > 0 ? (
        <TableContainer component={Paper}>
          <Table sx={{ minWidth: 750 }} aria-label="saved courses table">
            {" "}
            {}
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }} >
                  Название анализа
                </TableCell>
                
                <TableCell sx={{ fontWeight: "bold" }} align="center">
                  Дата добавления
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
                  hover
                  key={course.id + course.name}
                  sx={{ "&:last-child td, &:last-child th": { border: 0 } }}
                >
                  <TableCell component="th" scope="row">
                    {course.name}
                  </TableCell>
                  
                  <TableCell align="center">{course.date}</TableCell>
                  <TableCell align="center">
                    <Button
                      size="small"
                      component={RouterLink}
                      to={course.dashboardLink}
                      disabled={!course.dashboardLink} 
                    >
                      Перейти
                    </Button>
                  </TableCell>
                  
                  
                  <TableCell align="center">
                    <IconButton
                      aria-label={`Удалить анализ ${course.name}`}
                      size="small"
                      onClick={() => openDeleteDialog(course)}
                      color="error"
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
          Вы еще не добавляли анализы курсов.
        </Typography>
      )}
      {/* ... Диалоговые окна (остаются без изменений) ... */}
      <Dialog
        open={isNameModalOpen}
        onClose={handleCloseNameModal}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Введите название для этого анализа</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            id="course-name-modal"
            label="Название (например, 'Анализ курса Математика, весна 2024')"
            type="text"
            fullWidth
            variant="outlined"
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
            Сохранить и перейти
          </Button>
        </DialogActions>
      </Dialog>
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
            Вы уверены, что хотите удалить анализ "{courseToDelete?.name}"
            (связан с курсом ID: {courseToDelete?.id})? Это действие необратимо.
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
