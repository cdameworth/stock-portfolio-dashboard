// Use backend API instead of direct external API calls
const API_BASE_URL = '';  // Use relative URLs to go through our backend

// Get auth token for backend API calls
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
};

export const stockApi = {
  // Stock Recommendations - use backend API
  getRecommendations: async () => {
    const response = await fetch(`${API_BASE_URL}/api/recommendations`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  getRecommendation: async (symbol) => {
    const response = await fetch(`${API_BASE_URL}/api/recommendations?symbol=${symbol}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  // AI Analytics - use backend API
  getDashboardAnalytics: async () => {
    const response = await fetch(`${API_BASE_URL}/api/analytics/dashboard`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  getDetailedAnalytics: async () => {
    const response = await fetch(`${API_BASE_URL}/api/analytics/detailed`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  getAnalyticsHistory: async () => {
    const response = await fetch(`${API_BASE_URL}/api/analytics/history`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  // AI Performance - use backend API (this is what's actually available)
  getAIPerformance: async (period = '1M') => {
    const response = await fetch(`${API_BASE_URL}/api/ai-performance/${period}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  },

  // Stock search - use backend API
  searchStocks: async (query) => {
    const response = await fetch(`${API_BASE_URL}/api/stocks/search?q=${encodeURIComponent(query)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }
};

export default stockApi;