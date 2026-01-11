/**
 * Loading State Components
 * Consistent loading indicators and skeleton screens for better UX
 */

import React from 'react';
import {
  Box,
  CircularProgress,
  LinearProgress,
  Skeleton,
  Typography,
  Card,
  CardContent,
  Grid,
  Paper
} from '@mui/material';
import { keyframes } from '@mui/system';

// Pulse animation for skeleton loading
const pulse = keyframes`
  0% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
  100% {
    opacity: 1;
  }
`;

/**
 * Basic loading spinner
 */
export function LoadingSpinner({ size = 40, message, centered = true }) {
  const content = (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <CircularProgress size={size} />
      {message && (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );

  if (centered) {
    return (
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: 200,
          width: '100%'
        }}
      >
        {content}
      </Box>
    );
  }

  return content;
}

/**
 * Linear progress bar
 */
export function LoadingBar({ progress, message, variant = 'indeterminate' }) {
  return (
    <Box sx={{ width: '100%', mb: 2 }}>
      {message && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {message}
        </Typography>
      )}
      <LinearProgress 
        variant={variant} 
        value={progress}
        sx={{ height: 6, borderRadius: 3 }}
      />
    </Box>
  );
}

/**
 * Skeleton for dashboard metrics cards
 */
export function MetricCardSkeleton({ count = 4 }) {
  return (
    <Grid container spacing={3}>
      {Array.from({ length: count }).map((_, index) => (
        <Grid item xs={12} sm={6} md={3} key={index}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ flex: 1 }}>
                  <Skeleton variant="text" width="60%" height={20} />
                  <Skeleton variant="text" width="80%" height={32} sx={{ mt: 1 }} />
                  <Skeleton variant="text" width="40%" height={16} sx={{ mt: 0.5 }} />
                </Box>
                <Skeleton variant="circular" width={40} height={40} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
}

/**
 * Skeleton for recommendation cards
 */
export function RecommendationCardSkeleton({ count = 5 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {Array.from({ length: count }).map((_, index) => (
        <Paper key={index} sx={{ p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Skeleton variant="circular" width={48} height={48} />
            <Box sx={{ flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
                <Skeleton variant="text" width={80} height={24} />
                <Skeleton variant="rectangular" width={60} height={20} sx={{ borderRadius: 1 }} />
              </Box>
              <Skeleton variant="text" width="100%" height={16} />
              <Skeleton variant="text" width="70%" height={16} />
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Skeleton variant="text" width={80} height={20} />
              <Skeleton variant="text" width={60} height={16} />
            </Box>
          </Box>
        </Paper>
      ))}
    </Box>
  );
}

/**
 * Skeleton for data table
 */
export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      {/* Table header */}
      <Box sx={{ display: 'flex', p: 2, borderBottom: 1, borderColor: 'divider' }}>
        {Array.from({ length: columns }).map((_, index) => (
          <Box key={index} sx={{ flex: 1, mr: index < columns - 1 ? 2 : 0 }}>
            <Skeleton variant="text" width="80%" height={20} />
          </Box>
        ))}
      </Box>
      
      {/* Table rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <Box 
          key={rowIndex} 
          sx={{ 
            display: 'flex', 
            p: 2, 
            borderBottom: rowIndex < rows - 1 ? 1 : 0, 
            borderColor: 'divider' 
          }}
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Box key={colIndex} sx={{ flex: 1, mr: colIndex < columns - 1 ? 2 : 0 }}>
              <Skeleton 
                variant="text" 
                width={colIndex === 0 ? '60%' : '90%'} 
                height={16} 
              />
            </Box>
          ))}
        </Box>
      ))}
    </Paper>
  );
}

/**
 * Skeleton for chart/graph
 */
export function ChartSkeleton({ height = 300 }) {
  return (
    <Paper sx={{ p: 3, height }}>
      <Box sx={{ mb: 2 }}>
        <Skeleton variant="text" width="40%" height={24} />
        <Skeleton variant="text" width="60%" height={16} />
      </Box>
      <Box sx={{ 
        height: height - 100, 
        display: 'flex', 
        alignItems: 'end', 
        gap: 1,
        animation: `${pulse} 2s ease-in-out infinite`
      }}>
        {Array.from({ length: 12 }).map((_, index) => (
          <Skeleton
            key={index}
            variant="rectangular"
            sx={{
              flex: 1,
              height: `${Math.random() * 80 + 20}%`,
              borderRadius: 1
            }}
          />
        ))}
      </Box>
    </Paper>
  );
}

/**
 * Full page loading overlay
 */
export function PageLoadingOverlay({ message = 'Loading...', transparent = false }) {
  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: transparent ? 'rgba(255, 255, 255, 0.8)' : 'background.default',
        zIndex: 9999,
        backdropFilter: transparent ? 'blur(4px)' : 'none'
      }}
    >
      <LoadingSpinner size={60} message={message} centered={false} />
    </Box>
  );
}

/**
 * Inline loading state for buttons and small components
 */
export function InlineLoading({ size = 16, color = 'inherit' }) {
  return (
    <CircularProgress 
      size={size} 
      sx={{ 
        color,
        ml: 1
      }} 
    />
  );
}

/**
 * Loading state wrapper component
 */
export function LoadingWrapper({ 
  loading, 
  error, 
  children, 
  loadingComponent,
  errorComponent,
  skeleton = false,
  skeletonComponent
}) {
  if (error && errorComponent) {
    return errorComponent;
  }

  if (loading) {
    if (skeleton && skeletonComponent) {
      return skeletonComponent;
    }
    
    if (loadingComponent) {
      return loadingComponent;
    }
    
    return <LoadingSpinner />;
  }

  return children;
}

/**
 * Higher-order component for adding loading states
 */
export function withLoading(Component, loadingProps = {}) {
  const WrappedComponent = (props) => {
    const { loading, error, ...restProps } = props;
    
    return (
      <LoadingWrapper 
        loading={loading} 
        error={error} 
        {...loadingProps}
      >
        <Component {...restProps} />
      </LoadingWrapper>
    );
  };

  WrappedComponent.displayName = `withLoading(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}

// Export all components as default
export default {
  LoadingSpinner,
  LoadingBar,
  MetricCardSkeleton,
  RecommendationCardSkeleton,
  TableSkeleton,
  ChartSkeleton,
  PageLoadingOverlay,
  InlineLoading,
  LoadingWrapper,
  withLoading
};
