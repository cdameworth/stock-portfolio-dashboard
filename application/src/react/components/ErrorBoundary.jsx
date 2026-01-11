/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree and displays a fallback UI
 */

import React from 'react';
import { 
  Box, 
  Typography, 
  Button, 
  Paper, 
  Alert,
  AlertTitle,
  Collapse,
  IconButton
} from '@mui/material';
import { 
  ErrorOutline, 
  Refresh, 
  BugReport,
  ExpandMore,
  ExpandLess
} from '@mui/icons-material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      errorId: null
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { 
      hasError: true,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error,
      errorInfo
    });

    // Report error to monitoring service (if available)
    this.reportError(error, errorInfo);
  }

  reportError = (error, errorInfo) => {
    try {
      // Send error to monitoring service
      const errorReport = {
        id: this.state.errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: this.getUserId()
      };

      // Example: Send to error reporting service
      // fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport)
      // });

      console.log('Error report:', errorReport);
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  getUserId = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      return user.id || 'anonymous';
    } catch {
      return 'anonymous';
    }
  };

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      errorId: null
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  render() {
    if (this.state.hasError) {
      const { error, errorInfo, showDetails, errorId } = this.state;
      const { fallback: CustomFallback, minimal = false } = this.props;

      // Use custom fallback if provided
      if (CustomFallback) {
        return (
          <CustomFallback
            error={error}
            errorInfo={errorInfo}
            onRetry={this.handleRetry}
            onReload={this.handleReload}
          />
        );
      }

      // Minimal error display
      if (minimal) {
        return (
          <Alert 
            severity="error" 
            action={
              <Button size="small" onClick={this.handleRetry}>
                Retry
              </Button>
            }
          >
            Something went wrong. Please try again.
          </Alert>
        );
      }

      // Full error boundary UI
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            p: 3,
            textAlign: 'center'
          }}
        >
          <Paper
            elevation={3}
            sx={{
              p: 4,
              maxWidth: 600,
              width: '100%'
            }}
          >
            <Box sx={{ mb: 3 }}>
              <ErrorOutline 
                sx={{ 
                  fontSize: 64, 
                  color: 'error.main',
                  mb: 2
                }} 
              />
              <Typography variant="h4" gutterBottom>
                Oops! Something went wrong
              </Typography>
              <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                We're sorry, but something unexpected happened. Our team has been notified.
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 3 }}>
              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={this.handleRetry}
              >
                Try Again
              </Button>
              <Button
                variant="outlined"
                onClick={this.handleReload}
              >
                Reload Page
              </Button>
            </Box>

            {/* Error details section */}
            <Box>
              <Button
                variant="text"
                startIcon={<BugReport />}
                endIcon={showDetails ? <ExpandLess /> : <ExpandMore />}
                onClick={this.toggleDetails}
                size="small"
                color="inherit"
              >
                {showDetails ? 'Hide' : 'Show'} Technical Details
              </Button>

              <Collapse in={showDetails}>
                <Box sx={{ mt: 2, textAlign: 'left' }}>
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <AlertTitle>Error ID: {errorId}</AlertTitle>
                    Please include this ID when reporting the issue.
                  </Alert>

                  {error && (
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 2, 
                        mb: 2, 
                        backgroundColor: 'grey.50',
                        fontFamily: 'monospace',
                        fontSize: '0.875rem'
                      }}
                    >
                      <Typography variant="subtitle2" gutterBottom>
                        Error Message:
                      </Typography>
                      <Typography variant="body2" sx={{ mb: 2 }}>
                        {error.message}
                      </Typography>

                      {error.stack && (
                        <>
                          <Typography variant="subtitle2" gutterBottom>
                            Stack Trace:
                          </Typography>
                          <Typography 
                            variant="body2" 
                            component="pre"
                            sx={{ 
                              whiteSpace: 'pre-wrap',
                              fontSize: '0.75rem',
                              maxHeight: 200,
                              overflow: 'auto'
                            }}
                          >
                            {error.stack}
                          </Typography>
                        </>
                      )}
                    </Paper>
                  )}

                  {errorInfo && errorInfo.componentStack && (
                    <Paper 
                      variant="outlined" 
                      sx={{ 
                        p: 2,
                        backgroundColor: 'grey.50',
                        fontFamily: 'monospace',
                        fontSize: '0.875rem'
                      }}
                    >
                      <Typography variant="subtitle2" gutterBottom>
                        Component Stack:
                      </Typography>
                      <Typography 
                        variant="body2" 
                        component="pre"
                        sx={{ 
                          whiteSpace: 'pre-wrap',
                          fontSize: '0.75rem',
                          maxHeight: 200,
                          overflow: 'auto'
                        }}
                      >
                        {errorInfo.componentStack}
                      </Typography>
                    </Paper>
                  )}
                </Box>
              </Collapse>
            </Box>
          </Paper>
        </Box>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary(Component, errorBoundaryProps = {}) {
  const WrappedComponent = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Hook for error reporting in functional components
export function useErrorHandler() {
  return (error, errorInfo = {}) => {
    console.error('Manual error report:', error, errorInfo);
    
    // Report error to monitoring service
    const errorReport = {
      id: `manual_error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      message: error.message || String(error),
      stack: error.stack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      ...errorInfo
    };

    // Send to error reporting service
    // fetch('/api/errors', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(errorReport)
    // });
  };
}

export default ErrorBoundary;
