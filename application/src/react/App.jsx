import React, { useState } from 'react';
import { Container, Box, AppBar, Toolbar, Typography, Button, IconButton, Menu, MenuItem, Dialog, DialogTitle, DialogContent, DialogActions, Switch, FormControlLabel, Divider } from '@mui/material';
import { AccountCircle, Dashboard, TrendingUp, Settings, Logout } from '@mui/icons-material';
import { AppProvider, useAuth, useNavigation, useTheme, useApp } from './contexts/AppContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { LoadingSpinner, PageLoadingOverlay } from './components/LoadingState.jsx';
import AuthDialog from './components/AuthDialog.jsx';
import DashboardPage from './pages/Dashboard.jsx';
import Portfolio from './pages/Portfolio.jsx';
import Recommendations from './pages/Recommendations.jsx';

// Main App Content Component
function AppContent() {
  const { isAuthenticated, authLoading } = useAuth();
  const { currentPage, setCurrentPage } = useNavigation();
  const { theme } = useTheme();
  const { state, actions } = useApp();
  const settings = {
    ...state.settings,
    darkMode: theme === 'dark' // Sync with current theme
  };

  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDialogType, setAuthDialogType] = useState('login');
  const [anchorEl, setAnchorEl] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Show loading screen while checking authentication
  if (authLoading) {
    return <PageLoadingOverlay message="Loading application..." />;
  }

  const { logout, user } = useAuth();

  const handleAuthSuccess = () => {
    setAuthDialogOpen(false);
  };

  const handleLogout = () => {
    logout();
    setAnchorEl(null);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSettingsClick = () => {
    setSettingsOpen(true);
    setAnchorEl(null);
  };

  const handleSettingChange = (settingKey) => (event) => {
    const value = event.target.checked;
    actions.updateSettings({ [settingKey]: value });
    
    // Special handling for dark mode to also update theme
    if (settingKey === 'darkMode') {
      actions.setTheme(value ? 'dark' : 'light');
    }
  };

  const openAuthDialog = (type) => {
    setAuthDialogType(type);
    setAuthDialogOpen(true);
  };

  const renderContent = () => {
    if (!isAuthenticated) {
      return (
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '70vh',
          textAlign: 'center'
        }}>
          <Typography variant="h2" sx={{ mb: 2, fontFamily: '"Playfair Display", serif' }}>
            Professional Investment Management
          </Typography>
          <Typography variant="h6" sx={{ mb: 4, color: 'text.secondary', maxWidth: '600px' }}>
            Access sophisticated portfolio analytics and AI-powered investment recommendations
            in our exclusive professional environment.
          </Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => openAuthDialog('login')}
            >
              Member Access
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => openAuthDialog('register')}
            >
              Apply for Membership
            </Button>
          </Box>
        </Box>
      );
    }

    // Wrap pages in error boundaries
    switch (currentPage) {
      case 'dashboard':
        return (
          <ErrorBoundary>
            <DashboardPage />
          </ErrorBoundary>
        );
      case 'portfolio':
        return (
          <ErrorBoundary>
            <Portfolio />
          </ErrorBoundary>
        );
      case 'recommendations':
        return (
          <ErrorBoundary>
            <Recommendations />
          </ErrorBoundary>
        );
      default:
        return (
          <ErrorBoundary>
            <DashboardPage />
          </ErrorBoundary>
        );
    }
  };

  return (
    <>
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1, fontFamily: '"Playfair Display", serif' }}>
            Portfolio Management
          </Typography>
          
          {isAuthenticated ? (
            <>
              <Button 
                color="inherit" 
                startIcon={<Dashboard />}
                onClick={() => setCurrentPage('dashboard')}
                sx={{ mr: 1 }}
              >
                Dashboard
              </Button>
              <Button 
                color="inherit" 
                startIcon={<TrendingUp />}
                onClick={() => setCurrentPage('portfolio')}
                sx={{ mr: 1 }}
              >
                Portfolio
              </Button>
              <Button 
                color="inherit" 
                onClick={() => setCurrentPage('recommendations')}
                sx={{ mr: 2 }}
              >
                AI Insights
              </Button>
              <IconButton
                size="large"
                onClick={(event) => setAnchorEl(event.currentTarget)}
                color="inherit"
              >
                <AccountCircle />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
              >
                <MenuItem onClick={handleSettingsClick}>
                  <Settings sx={{ mr: 1 }} />
                  Settings
                </MenuItem>
                <MenuItem onClick={handleLogout}>
                  <Logout sx={{ mr: 1 }} />
                  Sign Out
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Box>
              <Button color="inherit" onClick={() => openAuthDialog('login')}>
                Member Access
              </Button>
              <Button color="inherit" onClick={() => openAuthDialog('register')}>
                Apply
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 3 }}>
        {renderContent()}
      </Container>

      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Settings sx={{ mr: 1 }} />
            Account Settings
          </Box>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            <Typography variant="h6" gutterBottom>Notifications</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.emailAlerts}
                  onChange={handleSettingChange('emailAlerts')}
                />
              }
              label="Email Alerts"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.pushNotifications}
                  onChange={handleSettingChange('pushNotifications')}
                />
              }
              label="Push Notifications"
            />
            
            <Divider sx={{ my: 3 }} />
            
            <Typography variant="h6" gutterBottom>Display</Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.darkMode}
                  onChange={handleSettingChange('darkMode')}
                />
              }
              label="Dark Mode"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={settings.showAdvancedMetrics}
                  onChange={handleSettingChange('showAdvancedMetrics')}
                />
              }
              label="Show Advanced Metrics"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Close</Button>
          <Button variant="contained" onClick={() => setSettingsOpen(false)}>
            Save Settings
          </Button>
        </DialogActions>
      </Dialog>

      <AuthDialog
        open={authDialogOpen}
        type={authDialogType}
        onClose={() => setAuthDialogOpen(false)}
        onSuccess={handleAuthSuccess}
        onSwitchType={setAuthDialogType}
      />
    </>
  );
}

// Main App component with providers
function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}

export default App;