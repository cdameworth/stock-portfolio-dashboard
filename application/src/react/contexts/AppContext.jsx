/**
 * Global Application Context
 * Centralized state management for authentication, user data, and app settings
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { authApi } from '../services/api-service';

// Initial state
const initialState = {
  // Authentication
  isAuthenticated: false,
  user: null,
  authLoading: true,
  
  // UI State
  currentPage: 'dashboard',
  sidebarOpen: false,
  theme: 'dark',
  
  // Data
  recommendations: [],
  portfolios: [],
  marketData: null,
  
  // Loading states
  loading: {
    recommendations: false,
    portfolios: false,
    marketData: false
  },
  
  // Error states
  errors: {
    auth: null,
    recommendations: null,
    portfolios: null,
    marketData: null
  },
  
  // Settings
  settings: {
    emailAlerts: true,
    pushNotifications: false,
    showAdvancedMetrics: true,
    darkMode: false,
    refreshInterval: 30000 // 30 seconds
  }
};

// Action types
const ActionTypes = {
  // Authentication
  SET_AUTH_LOADING: 'SET_AUTH_LOADING',
  SET_AUTHENTICATED: 'SET_AUTHENTICATED',
  SET_USER: 'SET_USER',
  LOGOUT: 'LOGOUT',
  
  // Navigation
  SET_CURRENT_PAGE: 'SET_CURRENT_PAGE',
  TOGGLE_SIDEBAR: 'TOGGLE_SIDEBAR',
  
  // Theme
  SET_THEME: 'SET_THEME',
  
  // Data
  SET_RECOMMENDATIONS: 'SET_RECOMMENDATIONS',
  SET_PORTFOLIOS: 'SET_PORTFOLIOS',
  SET_MARKET_DATA: 'SET_MARKET_DATA',
  
  // Loading states
  SET_LOADING: 'SET_LOADING',
  
  // Error handling
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  
  // Settings
  UPDATE_SETTINGS: 'UPDATE_SETTINGS'
};

// Reducer function
function appReducer(state, action) {
  switch (action.type) {
    case ActionTypes.SET_AUTH_LOADING:
      return {
        ...state,
        authLoading: action.payload
      };
      
    case ActionTypes.SET_AUTHENTICATED:
      return {
        ...state,
        isAuthenticated: action.payload,
        authLoading: false
      };
      
    case ActionTypes.SET_USER:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload
      };
      
    case ActionTypes.LOGOUT:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        recommendations: [],
        portfolios: [],
        marketData: null,
        errors: { ...initialState.errors }
      };
      
    case ActionTypes.SET_CURRENT_PAGE:
      return {
        ...state,
        currentPage: action.payload
      };
      
    case ActionTypes.TOGGLE_SIDEBAR:
      return {
        ...state,
        sidebarOpen: !state.sidebarOpen
      };
      
    case ActionTypes.SET_THEME:
      return {
        ...state,
        theme: action.payload
      };
      
    case ActionTypes.SET_RECOMMENDATIONS:
      return {
        ...state,
        recommendations: action.payload,
        loading: {
          ...state.loading,
          recommendations: false
        }
      };
      
    case ActionTypes.SET_PORTFOLIOS:
      return {
        ...state,
        portfolios: action.payload,
        loading: {
          ...state.loading,
          portfolios: false
        }
      };
      
    case ActionTypes.SET_MARKET_DATA:
      return {
        ...state,
        marketData: action.payload,
        loading: {
          ...state.loading,
          marketData: false
        }
      };
      
    case ActionTypes.SET_LOADING:
      return {
        ...state,
        loading: {
          ...state.loading,
          [action.payload.key]: action.payload.value
        }
      };
      
    case ActionTypes.SET_ERROR:
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload.key]: action.payload.error
        },
        loading: {
          ...state.loading,
          [action.payload.key]: false
        }
      };
      
    case ActionTypes.CLEAR_ERROR:
      return {
        ...state,
        errors: {
          ...state.errors,
          [action.payload]: null
        }
      };
      
    case ActionTypes.UPDATE_SETTINGS:
      return {
        ...state,
        settings: {
          ...state.settings,
          ...action.payload
        }
      };
      
    default:
      return state;
  }
}

// Create context
const AppContext = createContext();

// Context provider component
export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Action creators
  const actions = {
    // Authentication actions
    setAuthLoading: (loading) => {
      dispatch({ type: ActionTypes.SET_AUTH_LOADING, payload: loading });
    },
    
    setAuthenticated: (isAuthenticated) => {
      dispatch({ type: ActionTypes.SET_AUTHENTICATED, payload: isAuthenticated });
    },
    
    setUser: (user) => {
      dispatch({ type: ActionTypes.SET_USER, payload: user });
    },
    
    logout: () => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      dispatch({ type: ActionTypes.LOGOUT });
    },
    
    // Navigation actions
    setCurrentPage: (page) => {
      dispatch({ type: ActionTypes.SET_CURRENT_PAGE, payload: page });
    },
    
    toggleSidebar: () => {
      dispatch({ type: ActionTypes.TOGGLE_SIDEBAR });
    },
    
    // Theme actions
    setTheme: (theme) => {
      dispatch({ type: ActionTypes.SET_THEME, payload: theme });
      localStorage.setItem('theme', theme);
    },
    
    // Data actions
    setRecommendations: (recommendations) => {
      dispatch({ type: ActionTypes.SET_RECOMMENDATIONS, payload: recommendations });
    },
    
    setPortfolios: (portfolios) => {
      dispatch({ type: ActionTypes.SET_PORTFOLIOS, payload: portfolios });
    },
    
    setMarketData: (marketData) => {
      dispatch({ type: ActionTypes.SET_MARKET_DATA, payload: marketData });
    },
    
    // Loading actions
    setLoading: (key, value) => {
      dispatch({ type: ActionTypes.SET_LOADING, payload: { key, value } });
    },
    
    // Error actions
    setError: (key, error) => {
      dispatch({ type: ActionTypes.SET_ERROR, payload: { key, error } });
    },
    
    clearError: (key) => {
      dispatch({ type: ActionTypes.CLEAR_ERROR, payload: key });
    },
    
    // Settings actions
    updateSettings: (settings) => {
      dispatch({ type: ActionTypes.UPDATE_SETTINGS, payload: settings });
      localStorage.setItem('settings', JSON.stringify({ ...state.settings, ...settings }));
    }
  };

  // Initialize app on mount
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Load saved theme
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
          actions.setTheme(savedTheme);
        }
        
        // Load saved settings
        const savedSettings = localStorage.getItem('settings');
        if (savedSettings) {
          actions.updateSettings(JSON.parse(savedSettings));
        }
        
        // Check authentication
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');
        
        if (token && savedUser) {
          try {
            // Verify token is still valid
            await authApi.verifyToken();
            actions.setUser(JSON.parse(savedUser));
            actions.setAuthenticated(true);
          } catch (error) {
            console.warn('Token verification failed:', error);
            actions.logout();
          }
        }
      } catch (error) {
        console.error('App initialization failed:', error);
      } finally {
        actions.setAuthLoading(false);
      }
    };

    initializeApp();
  }, []);

  // Listen for auth logout events
  useEffect(() => {
    const handleAuthLogout = () => {
      actions.logout();
    };

    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, []);

  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
    </AppContext.Provider>
  );
}

// Custom hook to use the app context
export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

// Selector hooks for specific state slices
export function useAuth() {
  const { state, actions } = useApp();
  return {
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    authLoading: state.authLoading,
    authError: state.errors.auth,
    setUser: actions.setUser,
    setAuthenticated: actions.setAuthenticated,
    logout: actions.logout,
    clearAuthError: () => actions.clearError('auth')
  };
}

export function useNavigation() {
  const { state, actions } = useApp();
  return {
    currentPage: state.currentPage,
    sidebarOpen: state.sidebarOpen,
    setCurrentPage: actions.setCurrentPage,
    toggleSidebar: actions.toggleSidebar
  };
}

export function useTheme() {
  const { state, actions } = useApp();
  return {
    theme: state.theme,
    setTheme: actions.setTheme
  };
}

export default AppContext;
