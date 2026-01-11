/**
 * Improved API Service for React Frontend
 * Centralized API communication with error handling, caching, and retry logic
 */

class ApiService {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || '';
    this.timeout = 10000;
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    
    // Request interceptors
    this.requestInterceptors = [];
    this.responseInterceptors = [];
    
    // Add default request interceptor for auth
    this.addRequestInterceptor(this.addAuthHeader.bind(this));
    this.addResponseInterceptor(this.handleResponse.bind(this));
  }

  /**
   * Add request interceptor
   */
  addRequestInterceptor(interceptor) {
    this.requestInterceptors.push(interceptor);
  }

  /**
   * Add response interceptor
   */
  addResponseInterceptor(interceptor) {
    this.responseInterceptors.push(interceptor);
  }

  /**
   * Add authorization header to requests
   */
  addAuthHeader(config) {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    if (token) {
      config.headers = {
        ...config.headers,
        'Authorization': `Bearer ${token}`
      };
    }
    return config;
  }

  /**
   * Handle API responses and errors
   */
  async handleResponse(response) {
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.statusText = response.statusText;
      
      // Try to parse error response
      try {
        const errorData = await response.json();
        error.data = errorData;
        error.message = errorData.error || errorData.message || error.message;
      } catch (parseError) {
        // If parsing fails, use default error message
      }
      
      // Handle specific error cases
      if (response.status === 401) {
        this.handleUnauthorized();
      }
      
      throw error;
    }
    
    return response.json();
  }

  /**
   * Handle unauthorized responses
   */
  handleUnauthorized() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Dispatch custom event for components to listen to
    window.dispatchEvent(new CustomEvent('auth:logout'));
  }

  /**
   * Generate cache key
   */
  generateCacheKey(url, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.stringify(options.body) : '';
    return `${method}:${url}:${body}`;
  }

  /**
   * Check if cached response is valid
   */
  isCacheValid(cacheEntry) {
    return Date.now() - cacheEntry.timestamp < this.cacheTimeout;
  }

  /**
   * Make HTTP request with interceptors and error handling
   */
  async request(url, options = {}) {
    const fullUrl = url.startsWith('http') ? url : `${this.baseURL}${url}`;
    
    // Default configuration
    let config = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: this.timeout,
      ...options
    };

    // Apply request interceptors
    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config);
    }

    // Check cache for GET requests
    if (config.method === 'GET' && !config.skipCache) {
      const cacheKey = this.generateCacheKey(fullUrl, config);
      const cached = this.cache.get(cacheKey);
      
      if (cached && this.isCacheValid(cached)) {
        console.debug('Returning cached response for:', fullUrl);
        return cached.data;
      }
    }

    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);
      
      const response = await fetch(fullUrl, {
        ...config,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      // Apply response interceptors
      let processedResponse = response;
      for (const interceptor of this.responseInterceptors) {
        processedResponse = await interceptor(processedResponse);
      }

      // Cache GET responses
      if (config.method === 'GET' && !config.skipCache) {
        const cacheKey = this.generateCacheKey(fullUrl, config);
        this.cache.set(cacheKey, {
          data: processedResponse,
          timestamp: Date.now()
        });
      }

      return processedResponse;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  /**
   * Retry mechanism for failed requests
   */
  async retryRequest(requestFn, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on client errors (4xx)
        if (error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        if (attempt < maxRetries) {
          console.warn(`Request failed, retrying (${attempt}/${maxRetries}):`, error.message);
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
    }
    
    throw lastError;
  }

  /**
   * GET request
   */
  async get(url, options = {}) {
    return this.retryRequest(() => 
      this.request(url, { ...options, method: 'GET' })
    );
  }

  /**
   * POST request
   */
  async post(url, data, options = {}) {
    return this.retryRequest(() => 
      this.request(url, {
        ...options,
        method: 'POST',
        body: JSON.stringify(data)
      })
    );
  }

  /**
   * PUT request
   */
  async put(url, data, options = {}) {
    return this.retryRequest(() => 
      this.request(url, {
        ...options,
        method: 'PUT',
        body: JSON.stringify(data)
      })
    );
  }

  /**
   * DELETE request
   */
  async delete(url, options = {}) {
    return this.retryRequest(() => 
      this.request(url, { ...options, method: 'DELETE' })
    );
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
    console.debug('API cache cleared');
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

// Create singleton instance
const apiService = new ApiService();

// Stock-specific API methods
export const stockApi = {
  /**
   * Get stock recommendations
   */
  async getRecommendations(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) {params.append('limit', options.limit);}
    if (options.symbols) {params.append('symbols', options.symbols.join(','));}
    
    const url = `/api/recommendations${params.toString() ? `?${params}` : ''}`;
    return apiService.get(url);
  },

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics() {
    return apiService.get('/api/analytics/dashboard');
  },

  /**
   * Get stock price
   */
  async getStockPrice(symbol) {
    return apiService.get(`/api/stocks/${symbol}/price`);
  },

  /**
   * Get market summary
   */
  async getMarketSummary() {
    return apiService.get('/api/market/summary');
  }
};

// Auth-specific API methods
export const authApi = {
  /**
   * Login user
   */
  async login(credentials) {
    return apiService.post('/api/auth/login', credentials);
  },

  /**
   * Register user
   */
  async register(userData) {
    return apiService.post('/api/auth/register', userData);
  },

  /**
   * Verify token
   */
  async verifyToken() {
    return apiService.get('/api/auth/verify');
  },

  /**
   * Logout user
   */
  async logout() {
    return apiService.post('/api/auth/logout');
  }
};

// Portfolio-specific API methods
export const portfolioApi = {
  /**
   * Get user portfolios
   */
  async getPortfolios() {
    return apiService.get('/api/portfolios');
  },

  /**
   * Create portfolio
   */
  async createPortfolio(portfolioData) {
    return apiService.post('/api/portfolios', portfolioData);
  },

  /**
   * Update portfolio
   */
  async updatePortfolio(id, portfolioData) {
    return apiService.put(`/api/portfolios/${id}`, portfolioData);
  },

  /**
   * Delete portfolio
   */
  async deletePortfolio(id) {
    return apiService.delete(`/api/portfolios/${id}`);
  }
};

export default apiService;
