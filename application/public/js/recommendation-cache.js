/**
 * Recommendation Cache Manager
 * Handles fetching, caching, and refreshing stock recommendations in local storage
 */

class RecommendationCache {
    constructor(options = {}) {
        this.cacheKey = options.cacheKey || 'stock_recommendations_cache';
        this.metaCacheKey = options.metaCacheKey || 'stock_cache_metadata';
        this.refreshInterval = options.refreshInterval || 5 * 60 * 1000; // 5 minutes
        this.maxRetries = options.maxRetries || 3;
        this.batchSize = options.batchSize || 50;
        this.maxCacheAge = options.maxCacheAge || 15 * 60 * 1000; // 15 minutes
        
        this.refreshTimer = null;
        this.currentFetchPromise = null;
        this.listeners = new Set();
        
        // Start periodic refresh
        this.startPeriodicRefresh();
        
        console.log('📦 RecommendationCache initialized with', {
            refreshInterval: this.refreshInterval / 1000 / 60 + ' minutes',
            batchSize: this.batchSize,
            maxCacheAge: this.maxCacheAge / 1000 / 60 + ' minutes'
        });
    }
    
    /**
     * Get all cached recommendations with fallback to API
     */
    async getAllRecommendations(options = {}) {
        const { forceRefresh = false, includeExpired = false } = options;
        
        // Check if we have fresh cached data
        const cachedData = this.getCachedData();
        const metadata = this.getCacheMetadata();
        
        if (!forceRefresh && cachedData && this.isCacheValid(metadata) || includeExpired) {
            console.log('📋 Using cached recommendations:', cachedData.length, 'items');
            return {
                recommendations: cachedData,
                cached: true,
                timestamp: metadata?.lastFetch,
                source: 'local_cache'
            };
        }
        
        // Need fresh data - fetch from API
        console.log('🔄 Cache miss or expired, fetching fresh recommendations...');
        return await this.fetchAndCache(options);
    }
    
    /**
     * Fetch ALL recommendations from API using multiple requests if needed
     */
    async fetchAndCache(options = {}) {
        // Prevent multiple concurrent fetches
        if (this.currentFetchPromise) {
            console.log('⏳ Fetch already in progress, waiting...');
            return await this.currentFetchPromise;
        }
        
        this.currentFetchPromise = this._performFetch(options);
        
        try {
            const result = await this.currentFetchPromise;
            return result;
        } finally {
            this.currentFetchPromise = null;
        }
    }
    
