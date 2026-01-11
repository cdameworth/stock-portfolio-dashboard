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
import { useAuthTracing, usePerformanceTracing } from './utils/useTracing.js';
import { browserTracer } from './services/browser-tracing.js';

// Main App Content Component
function AppContent() {
  const { isAuthenticated, authLoading } = useAuth();
  const { currentPage, setCurrentPage } = useNavigation();
  const { theme } = useTheme();
  const { state, actions } = useApp();

  // Tracing hooks
  const { trackLogout } = useAuthTracing();
  const { trackPageLoad } = usePerformanceTracing();

  // Initialize settings with defaults if not present
  const settings = {
    emailAlerts: false,
    pushNotifications: false,
    showAdvancedMetrics: true,
    darkMode: theme === 'dark',
    ...(state?.settings || {})
  };

  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [authDialogType, setAuthDialogType] = useState('login');
  const [anchorEl, setAnchorEl] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Show loading screen while checking authentication
  if (authLoading) {
    return <PageLoadingOverlay message="Loading application..." />;
  }

  const { logout, user, setAuthenticated, setUser } = useAuth();

  const handleAuthSuccess = () => {
    // Get user data from localStorage after successful login
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setAuthenticated(true);
    }
    setAuthDialogOpen(false);
  };

  const handleLogout = () => {
    // Track logout journey
    const traceId = trackLogout();

    logout();
    setAnchorEl(null);

    // End logout journey
    setTimeout(() => {
      browserTracer.endJourney(traceId, {
        'auth.logout_success': true,
        'auth.method': 'user_initiated'
      });
    }, 100);
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
          minHeight: { xs: '60vh', sm: '70vh' },
          textAlign: 'center',
          px: { xs: 2, sm: 3 }
        }}>
          <Typography
            variant="h2"
            sx={{
              mb: { xs: 1.5, sm: 2 },
              fontFamily: '"Playfair Display", serif',
              fontSize: { xs: '1.8rem', sm: '2.5rem', md: '3rem' }
            }}
          >
            Professional Investment Management
          </Typography>
          <Typography
            variant="h6"
            sx={{
              mb: { xs: 3, sm: 4 },
              color: 'text.secondary',
              maxWidth: { xs: '100%', sm: '600px' },
              fontSize: { xs: '1rem', sm: '1.25rem' },
              lineHeight: 1.6
            }}
          >
            Access sophisticated portfolio analytics and AI-powered investment recommendations
            in our exclusive professional environment.
          </Typography>
          <Box sx={{
            display: 'flex',
            gap: { xs: 1.5, sm: 2 },
            flexDirection: { xs: 'column', sm: 'row' },
            width: { xs: '100%', sm: 'auto' },
            maxWidth: { xs: '300px', sm: 'none' }
          }}>
            <Button
              variant="contained"
              size="large"
              onClick={() => openAuthDialog('login')}
              sx={{ minHeight: 48 }}
            >
              Member Access
            </Button>
            <Button
              variant="outlined"
              size="large"
              onClick={() => openAuthDialog('register')}
              sx={{ minHeight: 48 }}
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
          <Typography
            variant="h6"
            sx={{
              flexGrow: 1,
              fontFamily: '"Playfair Display", serif',
              fontSize: { xs: '1.1rem', sm: '1.25rem' }
            }}
          >
            Portfolio Management
          </Typography>

          {isAuthenticated ? (
            <>
              <Box sx={{
                display: { xs: 'none', md: 'flex' },
                gap: 1,
                mr: 2
              }}>
                <Button
                  color="inherit"
                  startIcon={<Dashboard />}
                  onClick={() => setCurrentPage('dashboard')}
                  size="small"
                >
                  Dashboard
                </Button>
                <Button
                  color="inherit"
                  startIcon={<TrendingUp />}
                  onClick={() => setCurrentPage('portfolio')}
                  size="small"
                >
                  Portfolio
                </Button>
                <Button
                  color="inherit"
                  onClick={() => setCurrentPage('recommendations')}
                  size="small"
                >
                  AI Insights
                </Button>
              </Box>

              <Box sx={{
                display: { xs: 'flex', md: 'none' },
                gap: 0.5,
                mr: 1
              }}>
                <IconButton
                  color="inherit"
                  onClick={() => setCurrentPage('dashboard')}
                  size="small"
                >
                  <Dashboard />
                </IconButton>
                <IconButton
                  color="inherit"
                  onClick={() => setCurrentPage('portfolio')}
                  size="small"
                >
                  <TrendingUp />
                </IconButton>
              </Box>

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
                <MenuItem
                  onClick={() => setCurrentPage('recommendations')}
                  sx={{ display: { xs: 'flex', md: 'none' } }}
                >
                  <TrendingUp sx={{ mr: 1 }} />
                  AI Insights
                </MenuItem>
                <MenuItem onClick={handleLogout}>
                  <Logout sx={{ mr: 1 }} />
                  Sign Out
                </MenuItem>
              </Menu>
            </>
          ) : (
            <Box sx={{
              display: 'flex',
              gap: { xs: 0.5, sm: 1 },
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center'
            }}>
              <Button
                color="inherit"
                onClick={() => openAuthDialog('login')}
                size="small"
              >
                Member Access
              </Button>
              <Button
                color="inherit"
                onClick={() => openAuthDialog('register')}
                size="small"
              >
                Apply
              </Button>
            </Box>
          )}
        </Toolbar>
      </AppBar>

      <Container
        maxWidth="xl"
        sx={{
          mt: { xs: 2, sm: 3 },
          mb: { xs: 2, sm: 3 },
          px: { xs: 1, sm: 2, md: 3 }
        }}
      >
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