import React from "react";
import { Link as RouterLink } from "react-router-dom";
import { AppBar, Toolbar, Typography, Button, Box } from "@mui/material";
import { styled } from "@mui/system";

const StyledAppBar = styled(AppBar)(({ theme }) => ({
  backgroundColor: "#171718",
  height: "8vh",
}));

const StyledButton = styled(Button)(({ theme }) => ({
  color: "inherit",
  "&:hover": {
    textDecoration: "none",
    borderBottom: "3px solid #5c62ec",
  },
}));

function Header() {
  return (
    <StyledAppBar position="static">
      <Toolbar>
        {}
        <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
          <RouterLink
            to="/"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {" "}
            {}
            Course
            <Typography variant="h6" component="span" sx={{ color: "#5c62ec" }}>
              Analytics
            </Typography>
          </RouterLink>
        </Typography>

        {}
        <Box>
          {}
          <StyledButton color="inherit" component={RouterLink} to="/">
            Главная
          </StyledButton>
          <StyledButton color="inherit" component={RouterLink} to="/upload">
            Курсы
          </StyledButton>
        </Box>
      </Toolbar>
    </StyledAppBar>
  );
}

export default Header;
