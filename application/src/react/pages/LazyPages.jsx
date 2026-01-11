/**
 * Lazy-loaded Page Components
 * Code-split pages for better performance and faster initial load
 */

import React from 'react';
import { withLazyLoading, usePreloadOnHover } from '../components/LazyLoader.jsx';

// Lazy load the main page components
const LazyDashboard = React.lazy(() => 
  import('./Dashboard.jsx').then(module => ({ default: module.default }))
);

const LazyPortfolio = React.lazy(() => 
  import('./Portfolio.jsx').then(module => ({ default: module.default }))
);

const LazyRecommendations = React.lazy(() => 
  import('./Recommendations.jsx').then(module => ({ default: module.default }))
);

// Lazy load additional components that might be added later
const LazyAnalytics = React.lazy(() => 
  Promise.resolve().then(() => ({
    default: () => (
      <div>
        <h2>Analytics Page</h2>
        <p>Advanced analytics and reporting features coming soon...</p>
      </div>
    )
  }))
);

const LazySettings = React.lazy(() => 
  Promise.resolve().then(() => ({
    default: () => (
      <div>
        <h2>Settings Page</h2>
        <p>User settings and preferences coming soon...</p>
      </div>
    )
  }))
);

const LazyProfile = React.lazy(() => 
  Promise.resolve().then(() => ({
    default: () => (
      <div>
        <h2>Profile Page</h2>
        <p>User profile management coming soon...</p>
      </div>
    )
  }))
);

// Wrap components with lazy loading HOC
export const Dashboard = withLazyLoading(LazyDashboard, {
  loadingMessage: 'Loading dashboard...',
  minHeight: 400
});

export const Portfolio = withLazyLoading(LazyPortfolio, {
  loadingMessage: 'Loading portfolio...',
  minHeight: 400
});

export const Recommendations = withLazyLoading(LazyRecommendations, {
  loadingMessage: 'Loading recommendations...',
  minHeight: 400
});

export const Analytics = withLazyLoading(LazyAnalytics, {
  loadingMessage: 'Loading analytics...',
  minHeight: 400
});

export const Settings = withLazyLoading(LazySettings, {
  loadingMessage: 'Loading settings...',
  minHeight: 300
});

export const Profile = withLazyLoading(LazyProfile, {
  loadingMessage: 'Loading profile...',
  minHeight: 300
});

// Navigation helper with preloading
export function NavigationLink({ to, children, lazyComponent, ...props }) {
  const preloadProps = usePreloadOnHover(lazyComponent);
  
  return (
    <a href={`#${to}`} {...preloadProps} {...props}>
      {children}
    </a>
  );
}

// Page registry for dynamic loading
export const pageRegistry = {
  dashboard: {
    component: Dashboard,
    lazy: LazyDashboard,
    title: 'Dashboard',
    description: 'Overview of your portfolio performance'
  },
  portfolio: {
    component: Portfolio,
    lazy: LazyPortfolio,
    title: 'Portfolio',
    description: 'Manage your investment portfolio'
  },
  recommendations: {
    component: Recommendations,
    lazy: LazyRecommendations,
    title: 'Recommendations',
    description: 'AI-powered investment recommendations'
  },
  analytics: {
    component: Analytics,
    lazy: LazyAnalytics,
    title: 'Analytics',
    description: 'Advanced analytics and reporting'
  },
  settings: {
    component: Settings,
    lazy: LazySettings,
    title: 'Settings',
    description: 'Application settings and preferences'
  },
  profile: {
    component: Profile,
    lazy: LazyProfile,
    title: 'Profile',
    description: 'User profile and account management'
  }
};

// Preload all pages (useful for prefetching on idle)
export function preloadAllPages() {
  Object.values(pageRegistry).forEach(page => {
    if (page.lazy) {
      page.lazy();
    }
  });
}

// Preload specific pages
export function preloadPages(pageNames) {
  pageNames.forEach(pageName => {
    const page = pageRegistry[pageName];
    if (page && page.lazy) {
      page.lazy();
    }
  });
}

// Hook for managing page preloading
export function usePagePreloading() {
  const [preloadedPages, setPreloadedPages] = React.useState(new Set());

  const preloadPage = React.useCallback((pageName) => {
    if (!preloadedPages.has(pageName)) {
      const page = pageRegistry[pageName];
      if (page && page.lazy) {
        page.lazy();
        setPreloadedPages(prev => new Set([...prev, pageName]));
      }
    }
  }, [preloadedPages]);

  const preloadOnIdle = React.useCallback(() => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        preloadAllPages();
      });
    } else {
      // Fallback for browsers without requestIdleCallback
      setTimeout(preloadAllPages, 2000);
    }
  }, []);

  return {
    preloadPage,
    preloadOnIdle,
    preloadedPages: Array.from(preloadedPages)
  };
}

export default {
  Dashboard,
  Portfolio,
  Recommendations,
  Analytics,
  Settings,
  Profile,
  NavigationLink,
  pageRegistry,
  preloadAllPages,
  preloadPages,
  usePagePreloading
};
