// frontend/src/components/UploadCourse.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Button, Typography, Dialog, DialogTitle, DialogContent, DialogActions, Alert, Grid,
    Paper, Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Link as MuiLink, Chip
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile'; // Иконка для кнопки загрузки
import VisibilityIcon from '@mui/icons-material/Visibility'; // Иконка для кнопки примера

// Импортируем примеры
import { csvExamples } from './UploadCourseExamples';

// Определяем типы файлов, которые нам нужны
const requiredFileTypes = ['learners', 'structure', 'submissions', 'comments'];

function UploadCourse() {
    const navigate = useNavigate();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogData, setDialogData] = useState({ title: '', headers: [], rows: [] });
    const [selectedFiles, setSelectedFiles] = useState(
        // Инициализируем состояние для каждого типа файла как null
        requiredFileTypes.reduce((acc, type) => {
            acc[type] = null;
            return acc;
        }, {})
    );
    const [error, setError] = useState(null);

    // Обработчик выбора файла для конкретного типа
    const handleFileChange = (event, fileType) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFiles(prev => ({
                ...prev,
                [fileType]: file
            }));
            setError(null); // Сбрасываем общую ошибку при выборе файла
        }
        // Очищаем значение input, чтобы можно было выбрать тот же файл снова
        event.target.value = null;
    };

    // Обработчик для показа примера
    const handleShowExample = (fileType) => {
        if (csvExamples[fileType]) {
            setDialogData(csvExamples[fileType]);
            setDialogOpen(true);
        }
    };

    // Закрытие диалогового окна
    const handleCloseDialog = () => setDialogOpen(false);

    // Обработчик основной кнопки загрузки
    const handleUpload = async () => {
        // Проверяем, все ли файлы выбраны
        const allFilesSelected = requiredFileTypes.every(type => selectedFiles[type]);
        if (!allFilesSelected) {
            setError("Пожалуйста, выберите все четыре обязательных файла.");
            return;
        }

        setError(null); // Сбрасываем ошибку перед попыткой загрузки
        console.log("Выбранные файлы:", selectedFiles);

        try {
            // --- Логика отправки файлов на backend ---
            const formData = new FormData();
            requiredFileTypes.forEach(type => {
                formData.append(type, selectedFiles[type], selectedFiles[type].name); // Важно передать имя файла
            });

            console.log("Отправка данных на backend...");
            // Замените '/api/upload' на ваш реальный endpoint
            // const response = await fetch('/api/upload', {
            //    method: 'POST',
            //    body: formData
            //    // Не устанавливайте 'Content-Type': 'multipart/form-data',
            //    // браузер сделает это сам с правильным boundary
            // });

            // if (!response.ok) {
            //   const errorData = await response.json().catch(() => ({ message: 'Не удалось получить детали ошибки' }));
            //   throw new Error(`Ошибка загрузки: ${response.status} - ${errorData.message || response.statusText}`);
            // }

            // const result = await response.json();
            // console.log("Ответ от backend:", result);
            // --- Конец логики отправки ---

            // Имитация успешной загрузки и переход
            await new Promise(resolve => setTimeout(resolve, 500)); // Имитация задержки сети
            console.log("Переход на дашборд...");
            navigate('/dashboard'); // Переходим на дашборд после "успешной" загрузки

        } catch (err) {
            console.error("Ошибка при загрузке:", err);
            setError(`Ошибка: ${err.message}`);
        }
    };

    // Проверяем, выбраны ли все файлы, для активации кнопки Upload
    const isUploadDisabled = !requiredFileTypes.every(type => selectedFiles[type]);

    return (
        <Box sx={{ mt: 4, mb: 4 }}>
            <Typography variant="h4" gutterBottom align="center">
                Загрузка данных курса
            </Typography>
            <Typography paragraph align="center" sx={{ mb: 4 }}>
                Пожалуйста, загрузите 4 CSV файла с данными вашего курса.
            </Typography>

            <Grid container spacing={4} justifyContent="center">
                {requiredFileTypes.map((fileType) => (
                     <Grid item xs={12} sm={6} md={3} key={fileType}> 
                        <Paper elevation={3} sx={{ p: 3, textAlign: 'center', height: '100%' /* Добавим высоту для выравнивания */ }}>
                <Typography variant="h6" gutterBottom>
                    {fileType.charAt(0).toUpperCase() + fileType.slice(1)} Data
                </Typography>
                <Typography variant="body2" color="textSecondary" gutterBottom>
                    ({fileType}.csv)
                </Typography>

                <Box sx={{ mt: 2, mb: 2, display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
                    {/* Кнопка "Пример" */}
                    <Button
                        variant="text"
                        size="small"
                        startIcon={<VisibilityIcon />}
                        onClick={() => handleShowExample(fileType)}
                    >
                        Пример
                    </Button>

                    {/* Кнопка "Загрузить файл" */}
                    <Button
                        variant="contained"
                        component="label" // Делает кнопку триггером для input
                        startIcon={<UploadFileIcon />}
                        size="small"
                    >
                        Выбрать файл
                        <input
                            type="file"
                            accept=".csv"
                            hidden // Скрываем стандартный input
                            onChange={(e) => handleFileChange(e, fileType)}
                        />
                    </Button>
                </Box>

                {/* Отображение имени выбранного файла */}
                {selectedFiles[fileType] ? (
                    <Chip
                        label={selectedFiles[fileType].name}
                        onDelete={() => setSelectedFiles(prev => ({ ...prev, [fileType]: null }))}
                        color="primary"
                        variant="outlined"
                        size="small"
                        sx={{ mt: 1, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' /* Обрезка длинных имен */ }}
                    />
                ) : (
                   // Добавим Placeholder, чтобы высота была одинаковой
                   <Box sx={{ height: '31px', mt: 1 }} /> // Высота примерно как у Chip
                )}
            </Paper>
        </Grid>
    ))}
</Grid> 

            {/* Общая ошибка */}
            {error && (
                <Alert severity="error" sx={{ mt: 3, width: 'fit-content', margin: '24px auto 0' }}>
                    {error}
                </Alert>
            )}

            {/* Основная кнопка загрузки */}
            <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    onClick={handleUpload}
                    disabled={isUploadDisabled} // Активируется, когда все файлы выбраны
                >
                    Загрузить и проанализировать
                </Button>
            </Box>

            {/* Диалоговое окно для показа примера */}
            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
                <DialogTitle>{dialogData.title}</DialogTitle>
                <DialogContent dividers>
                    {dialogData.headers.length > 0 ? (
                        <TableContainer component={Paper}>
                            <Table size="small" aria-label="simple table">
                                <TableHead>
                                    <TableRow>
                                        {dialogData.headers.map((header, index) => (
                                            <TableCell key={index} sx={{ fontWeight: 'bold' }}>{header}</TableCell>
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