    async _performFetch(options = {}) {
        const { signal } = options;
        let allRecommendations = [];
        let retryCount = 0;
        
        while (retryCount < this.maxRetries) {
            try {
                console.log(`🌐 Fetching recommendations (attempt ${retryCount + 1}/${this.maxRetries})`);
                
                // Strategy 1: Try to fetch a large batch first
                const largeResponse = await this.fetchBatch({ 
                    limit: 100, 
                    signal,
                    includeMetrics: true 
                });
                
                if (largeResponse.recommendations && largeResponse.recommendations.length > 0) {
                    allRecommendations = largeResponse.recommendations;
                    console.log(`✅ Successfully fetched ${allRecommendations.length} recommendations in single request`);
                } else {
                    // Strategy 2: Use multiple smaller batches
                    console.log('📦 Large batch failed, trying multiple smaller batches...');
                    allRecommendations = await this.fetchMultipleBatches({ signal });
                }
                
                if (allRecommendations.length > 0) {
                    // Cache the results
                    this.cacheRecommendations(allRecommendations);
                    
                    // Notify listeners
                    this.notifyListeners({
                        type: 'cache_updated',
                        recommendations: allRecommendations,
                        count: allRecommendations.length
                    });
                    
                    console.log(`💾 Cached ${allRecommendations.length} recommendations successfully`);
                    
                    return {
                        recommendations: allRecommendations,
                        cached: false,
                        timestamp: new Date().toISOString(),
                        source: 'fresh_api',
                        count: allRecommendations.length
                    };
                }
                
                throw new Error('No recommendations received from any strategy');
                
            } catch (error) {
                retryCount++;
                console.warn(`⚠️ Fetch attempt ${retryCount} failed:`, error.message);
                
                if (retryCount < this.maxRetries) {
                    // Exponential backoff
                    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
                    console.log(`⏳ Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error('❌ All fetch attempts failed, using cached or fallback data');
                    
                    // Try to return expired cache as last resort
                    const expiredCache = this.getCachedData();
                    if (expiredCache && expiredCache.length > 0) {
                        console.log('🔄 Returning expired cache data as fallback');
                        return {
                            recommendations: expiredCache,
                            cached: true,
                            expired: true,
                            timestamp: this.getCacheMetadata()?.lastFetch,
                            source: 'expired_cache',
                            error: error.message
                        };
                    }
                    
                    throw new Error(`Failed to fetch recommendations after ${this.maxRetries} attempts: ${error.message}`);
                }
            }
        }
    }
    
    /**
     * Fetch a single batch of recommendations
     */
    async fetchBatch(options = {}) {
        const { limit = 50, signal, includeMetrics = false } = options;
        
        const url = new URL('/api/recommendations', window.location.origin);
        url.searchParams.set('limit', limit);
        
        if (includeMetrics) {
            url.searchParams.set('include_metrics', 'true');
        }
        
        const token = localStorage.getItem('authToken');
        const response = await fetch(url, {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            signal
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`📊 Batch fetch returned ${data.recommendations?.length || 0} recommendations`);
        
        return data;
    }
    
    /**
     * Fetch multiple batches with different parameters to get comprehensive coverage
     */
    async fetchMultipleBatches(options = {}) {
        const { signal } = options;
        const allRecommendations = new Map(); // Use Map to deduplicate by recommendation_id
        
        const batchConfigs = [
            { limit: 100, type: 'BUY' },
            { limit: 100, type: 'SELL' },
            { limit: 100, type: 'HOLD' },
            { limit: 100, risk: 'HIGH' },
            { limit: 100, risk: 'MEDIUM' },
            { limit: 100, risk: 'LOW' },
            { limit: 100, min_confidence: 0.7 },
            { limit: 100, min_confidence: 0.8 }
        ];
        
        const batchPromises = batchConfigs.map(async (config, index) => {
            try {
                const result = await this.fetchBatch({ ...config, signal });
                console.log(`📦 Batch ${index + 1} (${JSON.stringify(config)}): ${result.recommendations?.length || 0} items`);
                return result.recommendations || [];
            } catch (error) {
                console.warn(`⚠️ Batch ${index + 1} failed:`, error.message);
                return [];
            }
        });
        
        const results = await Promise.all(batchPromises);
        
        // Combine and deduplicate results
        results.forEach(batch => {
            if (Array.isArray(batch)) {
                batch.forEach(rec => {
                    if (rec && rec.recommendation_id) {
                        allRecommendations.set(rec.recommendation_id, rec);
                    }
                });
            }
        });
        
        const uniqueRecommendations = Array.from(allRecommendations.values());
        console.log(`🔀 Combined ${uniqueRecommendations.length} unique recommendations from ${batchConfigs.length} batches`);
        
        return uniqueRecommendations;
    }
    
    /**
     * Cache recommendations in local storage
     */
    cacheRecommendations(recommendations) {
        try {
            const cacheData = {
                recommendations: recommendations,
                count: recommendations.length,
                cached_at: new Date().toISOString()
            };
            
            const metadata = {
                lastFetch: new Date().toISOString(),
                count: recommendations.length,
                expires_at: new Date(Date.now() + this.maxCacheAge).toISOString(),
                version: '1.0'
            };
            
            localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
            localStorage.setItem(this.metaCacheKey, JSON.stringify(metadata));
            
            console.log('💾 Cache updated:', {
                count: recommendations.length,
                expires: metadata.expires_at
            });
            
        } catch (error) {
            console.error('❌ Failed to cache recommendations:', error);
            // If localStorage is full, try to clear old data
            if (error.name === 'QuotaExceededError') {
                this.clearOldCache();
                // Try again
                try {
                    localStorage.setItem(this.cacheKey, JSON.stringify({ recommendations, count: recommendations.length }));
                    localStorage.setItem(this.metaCacheKey, JSON.stringify(metadata));
                } catch (retryError) {
                    console.error('❌ Failed to cache even after cleanup:', retryError);
                }
            }
        }
    }
    
    /**
     * Get cached recommendations
     */
    getCachedData() {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            if (cached) {
                const data = JSON.parse(cached);
                return data.recommendations || [];
            }
        } catch (error) {
            console.warn('⚠️ Failed to parse cached data:', error);
            this.clearCache();
        }
        return null;
    }
    
    /**
     * Get cache metadata
     */
    getCacheMetadata() {
        try {
            const metadata = localStorage.getItem(this.metaCacheKey);
            return metadata ? JSON.parse(metadata) : null;
        } catch (error) {
            console.warn('⚠️ Failed to parse cache metadata:', error);
            return null;
        }
    }
    
    /**
     * Check if cache is still valid
     */
    isCacheValid(metadata) {
        if (!metadata || !metadata.expires_at) {
            return false;
        }
        
        const expiresAt = new Date(metadata.expires_at);
        const now = new Date();
        const isValid = now < expiresAt;
        
        if (!isValid) {
            console.log('⏰ Cache expired:', {
                expires: expiresAt.toISOString(),
                now: now.toISOString()
            });
        }
        
        return isValid;
    }
    
    /**
     * Start periodic refresh
     */
    startPeriodicRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        this.refreshTimer = setInterval(async () => {
            try {
                console.log('🔄 Periodic refresh starting...');
                await this.fetchAndCache({ forceRefresh: true });
            } catch (error) {
                console.warn('⚠️ Periodic refresh failed:', error.message);
            }
        }, this.refreshInterval);
        
        console.log(`⏰ Periodic refresh scheduled every ${this.refreshInterval / 1000 / 60} minutes`);
    }
    
    /**
     * Stop periodic refresh
     */
    stopPeriodicRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
            console.log('⏸️ Periodic refresh stopped');
        }
    }
    
    /**
     * Clear cache
     */
    clearCache() {
        localStorage.removeItem(this.cacheKey);
        localStorage.removeItem(this.metaCacheKey);
        console.log('🧹 Cache cleared');
    }
    
    /**
     * Clear old cache data to free up space
     */
    clearOldCache() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('old_') || key.includes('temp_') || key.includes('cache_'))) {
                keysToRemove.push(key);
            }
        }
        
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log(`🧹 Cleared ${keysToRemove.length} old cache entries`);
    }
    
    /**
     * Add event listener for cache updates
     */
    addEventListener(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
    
    /**
     * Notify listeners of cache events
     */
    notifyListeners(event) {
        this.listeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('❌ Error in cache listener:', error);
            }
        });
    }
    
    /**
     * Get cache statistics
     */
    getStats() {
        const metadata = this.getCacheMetadata();
        const cachedData = this.getCachedData();
        
        return {
            cached_count: cachedData ? cachedData.length : 0,
            last_fetch: metadata?.lastFetch,
            expires_at: metadata?.expires_at,
            is_valid: this.isCacheValid(metadata),
            cache_size_kb: this.getCacheSize(),
            refresh_interval_minutes: this.refreshInterval / 1000 / 60
        };
    }
    
    /**
     * Get approximate cache size in KB
     */
    getCacheSize() {
        try {
            const cacheData = localStorage.getItem(this.cacheKey);
            const metaData = localStorage.getItem(this.metaCacheKey);
            const totalSize = (cacheData?.length || 0) + (metaData?.length || 0);
            return Math.round(totalSize / 1024 * 100) / 100; // KB with 2 decimal places
        } catch (error) {
            return 0;
        }
    }
    
    /**
     * Cleanup when done
     */
    destroy() {
        this.stopPeriodicRefresh();
        this.listeners.clear();
        this.currentFetchPromise = null;
        console.log('💀 RecommendationCache destroyed');
    }
}

// Export for use in other modules
window.RecommendationCache = RecommendationCache;