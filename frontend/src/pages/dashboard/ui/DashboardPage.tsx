// src/pages/dashboard/ui/DashboardPage.tsx
import { Box, Typography } from "@mui/material";
import { DashboardPanel } from "#/widgets/dashboard-panel";

export default function DashboardPage() {
  return (
    <Box sx={{ p: 4, minHeight: "100vh" }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ fontWeight: "bold" }}>
        Dashboard del Club
      </Typography>
      
      {/* El Widget hace todo el trabajo pesado */}
      <DashboardPanel />
    </Box>
  );
}