/**
 * Lazy Loading Components
 * Provides lazy loading functionality with loading states and error handling
 */

import React, { Suspense } from 'react';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';
import ErrorBoundary from './ErrorBoundary.jsx';

/**
 * Loading fallback component for lazy-loaded components
 */
function LazyLoadingFallback({ message = 'Loading...', minHeight = 200 }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        gap: 2
      }}
    >
      <CircularProgress size={40} />
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}

/**
 * Error fallback component for lazy loading failures
 */
function LazyLoadingError({ error, onRetry }) {
  return (
    <Box sx={{ p: 3 }}>
      <Alert 
        severity="error" 
        action={
          onRetry && (
            <Button size="small" onClick={onRetry}>
              Retry
            </Button>
          )
        }
      >
        <Typography variant="h6" gutterBottom>
          Failed to load component
        </Typography>
        <Typography variant="body2">
          {error?.message || 'An error occurred while loading this section.'}
        </Typography>
      </Alert>
    </Box>
  );
}

/**
 * Higher-order component for lazy loading with error boundaries
 */
export function withLazyLoading(
  LazyComponent, 
  options = {}
) {
  const {
    fallback,
    errorFallback,
    minHeight = 200,
    loadingMessage = 'Loading...'
  } = options;

  const WrappedComponent = (props) => {
    const [retryKey, setRetryKey] = React.useState(0);

    const handleRetry = () => {
      setRetryKey(prev => prev + 1);
    };

    const defaultFallback = fallback || (
      <LazyLoadingFallback 
        message={loadingMessage} 
        minHeight={minHeight} 
      />
    );

    const defaultErrorFallback = errorFallback || (
      <LazyLoadingError onRetry={handleRetry} />
    );

    return (
      <ErrorBoundary 
        key={retryKey}
        fallback={({ error }) => defaultErrorFallback}
      >
        <Suspense fallback={defaultFallback}>
          <LazyComponent {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  };

  WrappedComponent.displayName = `withLazyLoading(${LazyComponent.displayName || LazyComponent.name})`;
  
  return WrappedComponent;
}

/**
 * Lazy route component wrapper
 */
export function LazyRoute({ 
  component: Component, 
  loadingMessage = 'Loading page...',
  minHeight = 400,
  ...props 
}) {
  return (
    <ErrorBoundary>
      <Suspense 
        fallback={
          <LazyLoadingFallback 
            message={loadingMessage} 
            minHeight={minHeight} 
          />
        }
      >
        <Component {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * Preload a lazy component
 */
export function preloadComponent(lazyComponent) {
  if (typeof lazyComponent === 'function') {
    // Call the lazy function to start loading
    lazyComponent();
  }
}

/**
 * Hook for preloading components on user interaction
 */
export function usePreloadOnHover(lazyComponent) {
  const preload = React.useCallback(() => {
    preloadComponent(lazyComponent);
  }, [lazyComponent]);

  return {
    onMouseEnter: preload,
    onFocus: preload
  };
}

/**
 * Component for lazy loading with intersection observer
 */
export function LazyOnVisible({ 
  children, 
  fallback, 
  rootMargin = '50px',
  threshold = 0.1 
}) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [hasLoaded, setHasLoaded] = React.useState(false);
  const ref = React.useRef();

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasLoaded) {
          setIsVisible(true);
          setHasLoaded(true);
          observer.disconnect();
        }
      },
      {
        rootMargin,
        threshold
      }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [rootMargin, threshold, hasLoaded]);

  return (
    <div ref={ref}>
      {isVisible ? children : (fallback || <LazyLoadingFallback />)}
    </div>
  );
}

/**
 * Lazy image component with loading states
 */
export function LazyImage({ 
  src, 
  alt, 
  placeholder, 
  onLoad, 
  onError,
  ...props 
}) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [imageSrc, setImageSrc] = React.useState(placeholder);

  React.useEffect(() => {
    const img = new Image();
    
    img.onload = () => {
      setImageSrc(src);
      setLoading(false);
      setError(false);
      onLoad?.();
    };
    
    img.onerror = () => {
      setLoading(false);
      setError(true);
      onError?.();
    };
    
    img.src = src;
  }, [src, onLoad, onError]);

  if (error) {
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          bgcolor: 'grey.100',
          color: 'grey.500',
          minHeight: 100,
          ...props.sx
        }}
      >
        <Typography variant="body2">Failed to load image</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', ...props.sx }}>
      <img
        src={imageSrc}
        alt={alt}
        style={{
          opacity: loading ? 0.5 : 1,
          transition: 'opacity 0.3s ease',
          ...props.style
        }}
        {...props}
      />
      {loading && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)'
          }}
        >
          <CircularProgress size={24} />
        </Box>
      )}
    </Box>
  );
}

export default {
  withLazyLoading,
  LazyRoute,
  LazyOnVisible,
  LazyImage,
  preloadComponent,
  usePreloadOnHover
};
