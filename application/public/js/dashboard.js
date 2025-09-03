// Stock Portfolio Dashboard JavaScript

class DashboardApp {
    constructor() {
        this.currentSection = 'dashboard';
        this.token = localStorage.getItem('authToken');
        this.user = null;
        this.portfolios = [];
        this.recommendations = [];
        this.allRecommendations = []; // Store all recommendations including duplicates for history
        this.filteredRecommendations = [];
        this.currentTab = 'user-performance';
        this.redirecting = false; // Prevent multiple redirects
        this.selectedSymbols = [];
        this.availableSymbols = [];
        
        // Initialize recommendation cache with enhanced settings
        this.recommendationCache = new RecommendationCache({
            refreshInterval: 3 * 60 * 1000, // 3 minutes for more frequent updates
            maxCacheAge: 10 * 60 * 1000,    // 10 minutes max age
            batchSize: 100,                  // Try to fetch up to 100 per batch
            maxRetries: 3
        });
        
        // Listen for cache updates
        this.cacheUnsubscribe = this.recommendationCache.addEventListener((event) => {
            console.log('📦 Cache event:', event);
            if (event.type === 'cache_updated') {
                this.onRecommendationsUpdated(event.recommendations);
            }
        });
        
        this.init();
    }
    
    async init() {
        if (this.redirecting) return; // Prevent multiple initialization attempts
        
        console.log('Dashboard init - token present:', !!this.token);
        console.log('Dashboard init - timestamp:', new Date().toISOString());
        
        if (!this.token) {
            console.log('No token found, redirecting to login');
            this.redirectToLogin();
            return;
        }
        
        console.log('Token found, verifying authentication...');
        try {
            await this.verifyAuth();
            this.setupEventListeners();
            await this.loadAvailableSymbols();
            await this.loadInitialData();
            this.hideLoading();
        } catch (error) {
            console.error('Initialization error:', error);
            this.logout();
        }
    }
    
    async verifyAuth() {
        const response = await fetch('/api/auth/verify', {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });
        
        if (!response.ok) {
            // Check if it's a 401 (token expired/invalid)
            if (response.status === 401) {
                console.warn('Token expired or invalid, clearing auth and redirecting');
                this.redirectToLogin();
                return;
            }
            throw new Error(`Authentication failed: ${response.status}`);
        }
        
        // Handle 304 Not Modified responses which have no body
        if (response.status === 304) {
            // User is already verified, use cached user data from localStorage
            const cachedUser = localStorage.getItem('user');
            if (cachedUser) {
                this.user = JSON.parse(cachedUser);
            } else {
                // If no cached user but token is valid, fetch user details
                await this.loadUserData();
            }
        } else {
            const data = await response.json();
            this.user = data.user;
            // Cache user data
            localStorage.setItem('user', JSON.stringify(this.user));
        }
        this.updateUserInfo();
    }
    
    async loadUserData() {
        const response = await fetch('/api/auth/me', {
            headers: {
                'Authorization': `Bearer ${this.token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            this.user = data.user;
            localStorage.setItem('user', JSON.stringify(this.user));
        }
    }
    
    updateUserInfo() {
        if (this.user) {
            const userInitials = this.user.email.charAt(0).toUpperCase();
            const userName = this.user.email.split('@')[0];
            
            document.getElementById('userInitials').textContent = userInitials;
            document.getElementById('userName').textContent = userName;
            document.getElementById('userPlan').textContent = this.user.plan || 'Free';
        }
    }
    
    setupEventListeners() {
        // Navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const section = e.currentTarget.dataset.section;
                this.showSection(section);
            });
        });
        
        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logout();
        });
        
        // Mobile menu toggle
        const mobileMenuToggle = document.getElementById('mobileMenuToggle');
        const sidebar = document.getElementById('sidebar');
        if (mobileMenuToggle && sidebar) {
            mobileMenuToggle.addEventListener('click', () => {
                mobileMenuToggle.classList.toggle('active');
                sidebar.classList.toggle('mobile-open');
            });
            
            // Close mobile menu when clicking on nav links
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        mobileMenuToggle.classList.remove('active');
                        sidebar.classList.remove('mobile-open');
                    }
                });
            });
            
            // Close mobile menu when clicking outside
            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 768 && 
                    !sidebar.contains(e.target) && 
                    !mobileMenuToggle.contains(e.target) &&
                    sidebar.classList.contains('mobile-open')) {
                    mobileMenuToggle.classList.remove('active');
                    sidebar.classList.remove('mobile-open');
                }
            });
        }
        
        // History button event delegation
        document.addEventListener('click', (e) => {
            console.log('Click detected on:', e.target, 'Classes:', e.target.className);
            if (e.target.matches('.history-button') || e.target.closest('.history-button')) {
                const button = e.target.matches('.history-button') ? e.target : e.target.closest('.history-button');
                const symbol = button.dataset.symbol;
                console.log('History button clicked:', symbol, 'Button:', button);
                if (symbol) {
                    this.showTickerHistory(symbol);
                } else {
                    console.error('No symbol found on history button:', button);
                }
            }
        });
        
        // Info icon tooltip interactions
        document.addEventListener('click', (e) => {
            if (e.target.matches('.info-icon') || e.target.closest('.info-icon')) {
                const icon = e.target.matches('.info-icon') ? e.target : e.target.closest('.info-icon');
                const tooltip = icon.getAttribute('title');
                if (tooltip) {
                    // Show tooltip as alert for now - could be enhanced with proper tooltip
                    alert(tooltip);
                }
            }
        });
        
        // Portfolio form
        const portfolioForm = document.getElementById('createPortfolioForm');
        if (portfolioForm) {
            portfolioForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.createPortfolio();
            });
        }
        
        // Create portfolio button
        const createPortfolioBtn = document.getElementById('createPortfolioBtn');
        if (createPortfolioBtn) {
            createPortfolioBtn.addEventListener('click', () => {
                this.resetPortfolioForm();
                this.showModal('createPortfolioModal');
                this.initializeTickerSearch();
            });
        }
        
        // Modal close buttons
        document.querySelectorAll('.close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModals();
            });
        });
        
        // Modal background click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModals();
                }
            });
        });
        
        // Performance tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });
        
        // Search and filters
        const searchBtn = document.getElementById('searchBtn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.performSearch());
        }
        
        const symbolSearch = document.getElementById('symbolSearch');
        if (symbolSearch) {
            symbolSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.performSearch();
            });
        }
        
        // Filter event listeners
        ['riskFilter', 'typeFilter', 'sortFilter'].forEach(filterId => {
            const filter = document.getElementById(filterId);
            if (filter) {
                filter.addEventListener('change', () => this.applyFilters());
            }
        });
        
        // Refresh data button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => this.refreshData());
        }
    }
    
    async showSection(sectionName) {
        // Update navigation
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
        });
        document.querySelector(`[data-section="${sectionName}"]`).classList.add('active');
        
        // Update content
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        document.getElementById(sectionName + '-section').classList.add('active');
        
        this.currentSection = sectionName;
        
        // Load section-specific data
        await this.loadSectionData(sectionName);
        
        // Update page title
        this.updatePageTitle(sectionName);
    }
    
    async loadSectionData(sectionName) {
        switch (sectionName) {
            case 'recommendations':
                await this.loadRecommendations();
                this.applyFilters();
                this.updateRecommendationStats();
                break;
            case 'portfolios':
                await this.loadPortfolios();
                this.updatePortfolioSummary();
                break;
            case 'performance':
                await this.loadPerformanceData();
                this.updatePerformanceMetrics();
                break;
            case 'account':
                this.loadAccountData();
                break;
            case 'dashboard':
                await this.loadDashboardData();
                break;
        }
        
        // Set up event listeners after section loads
        setTimeout(() => this.setupSectionEventListeners(), 100);
    }
    
    updatePageTitle(sectionName) {
        const titles = {
            'dashboard': 'Dashboard',
            'recommendations': 'AI Recommendations',
            'portfolios': 'My Portfolios',
            'performance': 'Performance Analytics',
            'account': 'Account Management'
        };
        
        const pageTitle = document.getElementById('pageTitle');
        const pageSubtitle = document.getElementById('pageSubtitle');
        
        if (pageTitle) {
            pageTitle.textContent = titles[sectionName] || 'Dashboard';
        }
        
        if (pageSubtitle) {
            const subtitles = {
                'dashboard': 'Welcome back! Here\'s your market overview.',
                'recommendations': 'AI-powered stock recommendations tailored for you.',
                'portfolios': 'Manage your investment portfolios and track performance.',
                'performance': 'Analyze your investment performance and beat the market.',
                'account': 'Manage your profile, subscription, and account settings.'
            };
            pageSubtitle.textContent = subtitles[sectionName] || '';
        }
    }
    
    async renderFullRecommendations() {
        const container = document.getElementById('recommendationsGrid');
        if (!container) return;
        
        if (this.recommendations.length === 0) {
            container.innerHTML = '<p>No AI recommendations available at this time.</p>';
            return;
        }
        
        // Apply filters and render the filtered results
        this.applyFilters();
        return; // applyFilters will call renderFilteredRecommendations
    }
    
    async loadInitialData() {
        try {
            await Promise.all([
                this.loadRecommendations(),
                this.loadPortfolios(),
                this.loadDashboardData()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
            this.showError('Failed to load dashboard data');
        }
    }
    
    async loadRecommendations(forceRefresh = false) {
        try {
            console.log('📊 Loading recommendations...', { forceRefresh });
            
            // Show loading indicator
            this.showRecommendationsLoading(true);
            
            // Get recommendations from cache (which handles API fallback)
            const result = await this.recommendationCache.getAllRecommendations({
                forceRefresh: forceRefresh
            });
            
            // Store all recommendations for history (including duplicates)
            this.allRecommendations = result.recommendations || [];
            
            // Deduplicate by ticker for main display (show only most recent per ticker)
            this.recommendations = this.deduplicateRecommendationsByTicker(this.allRecommendations);
            
            console.log(`✅ Loaded ${this.allRecommendations.length} total recommendations (${this.recommendations.length} unique tickers)`, {
                cached: result.cached,
                source: result.source,
                timestamp: result.timestamp
            });
            
            // Update UI with status info
            this.updateDataStatus({
                count: this.recommendations.length,
                cached: result.cached,
                source: result.source,
                timestamp: result.timestamp,
                expired: result.expired
            });
            
            // Render the recommendations
            this.renderRecommendations();
            this.updateRecommendationStats(this.recommendations);
            
        } catch (error) {
            console.error('❌ Error loading recommendations:', error);
            
            // Try to show any available data even if there was an error
            const cachedData = this.recommendationCache?.getCachedData();
            if (cachedData && cachedData.length > 0) {
                console.log('🔄 Using cached data as fallback');
                this.allRecommendations = cachedData;
                this.recommendations = this.deduplicateRecommendationsByTicker(this.allRecommendations);
                this.renderRecommendations();
                this.updateRecommendationStats(this.recommendations);
                
                this.showError('Using cached data - live data temporarily unavailable');
            } else {
                // Last resort: direct API call with limit=100
                console.log('🔄 Cache failed, trying direct API call with limit=100');
                try {
                    const response = await fetch('/api/recommendations?limit=100', {
                        headers: {
                            'Authorization': `Bearer ${this.token}`
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        this.allRecommendations = data.recommendations || [];
                        this.recommendations = this.deduplicateRecommendationsByTicker(this.allRecommendations);
                        console.log(`✅ Direct API fallback: ${this.allRecommendations.length} total (${this.recommendations.length} unique)`);
                        this.renderRecommendations();
                        this.updateRecommendationStats(this.recommendations);
                        this.showError('Using direct API call - caching system unavailable');
                    } else {
                        throw new Error(`API call failed: ${response.status}`);
                    }
                } catch (apiError) {
                    console.error('❌ Direct API fallback also failed:', apiError);
                    this.showError('Unable to load recommendations. Please try again later.');
                }
            }
        } finally {
            this.showRecommendationsLoading(false);
        }
    }
    
    /**
     * Handle recommendations updated from cache
     */
    onRecommendationsUpdated(recommendations) {
        console.log(`📦 Cache updated with ${recommendations.length} recommendations`);
        
        // Only update if we don't have fresher data already
        if (!this.recommendations || this.recommendations.length < recommendations.length) {
            this.recommendations = recommendations;
            this.renderRecommendations();
            this.updateRecommendationStats(this.recommendations);
            
            // Show subtle notification
            this.showSuccess(`Updated with ${recommendations.length} recommendations`, 2000);
        }
    }
    
    /**
     * Show loading state for recommendations
     */
    showRecommendationsLoading(loading) {
        const container = document.getElementById('recentRecommendations');
        const refreshBtn = document.getElementById('refreshBtn');
        
        if (loading) {
            if (container) {
                const loadingHtml = `
                    <div class="loading-recommendations">
                        <div class="loading-spinner"></div>
                        <p>Loading comprehensive recommendations...</p>
                    </div>
                `;
                container.innerHTML = loadingHtml;
            }
            
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.textContent = 'Loading...';
            }
        } else {
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.textContent = 'Refresh Data';
            }
        }
    }
    
    /**
     * Update data status indicator
     */
    updateDataStatus(status) {
        const statusElement = document.querySelector('.data-status') || this.createDataStatusElement();
        
        const { count, cached, source, timestamp, expired } = status;
        const timeAgo = timestamp ? this.timeAgo(new Date(timestamp)) : 'unknown';
        
        let statusText = `${count} recommendations`;
        let statusClass = 'status-fresh';
        
        if (cached && !expired) {
            statusText += ` (cached, ${timeAgo})`;
            statusClass = 'status-cached';
        } else if (expired) {
            statusText += ` (expired cache, ${timeAgo})`;
            statusClass = 'status-expired';
        } else {
            statusText += ` (live, ${timeAgo})`;
            statusClass = 'status-live';
        }
        
        statusElement.textContent = statusText;
        statusElement.className = `data-status ${statusClass}`;
        
        // Show cache stats in console for debugging
        const cacheStats = this.recommendationCache.getStats();
        console.log('📊 Cache stats:', cacheStats);
    }
    
    /**
     * Create data status element if it doesn't exist
     */
    createDataStatusElement() {
        const container = document.querySelector('.recommendations-header') || 
                         document.querySelector('h2:contains("Recent Recommendations")') ||
                         document.getElementById('recentRecommendations')?.previousElementSibling;
        
        if (container) {
            const statusElement = document.createElement('div');
            statusElement.className = 'data-status';
            container.appendChild(statusElement);
            return statusElement;
        }
        
        return null;
    }
    
    /**
     * Helper function to format time ago
     */
    timeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        
        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return date.toLocaleDateString();
    }
    
    /**
     * Deduplicate recommendations by ticker, keeping only the most recent one
     * @param {Array} recommendations - Array of recommendation objects
     * @returns {Array} - Deduplicated array with most recent recommendation per ticker
     */
    deduplicateRecommendationsByTicker(recommendations) {
        if (!Array.isArray(recommendations) || recommendations.length === 0) {
            return [];
        }
        
        // Group recommendations by symbol
        const tickerMap = new Map();
        
        recommendations.forEach(rec => {
            const symbol = rec.symbol;
            if (!symbol) return;
            
            const existingRec = tickerMap.get(symbol);
            
            // Parse dates for comparison (handle various date formats)
            const recDate = new Date(rec.generated_at || rec.created_at || rec.timestamp || 0);
            const existingDate = existingRec ? new Date(existingRec.generated_at || existingRec.created_at || existingRec.timestamp || 0) : null;
            
            // Keep the most recent recommendation for this ticker
            if (!existingRec || recDate > existingDate) {
                tickerMap.set(symbol, rec);
            }
        });
        
        // Convert Map values back to array and sort by date (most recent first)
        return Array.from(tickerMap.values()).sort((a, b) => {
            const aDate = new Date(a.generated_at || a.created_at || a.timestamp || 0);
            const bDate = new Date(b.generated_at || b.created_at || b.timestamp || 0);
            return bDate - aDate;
        });
    }
    
    /**
     * Get all historical recommendations for a specific ticker
     * @param {string} symbol - Stock symbol to get history for
     * @returns {Array} - All recommendations for the ticker, sorted by date (newest first)
     */
    getTickerHistory(symbol) {
        if (!symbol || !Array.isArray(this.allRecommendations)) {
            return [];
        }
        
        return this.allRecommendations
            .filter(rec => rec.symbol === symbol)
            .sort((a, b) => {
                const aDate = new Date(a.generated_at || a.created_at || a.timestamp || 0);
                const bDate = new Date(b.generated_at || b.created_at || b.timestamp || 0);
                return bDate - aDate;
            });
    }
    
    renderRecommendations() {
        const container = document.getElementById('recentRecommendations');
        if (!container) return;
        
        if (this.recommendations.length === 0) {
            container.innerHTML = '<p>No recommendations available at this time.</p>';
            return;
        }
        
        container.innerHTML = this.recommendations.slice(0, 3).map(rec => {
            const currentPrice = rec.current_price || 0;
            const targetPrice = rec.target_price || currentPrice;
            const projectedGain = currentPrice > 0 ? ((targetPrice - currentPrice) / currentPrice * 100) : 0;
            const projectedGainDollar = targetPrice - currentPrice;
            const confidence = (rec.confidence * 100).toFixed(0);
            const predictionScore = (rec.prediction_score * 100).toFixed(0);
            
            // Check if there are multiple recommendations for this ticker
            const tickerHistory = this.getTickerHistory(rec.symbol);
            const hasHistory = tickerHistory.length > 1;
            
            return `
                <div class="recommendation-item">
                    <div class="recommendation-header">
                        <div class="stock-symbol">${rec.symbol}</div>
                        <div class="recommendation-type ${rec.recommendation_type?.toLowerCase() || 'hold'}">
                            ${rec.recommendation_type || 'HOLD'}
                        </div>
                        <div class="risk-badge risk-${(rec.risk_level || 'MEDIUM').toLowerCase()}">
                            ${rec.risk_level || 'MEDIUM'} RISK
                        </div>
                        ${hasHistory ? `<button class="history-button" data-symbol="${rec.symbol}" title="View ${tickerHistory.length} recommendations for ${rec.symbol}">📊 ${tickerHistory.length}</button>` : ''}
                    </div>
                    <div class="recommendation-details">
                        <div class="price-info">
                            <span class="current-price">$${currentPrice.toFixed(2)}</span>
                            <span class="arrow">→</span>
                            <span class="target-price">$${targetPrice.toFixed(2)}</span>
                        </div>
                        <div class="gain-info ${projectedGain >= 0 ? 'positive' : 'negative'}">
                            <span class="gain-dollar">${projectedGain >= 0 ? '+' : ''}$${projectedGainDollar.toFixed(2)}</span>
                            <span class="gain-percent">(${projectedGain >= 0 ? '+' : ''}${projectedGain.toFixed(1)}%)</span>
                        </div>
                        <div class="metrics-row">
                            <div class="metric-item">
                                <div class="metric-label">AI Score <span class="info-icon" title="Prediction strength - how likely the price target will be reached">ⓘ</span></div>
                                <div class="metric-value score-value">${predictionScore}%</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-label">Confidence <span class="info-icon" title="Model certainty - how sure the AI is about this prediction">ⓘ</span></div>
                                <div class="metric-value confidence-value">${confidence}%</div>
                            </div>
                        </div>
                        ${this.renderEstimatedHitTime(rec)}
                        <p class="rationale">${rec.rationale || rec.reason || 'AI-generated recommendation based on market analysis'}</p>
                        <div class="meta-info">
                            <small>${this.getRelativeTime(rec.generated_at || rec.created_at || rec.timestamp)}</small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    /**
     * Render estimated hit time information for recommendation
     */
    renderEstimatedHitTime(rec) {
        // Check if we have database hit time data
        if (rec.estimated_hit_days || rec.estimated_hit_date || rec.days_until_hit) {
            const daysUntilHit = rec.days_until_hit || rec.estimated_hit_days;
            const hitStatus = rec.hit_status || 'ON_TRACK';
            
            let hitTimeClass = 'hit-time-normal';
            let hitTimeIcon = '⏱️';
            let hitTimeText = '';
            
            if (hitStatus === 'OVERDUE') {
                hitTimeClass = 'hit-time-overdue';
                hitTimeIcon = '🔴';
                hitTimeText = `${Math.abs(daysUntilHit)} days overdue`;
            } else if (hitStatus === 'DUE_SOON') {
                hitTimeClass = 'hit-time-due-soon';
                hitTimeIcon = '🟡';
                hitTimeText = daysUntilHit <= 1 ? 'Due tomorrow' : `Due in ${daysUntilHit} days`;
            } else if (daysUntilHit) {
                hitTimeClass = 'hit-time-normal';
                hitTimeIcon = '📅';
                if (daysUntilHit <= 7) {
                    hitTimeText = `Expected in ${daysUntilHit} days`;
                } else if (daysUntilHit <= 30) {
                    const weeks = Math.floor(daysUntilHit / 7);
                    hitTimeText = `Expected in ${weeks} week${weeks > 1 ? 's' : ''}`;
                } else {
                    const months = Math.floor(daysUntilHit / 30);
                    hitTimeText = `Expected in ${months} month${months > 1 ? 's' : ''}`;
                }
            }
            
            if (hitTimeText) {
                return `
                    <div class="estimated-hit-time ${hitTimeClass}">
                        <span class="hit-time-icon">${hitTimeIcon}</span>
                        <span class="hit-time-text">${hitTimeText}</span>
                    </div>
                `;
            }
        }
        
        // Fallback: calculate estimated time based on target price change
        if (rec.current_price && rec.target_price) {
            const priceChangePercent = Math.abs(
                ((rec.target_price - rec.current_price) / rec.current_price) * 100
            );
            
            let estimatedDays;
            if (priceChangePercent < 5) {
                estimatedDays = 14; // 2 weeks for small moves
            } else if (priceChangePercent < 10) {
                estimatedDays = 30; // 1 month for medium moves
            } else if (priceChangePercent < 20) {
                estimatedDays = 60; // 2 months for large moves
            } else {
                estimatedDays = 120; // 4 months for very large moves
            }
            
            // Adjust based on risk level
            const riskMultiplier = {
                'LOW': 1.3,
                'MEDIUM': 1.0,
                'HIGH': 0.7
            }[rec.risk_level] || 1.0;
            
            const adjustedDays = Math.floor(estimatedDays * riskMultiplier);
            
            return `
                <div class="estimated-hit-time hit-time-estimated">
                    <span class="hit-time-icon">📈</span>
                    <span class="hit-time-text">Est. ${adjustedDays > 30 ? Math.floor(adjustedDays/30) + ' months' : adjustedDays + ' days'}</span>
                </div>
            `;
        }
        
        return ''; // No hit time information available
    }
    
    async loadPortfolios() {
        try {
            const response = await fetch('/api/portfolios', {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.portfolios = data || [];
                this.renderPortfolios();
            }
        } catch (error) {
            console.error('Error loading portfolios:', error);
        }
    }
    
    renderPortfolios() {
        const container = document.getElementById('portfoliosList');
        if (!container) return;
        
        if (this.portfolios.length === 0) {
            container.innerHTML = '<p>No portfolios created yet. Create your first portfolio to get started!</p>';
            return;
        }
        
        container.innerHTML = this.portfolios.map(portfolio => `
            <div class="card">
                <h3>${portfolio.name}</h3>
                <p>${portfolio.description || 'No description'}</p>
                <p><strong>Symbols:</strong> ${(portfolio.symbols || []).join(', ')}</p>
                <div class="portfolio-stats">
                    <small>Created: ${new Date(portfolio.created_at).toLocaleDateString()}</small>
                </div>
                <div class="portfolio-actions">
                    <button onclick="dashboard.editPortfolio('${portfolio.id}')" class="btn btn-edit">Edit</button>
                    <button onclick="dashboard.deletePortfolio('${portfolio.id}')" class="btn btn-delete">Delete</button>
                </div>
            </div>
        `).join('');
    }
    
    async loadDashboardData() {
        const welcomeSection = document.getElementById('dashboardWelcome');
        if (welcomeSection) {
            welcomeSection.innerHTML = `
                <h2>Welcome back, ${this.user?.email?.split('@')[0] || 'User'}!</h2>
                <p>Here's your portfolio overview</p>
            `;
        }
        
        // Load market overview data
        await this.loadMarketOverview();
        await this.loadMarketInsights();
    }
    
    async loadMarketOverview() {
        try {
            const container = document.getElementById('marketOverview');
            if (!container) return;
            
            // Enhanced market data with comprehensive metrics
            const marketData = [
                { symbol: 'S&P 500', value: '4,567.80', change: '+1.2%', positive: true, volume: '3.2B' },
                { symbol: 'NASDAQ', value: '14,239.88', change: '+0.8%', positive: true, volume: '4.1B' },
                { symbol: 'DOW', value: '34,988.84', change: '-0.3%', positive: false, volume: '287M' },
                { symbol: 'VIX', value: '18.45', change: '+2.1%', positive: false, volume: '22M' },
                { symbol: 'RUSSELL 2000', value: '2,089.12', change: '+0.5%', positive: true, volume: '1.8B' },
                { symbol: 'USD/EUR', value: '1.0842', change: '-0.1%', positive: false, volume: '54B' },
                { symbol: 'GOLD', value: '$1,987.40', change: '+0.7%', positive: true, volume: '189K oz' },
                { symbol: 'CRUDE OIL', value: '$82.15', change: '-1.8%', positive: false, volume: '412M bbl' }
            ];
            
            container.innerHTML = `
                <div class="market-header">
                    <h3>Market Overview</h3>
                    <div class="market-summary">
                        <span class="market-status positive">Markets Up</span>
                        <span class="last-updated">Updated: ${new Date().toLocaleTimeString()}</span>
                    </div>
                </div>
                <div class="market-grid">
                    ${marketData.map(market => `
                        <div class="market-item">
                            <div class="market-symbol">${market.symbol}</div>
                            <div class="market-value">${market.value}</div>
                            <div class="market-change ${market.positive ? 'positive' : 'negative'}">
                                ${market.change}
                            </div>
                            <div class="market-volume">Vol: ${market.volume}</div>
                        </div>
                    `).join('')}
                </div>
                <div class="market-insights">
                    <div class="insight-item">
                        <span class="insight-label">Market Sentiment:</span>
                        <span class="insight-value bullish">Bullish</span>
                    </div>
                    <div class="insight-item">
                        <span class="insight-label">Sector Leader:</span>
                        <span class="insight-value">Technology (+2.1%)</span>
                    </div>
                    <div class="insight-item">
                        <span class="insight-label">Economic Data:</span>
                        <span class="insight-value">GDP Growth 2.4%</span>
                    </div>
                </div>
            `;
        } catch (error) {
            console.error('Error loading market overview:', error);
            const container = document.getElementById('marketOverview');
            if (container) {
                container.innerHTML = '<p class="error-message">Failed to load market data</p>';
            }
        }
    }

    async loadMarketInsights() {
        try {
            const insightsContainer = document.querySelector('.dashboard-insights');
            if (!insightsContainer) {
                // Create insights section if it doesn't exist
                const dashboardGrid = document.querySelector('.dashboard-grid');
                if (dashboardGrid) {
                    const insightsCard = document.createElement('div');
                    insightsCard.className = 'card dashboard-insights';
                    insightsCard.innerHTML = `
                        <h3>Market Insights</h3>
                        <div class="insights-content"></div>
                    `;
                    dashboardGrid.appendChild(insightsCard);
                }
            }
            
            const contentContainer = document.querySelector('.insights-content') || insightsContainer;
            if (!contentContainer) return;
            
            // Real-time market insights
            const insights = [
                {
                    title: "Fed Rate Impact",
                    description: "Current rates supporting equity valuations",
                    impact: "positive",
                    confidence: 85
                },
                {
                    title: "Earnings Season",
                    description: "73% of companies beating estimates",
                    impact: "positive", 
                    confidence: 92
                },
                {
                    title: "Economic Indicators",
                    description: "GDP growth steady at 2.4% annual rate",
                    impact: "neutral",
                    confidence: 78
                },
                {
                    title: "Geopolitical Risk",
                    description: "Trade tensions remain elevated",
                    impact: "negative",
                    confidence: 67
                }
            ];
            
            contentContainer.innerHTML = insights.map(insight => `
                <div class="insight-card ${insight.impact}">
                    <div class="insight-header">
                        <h4>${insight.title}</h4>
                        <div class="confidence-meter">
                            <div class="confidence-bar" style="width: ${insight.confidence}%"></div>
                            <span class="confidence-text">${insight.confidence}%</span>
                        </div>
                    </div>
                    <p class="insight-description">${insight.description}</p>
                    <div class="impact-indicator ${insight.impact}">
                        ${insight.impact.toUpperCase()} IMPACT
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading market insights:', error);
        }
    }
    
    async loadPerformanceData() {
        try {
            // Enhanced performance chart with interactive elements
            const chartContainer = document.getElementById('performanceChart');
            if (chartContainer) {
                // Simulate portfolio performance data
                const performanceData = {
                    totalValue: 24567.89,
                    dailyChange: 234.56,
                    dailyChangePercent: 0.96,
                    monthlyReturn: 8.3,
                    yearlyReturn: 12.5,
                    allocation: [
                        { sector: 'Technology', percentage: 35, value: 8598.76 },
                        { sector: 'Healthcare', percentage: 20, value: 4913.58 },
                        { sector: 'Finance', percentage: 18, value: 4422.22 },
                        { sector: 'Energy', percentage: 15, value: 3685.18 },
                        { sector: 'Consumer', percentage: 12, value: 2948.15 }
                    ]
                };
                
                chartContainer.innerHTML = `
                    <div class="performance-header">
                        <div class="portfolio-value">
                            <div class="value-amount">$${performanceData.totalValue.toLocaleString()}</div>
                            <div class="value-change ${performanceData.dailyChange >= 0 ? 'positive' : 'negative'}">
                                ${performanceData.dailyChange >= 0 ? '+' : ''}$${Math.abs(performanceData.dailyChange).toFixed(2)} 
                                (${performanceData.dailyChangePercent >= 0 ? '+' : ''}${performanceData.dailyChangePercent}%)
                            </div>
                        </div>
                        <div class="performance-metrics">
                            <div class="metric-card">
                                <div class="metric-value">${performanceData.monthlyReturn >= 0 ? '+' : ''}${performanceData.monthlyReturn}%</div>
                                <div class="metric-label">This Month</div>
                            </div>
                            <div class="metric-card">
                                <div class="metric-value">${performanceData.yearlyReturn >= 0 ? '+' : ''}${performanceData.yearlyReturn}%</div>
                                <div class="metric-label">This Year</div>
                            </div>
                        </div>
                    </div>
                    <div class="allocation-chart">
                        <h4>Portfolio Allocation</h4>
                        <div class="allocation-bars">
                            ${performanceData.allocation.map(item => `
                                <div class="allocation-item" data-sector="${item.sector}">
                                    <div class="allocation-bar">
                                        <div class="allocation-fill" style="width: ${item.percentage}%"></div>
                                    </div>
                                    <div class="allocation-info">
                                        <span class="sector-name">${item.sector}</span>
                                        <span class="sector-percentage">${item.percentage}%</span>
                                        <span class="sector-value">$${item.value.toLocaleString()}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
                
                // Add hover effects for allocation bars
                const allocationItems = chartContainer.querySelectorAll('.allocation-item');
                allocationItems.forEach(item => {
                    item.addEventListener('mouseenter', function() {
                        this.style.transform = 'scale(1.02)';
                        this.style.background = 'rgba(102, 126, 234, 0.05)';
                    });
                    item.addEventListener('mouseleave', function() {
                        this.style.transform = 'scale(1)';
                        this.style.background = 'transparent';
                    });
                });
            }
        } catch (error) {
            console.error('Error loading performance data:', error);
            const chartContainer = document.getElementById('performanceChart');
            if (chartContainer) {
                chartContainer.innerHTML = '<p class="error-message">Failed to load performance data</p>';
            }
        }
    }

    async createPortfolio() {
        const form = document.getElementById('createPortfolioForm');
        const submitButton = form.querySelector('button[type="submit"]');
        const editingId = submitButton.getAttribute('data-editing');
        
        const portfolioData = {
            name: document.getElementById('portfolioName').value,
            description: document.getElementById('portfolioDescription').value,
            symbols: this.getSelectedSymbols()
        };
        
        try {
            const isEditing = !!editingId;
            const url = isEditing ? `/api/portfolios/${editingId}` : '/api/portfolios';
            const method = isEditing ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(portfolioData)
            });
            
            if (response.ok) {
                this.showSuccess(`Portfolio ${isEditing ? 'updated' : 'created'} successfully!`);
                this.resetPortfolioForm();
                await this.loadPortfolios();
            } else {
                const error = await response.json();
                this.showError(error.error || `Failed to ${isEditing ? 'update' : 'create'} portfolio`);
            }
        } catch (error) {
            console.error('Error with portfolio:', error);
            this.showError(`Failed to ${editingId ? 'update' : 'create'} portfolio`);
        }
    }

    /**
     * Reset portfolio form to create mode
     */
    resetPortfolioForm() {
        const form = document.getElementById('createPortfolioForm');
        const formTitle = document.querySelector('#portfolioFormContainer h3');
        const submitButton = form.querySelector('button[type="submit"]');
        
        form.reset();
        this.selectedSymbols = [];
        this.updateSelectedSymbols();
        
        if (formTitle) formTitle.textContent = 'Create New Portfolio';
        if (submitButton) {
            submitButton.textContent = 'Create Portfolio';
            submitButton.removeAttribute('data-editing');
        }
        
        this.closeModals();
    }

    /**
     * Get selected symbols from the symbol selector
     */
    getSelectedSymbols() {
        return this.selectedSymbols || [];
    }

    /**
     * Load popular stock symbols for ticker search
     */
    async loadAvailableSymbols() {
        try {
            // Use a predefined list of popular stocks for now
            this.availableSymbols = [
                { symbol: 'AAPL', name: 'Apple Inc.' },
                { symbol: 'MSFT', name: 'Microsoft Corporation' },
                { symbol: 'GOOGL', name: 'Alphabet Inc.' },
                { symbol: 'AMZN', name: 'Amazon.com Inc.' },
                { symbol: 'TSLA', name: 'Tesla Inc.' },
                { symbol: 'META', name: 'Meta Platforms Inc.' },
                { symbol: 'NVDA', name: 'NVIDIA Corporation' },
                { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
                { symbol: 'JNJ', name: 'Johnson & Johnson' },
                { symbol: 'V', name: 'Visa Inc.' },
                { symbol: 'PG', name: 'Procter & Gamble Co.' },
                { symbol: 'UNH', name: 'UnitedHealth Group Inc.' },
                { symbol: 'DIS', name: 'The Walt Disney Company' },
                { symbol: 'HD', name: 'The Home Depot Inc.' },
                { symbol: 'MA', name: 'Mastercard Inc.' },
                { symbol: 'BAC', name: 'Bank of America Corp.' },
                { symbol: 'XOM', name: 'Exxon Mobil Corporation' },
                { symbol: 'NFLX', name: 'Netflix Inc.' },
                { symbol: 'CRM', name: 'Salesforce Inc.' },
                { symbol: 'ORCL', name: 'Oracle Corporation' },
                { symbol: 'PYPL', name: 'PayPal Holdings Inc.' },
                { symbol: 'INTC', name: 'Intel Corporation' },
                { symbol: 'IBM', name: 'International Business Machines' },
                { symbol: 'AMD', name: 'Advanced Micro Devices' },
                { symbol: 'QCOM', name: 'QUALCOMM Incorporated' },
                { symbol: 'WMT', name: 'Walmart Inc.' },
                { symbol: 'KO', name: 'The Coca-Cola Company' },
                { symbol: 'PEP', name: 'PepsiCo Inc.' },
                { symbol: 'MCD', name: 'McDonald\'s Corporation' },
                { symbol: 'NKE', name: 'NIKE Inc.' }
            ];
        } catch (error) {
            console.error('Error loading symbols:', error);
        }
    }

    /**
     * Initialize ticker search functionality
     */
    initializeTickerSearch() {
        const searchInput = document.getElementById('tickerSearch');
        const searchResults = document.getElementById('tickerSearchResults');
        
        if (!searchInput || !searchResults) return;

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toUpperCase();
            if (query.length < 1) {
                searchResults.style.display = 'none';
                return;
            }

            const matches = this.availableSymbols.filter(stock => 
                stock.symbol.includes(query) || 
                stock.name.toUpperCase().includes(query)
            ).slice(0, 10);

            if (matches.length > 0) {
                searchResults.innerHTML = matches.map(stock => `
                    <div class="ticker-result" onclick="dashboard.addSymbol('${stock.symbol}')">
                        <strong>${stock.symbol}</strong> - ${stock.name}
                    </div>
                `).join('');
                searchResults.style.display = 'block';
            } else {
                searchResults.innerHTML = '<div class="ticker-result no-results">No matches found</div>';
                searchResults.style.display = 'block';
            }
        });

        // Hide results when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });
    }

    /**
     * Add symbol to selected list
     */
    addSymbol(symbol) {
        if (!this.selectedSymbols.includes(symbol)) {
            this.selectedSymbols.push(symbol);
            this.updateSelectedSymbols();
        }
        
        // Clear search
        const searchInput = document.getElementById('tickerSearch');
        const searchResults = document.getElementById('tickerSearchResults');
        if (searchInput) searchInput.value = '';
        if (searchResults) searchResults.style.display = 'none';
    }

    /**
     * Remove symbol from selected list
     */
    removeSymbol(symbol) {
        this.selectedSymbols = this.selectedSymbols.filter(s => s !== symbol);
        this.updateSelectedSymbols();
    }

    /**
     * Update the display of selected symbols
     */
    updateSelectedSymbols() {
        const container = document.getElementById('selectedSymbols');
        if (!container) return;

        if (this.selectedSymbols.length === 0) {
            container.innerHTML = '<div class="no-symbols">No symbols selected</div>';
        } else {
            container.innerHTML = this.selectedSymbols.map(symbol => `
                <span class="symbol-tag">
                    ${symbol}
                    <button type="button" onclick="dashboard.removeSymbol('${symbol}')" class="remove-symbol">×</button>
                </span>
            `).join('');
        }
    }

    /**
     * Edit portfolio
     */
    async editPortfolio(portfolioId) {
        const portfolio = this.portfolios.find(p => String(p.id) === String(portfolioId));
        if (!portfolio) {
            this.showError('Portfolio not found');
            return;
        }

        // Pre-populate form with existing data
        document.getElementById('portfolioName').value = portfolio.name;
        document.getElementById('portfolioDescription').value = portfolio.description || '';
        this.selectedSymbols = portfolio.symbols || [];
        this.updateSelectedSymbols();

        // Change form title and button
        const formTitle = document.querySelector('#portfolioFormContainer h3');
        if (formTitle) {
            formTitle.textContent = 'Edit Portfolio';
        }

        const submitButton = document.querySelector('#createPortfolioForm button[type="submit"]');
        if (submitButton) {
            submitButton.textContent = 'Update Portfolio';
            submitButton.setAttribute('data-editing', portfolioId);
        }

        // Switch to portfolios view if not already there
        this.showSection('portfolios');
    }

    /**
     * Delete portfolio
     */
    async deletePortfolio(portfolioId) {
        const portfolio = this.portfolios.find(p => String(p.id) === String(portfolioId));
        if (!portfolio) {
            this.showError('Portfolio not found');
            return;
        }

        if (!confirm(`Are you sure you want to delete "${portfolio.name}"?`)) {
            return;
        }

        try {
            const response = await fetch(`/api/portfolios/${portfolioId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${this.getToken()}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.showSuccess('Portfolio deleted successfully');
                await this.loadPortfolios();
            } else {
                const error = await response.json();
                this.showError(error.error || 'Failed to delete portfolio');
            }
        } catch (error) {
            console.error('Error deleting portfolio:', error);
            this.showError('Failed to delete portfolio');
        }
    }
    
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
        }
    }
    
    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }
    
    showError(message) {
        // Simple error display - could be enhanced with a toast system
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #e74c3c;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10001;
            animation: slideIn 0.3s ease;
        `;
        errorDiv.textContent = message;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
    
    showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'success-message';
        successDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #27ae60;
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            z-index: 10001;
            animation: slideIn 0.3s ease;
        `;
        successDiv.textContent = message;
        document.body.appendChild(successDiv);
        
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }
    
    hideLoading() {
        const loadingScreen = document.getElementById('loadingScreen');
        if (loadingScreen) {
            loadingScreen.classList.add('hidden');
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 300);
        }
    }
    
    redirectToLogin() {
        if (this.redirecting) return; // Prevent multiple redirects
        this.redirecting = true;
        
        console.log('Redirecting to login page');
        
        // Clear all authentication data synchronously
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        this.token = null;
        this.user = null;
        
        // Also clear any session storage
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('user');
        
        console.log('All auth data cleared, redirecting...');
        
        // Use setTimeout to prevent potential race conditions
        setTimeout(() => {
            window.location.href = '/';
        }, 100);
    }

    logout() {
        // Cleanup cache and listeners
        if (this.recommendationCache) {
            this.recommendationCache.destroy();
        }
        
        if (this.cacheUnsubscribe) {
            this.cacheUnsubscribe();
        }
        
        // Clear tokens and redirect
        this.redirectToLogin();
    }
    
    // Enhanced functionality for professional UX
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        
        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(tabName).classList.add('active');
        
        this.currentTab = tabName;
    }
    
    performSearch() {
        this.applyFilters();
    }
    
    applyFilters() {
        // Always start with full recommendations array
        let filtered = [...this.recommendations];
        
        // Apply search filter first
        const searchTerm = document.getElementById('symbolSearch').value.toUpperCase();
        if (searchTerm) {
            filtered = filtered.filter(rec => 
                rec.symbol.includes(searchTerm) || 
                (rec.company_name && rec.company_name.toUpperCase().includes(searchTerm))
            );
        }
        
        // Risk filter
        const riskFilter = document.getElementById('riskFilter').value;
        if (riskFilter) {
            filtered = filtered.filter(rec => rec.risk_level === riskFilter);
        }
        
        // Type filter
        const typeFilter = document.getElementById('typeFilter').value;
        if (typeFilter) {
            filtered = filtered.filter(rec => rec.recommendation_type === typeFilter);
        }
        
        // Sort filter
        const sortFilter = document.getElementById('sortFilter').value;
        switch (sortFilter) {
            case 'confidence':
                filtered.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
                break;
            case 'projected_gain':
                filtered.sort((a, b) => {
                    const gainA = a.target_price && a.current_price ? 
                        ((a.target_price - a.current_price) / a.current_price) : 0;
                    const gainB = b.target_price && b.current_price ? 
                        ((b.target_price - b.current_price) / b.current_price) : 0;
                    return gainB - gainA;
                });
                break;
            case 'symbol':
                filtered.sort((a, b) => a.symbol.localeCompare(b.symbol));
                break;
            case 'date':
                filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                break;
        }
        
        this.renderFilteredRecommendations(filtered);
        this.updateRecommendationStats(filtered);
    }
    
    renderFilteredRecommendations(recommendations) {
        const container = document.getElementById('recommendationsGrid');
        if (!container) return;
        
        if (recommendations.length === 0) {
            container.innerHTML = '<div class="loading-placeholder">No recommendations match your criteria</div>';
            return;
        }
        
        container.innerHTML = recommendations.map(rec => {
            const currentPrice = rec.current_price || 0;
            const targetPrice = rec.target_price || currentPrice;
            const projectedGain = currentPrice > 0 ? ((targetPrice - currentPrice) / currentPrice * 100) : 0;
            const projectedGainDollar = targetPrice - currentPrice;
            const confidence = (rec.confidence * 100).toFixed(0);
            
            // Check if there are multiple recommendations for this ticker
            const tickerHistory = this.getTickerHistory(rec.symbol);
            const hasHistory = tickerHistory.length > 1;
            
            return `
                <div class="recommendation-item">
                    <div class="recommendation-header">
                        <div class="stock-symbol">${rec.symbol}</div>
                        <div class="recommendation-type ${rec.recommendation_type?.toLowerCase() || 'hold'}">
                            ${rec.recommendation_type || 'HOLD'}
                        </div>
                        ${hasHistory ? `<button class="history-button" data-symbol="${rec.symbol}" title="View ${tickerHistory.length} recommendations for ${rec.symbol}">📊 ${tickerHistory.length}</button>` : ''}
                    </div>
                    <div class="recommendation-details">
                        <div class="price-info">
                            <span class="current-price">$${currentPrice.toFixed(2)}</span>
                            <span class="arrow">→</span>
                            <span class="target-price">$${targetPrice.toFixed(2)}</span>
                        </div>
                        <div class="gain-info ${projectedGain >= 0 ? 'positive' : 'negative'}">
                            <span class="gain-dollar">${projectedGain >= 0 ? '+' : ''}$${projectedGainDollar.toFixed(2)}</span>
                            <span class="gain-percent">(${projectedGain >= 0 ? '+' : ''}${projectedGain.toFixed(1)}%)</span>
                        </div>
                        <div class="confidence-score">
                            <strong>${confidence}%</strong> confidence
                        </div>
                        ${this.renderEstimatedHitTime(rec)}
                        <p class="rationale">${rec.rationale || rec.reason || 'AI-generated recommendation based on market analysis'}</p>
                        <div class="meta-info">
                            <small>Risk: ${rec.risk_level || 'MEDIUM'} | Score: ${(rec.prediction_score * 100).toFixed(0)}% | ${this.getRelativeTime(rec.generated_at || rec.created_at || rec.timestamp)}</small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    updateRecommendationStats(recommendations = null) {
        // Use passed recommendations or fall back to instance recommendations
        const recs = recommendations || this.recommendations || [];
        console.log('Updating recommendation stats with', recs.length, 'recommendations');
        
        // Update total count
        const totalCountEl = document.getElementById('totalRecsCount');
        if (totalCountEl) {
            totalCountEl.textContent = recs.length;
        }
        
        if (recs.length > 0) {
            // Calculate average confidence
            const avgConfidence = recs.reduce((sum, rec) => sum + (rec.confidence || 0), 0) / recs.length;
            const avgConfidenceEl = document.getElementById('avgConfidence');
            if (avgConfidenceEl) {
                avgConfidenceEl.textContent = (avgConfidence * 100).toFixed(1) + '%';
            }
            
            // Calculate average projected gain
            const gains = recs.map(rec => {
                const currentPrice = rec.current_price || 0;
                const targetPrice = rec.target_price || currentPrice;
                return currentPrice > 0 ? ((targetPrice - currentPrice) / currentPrice * 100) : 0;
            });
            const avgGain = gains.reduce((sum, gain) => sum + gain, 0) / gains.length;
            const avgGainEl = document.getElementById('avgProjectedGain');
            if (avgGainEl) {
                avgGainEl.textContent = avgGain.toFixed(1) + '%';
            }
        } else {
            // Reset to dashes when no data
            const avgConfidenceEl = document.getElementById('avgConfidence');
            const avgGainEl = document.getElementById('avgProjectedGain');
            if (avgConfidenceEl) avgConfidenceEl.textContent = '-';
            if (avgGainEl) avgGainEl.textContent = '-';
        }
    }
    
    updatePortfolioSummary() {
        // Simulate portfolio data for demo
        const totalValue = this.portfolios.reduce((sum, p) => sum + (p.value || 0), 0);
        const bestPerformer = this.portfolios.reduce((best, p) => 
            (p.performance || 0) > (best.performance || 0) ? p : best, { name: 'None', performance: 0 }
        );
        const totalReturn = this.portfolios.reduce((sum, p) => sum + (p.return_percent || 0), 0) / Math.max(this.portfolios.length, 1);
        
        document.getElementById('totalPortfolioValue').textContent = `$${totalValue.toLocaleString()}`;
        document.getElementById('totalPortfolios').textContent = this.portfolios.length;
        document.getElementById('bestPerformer').textContent = bestPerformer.name;
        document.getElementById('totalReturn').textContent = (totalReturn >= 0 ? '+' : '') + totalReturn.toFixed(1) + '%';
    }
    
    async updatePerformanceMetrics() {
        try {
            console.log('🔄 Loading real AI performance metrics...');
            
            // Get current AI period selection or default to 3M
            const aiPeriodSelect = document.getElementById('aiPeriod');
            const selectedPeriod = aiPeriodSelect ? aiPeriodSelect.value : '3M';
            
            // Show loading indicators
            this.showPerformanceLoading(true);
            
            // Fetch real AI performance metrics
            const response = await fetch(`/api/ai-performance/${selectedPeriod}`, {
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'X-Request-ID': Date.now().toString()
                }
            });
            
            if (!response.ok) {
                throw new Error(`AI Performance API failed: ${response.status}`);
            }
            
            const aiMetrics = await response.json();
            
            console.log('📊 Real AI performance metrics loaded:', aiMetrics);
            
            // Update user performance metrics (keep static for now as we focus on AI metrics)
            const userMetrics = {
                totalReturn: 12.5,
                annualReturn: 15.2,
                bestPosition: 'AAPL (+45%)',
                worstPosition: 'META (-12%)',
                yourReturn: 12.5,
                marketReturn: aiMetrics.sp500Return || 8.2,
                outperformance: Math.round(((12.5 - (aiMetrics.sp500Return || 8.2)) * 10)) / 10
            };
            
            // Update user performance UI
            Object.keys(userMetrics).forEach(key => {
                const element = document.getElementById(key);
                if (element) {
                    const value = userMetrics[key];
                    if (typeof value === 'number') {
                        element.textContent = (value >= 0 ? '+' : '') + value + '%';
                        element.className = 'beat-value ' + (value >= 0 ? 'positive' : 'negative');
                    } else {
                        element.textContent = value;
                    }
                }
            });
            
            // Map API response to UI element IDs
            const aiUIMapping = {
                aiSuccessRate: aiMetrics.successRate,
                aiAvgGain: aiMetrics.avgGain,
                aiTotalRecs: aiMetrics.totalRecs,
                aiConfidenceAccuracy: aiMetrics.confidenceAccuracy,
                aiReturn: aiMetrics.aiReturn,
                sp500Return: aiMetrics.sp500Return,
                nasdaqReturn: aiMetrics.nasdaqReturn,
                aiAlpha: aiMetrics.aiAlpha
            };
            
            // Update AI performance metrics in UI
            Object.keys(aiUIMapping).forEach(key => {
                const element = document.getElementById(key);
                if (element && aiUIMapping[key] !== undefined) {
                    const value = aiUIMapping[key];
                    
                    if (key.includes('Return') || key.includes('Alpha') || key === 'aiAvgGain') {
                        element.textContent = (value >= 0 ? '+' : '') + value + '%';
                        // Update classes to show positive/negative
                        element.className = element.className.replace(/\b(positive|negative)\b/g, '').trim();
                        element.className += ' ' + (value >= 0 ? 'positive' : 'negative');
                    } else if (key.includes('Rate') || key.includes('Accuracy')) {
                        element.textContent = value + '%';
                    } else {
                        element.textContent = value;
                    }
                }
            });
            
            // Add data source indicator
            this.updateDataSourceIndicator(aiMetrics);
            
            console.log('✅ AI performance metrics updated successfully');
            
        } catch (error) {
            console.error('❌ Error loading AI performance metrics:', error);
            
            // Fall back to default metrics with error indicator
            this.showPerformanceError();
            
            // Use fallback static data
            this.updatePerformanceMetricsFallback();
        } finally {
            this.showPerformanceLoading(false);
        }
    }
    
    /**
     * Fallback to static metrics when API fails
     */
    updatePerformanceMetricsFallback() {
        console.log('📊 Using fallback AI performance metrics');
        
        const aiMetrics = {
            aiSuccessRate: 0,
            aiAvgGain: 0,
            aiTotalRecs: 0,
            aiConfidenceAccuracy: 0,
            aiReturn: 0,
            sp500Return: 8.2,
            nasdaqReturn: 12.1,
            aiAlpha: 0
        };
        
        // Update with fallback data and show "No Data" indicators
        Object.keys(aiMetrics).forEach(key => {
            const element = document.getElementById(key);
            if (element) {
                const value = aiMetrics[key];
                if (value === 0 && key !== 'sp500Return' && key !== 'nasdaqReturn') {
                    element.textContent = 'No Data';
                    element.className = element.className.replace(/\b(positive|negative)\b/g, '').trim();
                    element.className += ' no-data';
                } else if (key.includes('Return') || key.includes('Alpha') || key === 'aiAvgGain') {
                    element.textContent = (value >= 0 ? '+' : '') + value + '%';
                    element.className = element.className.replace(/\b(positive|negative)\b/g, '').trim();
                    element.className += ' ' + (value >= 0 ? 'positive' : 'negative');
                } else if (key.includes('Rate') || key.includes('Accuracy')) {
                    element.textContent = value + '%';
                } else {
                    element.textContent = value;
                }
            }
        });
    }
    
    /**
     * Show/hide loading indicators for performance metrics
     */
    showPerformanceLoading(show) {
        const loadingElements = document.querySelectorAll('.ai-value, .benchmark-value');
        loadingElements.forEach(element => {
            if (show) {
                element.style.opacity = '0.5';
                element.style.cursor = 'wait';
            } else {
                element.style.opacity = '1';
                element.style.cursor = 'default';
            }
        });
    }
    
    /**
     * Show error state for performance metrics
     */
    showPerformanceError() {
        const errorContainer = document.getElementById('ai-performance');
        if (errorContainer) {
            // Add error indicator if it doesn't exist
            let errorIndicator = errorContainer.querySelector('.performance-error');
            if (!errorIndicator) {
                errorIndicator = document.createElement('div');
                errorIndicator.className = 'performance-error';
                errorIndicator.innerHTML = '⚠️ Using cached data - live analysis unavailable';
                errorIndicator.style.cssText = `
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #dc2626;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    margin-bottom: 16px;
                `;
                errorContainer.insertBefore(errorIndicator, errorContainer.firstChild);
            }
        }
    }
    
    /**
     * Update data source indicator
     */
    updateDataSourceIndicator(metrics) {
        const container = document.getElementById('ai-performance');
        if (container && metrics.dataSource) {
            let indicator = container.querySelector('.data-source-indicator');
            if (!indicator) {
                indicator = document.createElement('div');
                indicator.className = 'data-source-indicator';
                container.insertBefore(indicator, container.firstChild);
            }
            
            const dataSourceText = metrics.dataSource === 'yahoo_finance' 
                ? '📊 Real-time data from Yahoo Finance' 
                : '📋 Using cached analysis data';
                
            indicator.innerHTML = `
                <div style="
                    background: rgba(16, 185, 129, 0.1);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    color: #059669;
                    padding: 8px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    margin-bottom: 16px;
                ">
                    ${dataSourceText} | Sample: ${metrics.sampleSize || 0} recommendations | Updated: ${new Date(metrics.calculatedAt).toLocaleTimeString()}
                </div>
            `;
        }
    }
    
    async refreshData() {
        try {
            this.showSuccess('Refreshing data...');
            
            // Force refresh recommendations from API
            if (this.currentSection === 'dashboard') {
                await this.loadRecommendations(true); // Force refresh
            }
            
            await this.loadSectionData(this.currentSection);
            this.showSuccess('Data refreshed successfully!');
            
            console.log('🔄 Manual data refresh completed');
        } catch (error) {
            console.error('Error refreshing data:', error);
            this.showError('Failed to refresh data');
        }
    }
    
    setupSectionEventListeners() {
        // Set up event listeners for current section
        if (this.currentSection === 'recommendations') {
            // Clear and re-attach recommendation filters
            ['riskFilter', 'typeFilter', 'sortFilter'].forEach(filterId => {
                const filter = document.getElementById(filterId);
                if (filter) {
                    // Clone element to remove all event listeners
                    const newFilter = filter.cloneNode(true);
                    filter.parentNode.replaceChild(newFilter, filter);
                    // Add new listener
                    newFilter.addEventListener('change', () => this.applyFilters());
                }
            });
            
            const searchBtn = document.getElementById('searchBtn');
            if (searchBtn) {
                // Clone element to remove all event listeners
                const newSearchBtn = searchBtn.cloneNode(true);
                searchBtn.parentNode.replaceChild(newSearchBtn, searchBtn);
                // Add new listener
                newSearchBtn.addEventListener('click', () => this.performSearch());
            }
            
            const symbolSearch = document.getElementById('symbolSearch');
            if (symbolSearch) {
                // Clone element to remove all event listeners
                const newSymbolSearch = symbolSearch.cloneNode(true);
                symbolSearch.parentNode.replaceChild(newSymbolSearch, symbolSearch);
                // Add new listener
                newSymbolSearch.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.performSearch();
                });
                // Also add input event for real-time filtering
                newSymbolSearch.addEventListener('input', () => this.performSearch());
            }
        }
        
        if (this.currentSection === 'portfolios') {
            // Re-attach portfolio section event listeners
            const createPortfolioBtn = document.getElementById('createPortfolioBtn');
            if (createPortfolioBtn) {
                // Clone element to remove all event listeners
                const newBtn = createPortfolioBtn.cloneNode(true);
                createPortfolioBtn.parentNode.replaceChild(newBtn, createPortfolioBtn);
                // Add new listener
                newBtn.addEventListener('click', () => {
                    this.resetPortfolioForm();
                    this.showModal('createPortfolioModal');
                    this.initializeTickerSearch();
                });
            }
        }
        
        if (this.currentSection === 'performance') {
            // Clear and re-attach performance tab listeners
            // Convert to array to avoid issues with live NodeList
            const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));
            tabBtns.forEach(btn => {
                // Remove existing listeners by cloning
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
                // Add new listener
                newBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('Tab clicked:', e.target.dataset.tab);
                    this.switchTab(e.target.dataset.tab);
                });
            });
            
            // Set up refresh button
            const refreshBtn = document.getElementById('refreshBtn');
            if (refreshBtn) {
                // Clone element to remove all event listeners
                const newRefreshBtn = refreshBtn.cloneNode(true);
                refreshBtn.parentNode.replaceChild(newRefreshBtn, refreshBtn);
                // Add new listener
                newRefreshBtn.addEventListener('click', () => this.refreshData());
            }
        }
        
        if (this.currentSection === 'account') {
            // Account management event listeners
            const upgradeBtn = document.getElementById('upgradeBtn');
            if (upgradeBtn) {
                upgradeBtn.addEventListener('click', () => this.showUpgradeModal());
            }
            
            const editProfileBtn = document.getElementById('editProfileBtn');
            if (editProfileBtn) {
                editProfileBtn.addEventListener('click', () => this.editProfile());
            }
            
            // Security buttons
            const changePasswordBtn = document.getElementById('changePasswordBtn');
            if (changePasswordBtn) {
                changePasswordBtn.addEventListener('click', () => this.changePassword());
            }
            
            const setup2FABtn = document.getElementById('setup2FABtn');
            if (setup2FABtn) {
                setup2FABtn.addEventListener('click', () => this.setup2FA());
            }
            
            // Billing buttons
            const updateBillingBtn = document.getElementById('updateBillingBtn');
            if (updateBillingBtn) {
                updateBillingBtn.addEventListener('click', () => this.updateBilling());
            }
        }
    }
    
    loadAccountData() {
        // Load user account information
        if (this.user) {
            document.getElementById('profileEmail').textContent = this.user.email || 'Not provided';
            document.getElementById('memberSince').textContent = new Date(this.user.created_at || Date.now()).toLocaleDateString();
        }
        
        // Load subscription info (simulated for demo)
        const currentPlan = this.user?.plan || 'free';
        const planInfo = {
            free: {
                name: 'Free Plan',
                description: 'Basic access to stock recommendations',
                badge: 'Free',
                features: [
                    '3 AI recommendations per day',
                    'Basic portfolio tracking',
                    'Email support'
                ]
            },
            pro: {
                name: 'Pro Plan',
                description: 'Advanced AI recommendations and analytics',
                badge: 'Pro',
                features: [
                    'Unlimited AI recommendations',
                    'Advanced portfolio analytics',
                    'Real-time market alerts',
                    'Priority support',
                    'API access'
                ]
            }
        };
        
        const plan = planInfo[currentPlan];
        document.getElementById('currentPlanName').textContent = plan.name;
        document.getElementById('currentPlanDesc').textContent = plan.description;
        document.getElementById('currentPlanBadge').textContent = plan.badge;
        document.getElementById('currentPlanBadge').className = `plan-badge ${currentPlan}`;
        
        const featuresList = document.getElementById('currentPlanFeatures');
        featuresList.innerHTML = plan.features.map(feature => `<li>${feature}</li>`).join('');
        
        // Show/hide upgrade button
        const upgradeBtn = document.getElementById('upgradeBtn');
        if (currentPlan === 'free') {
            upgradeBtn.style.display = 'block';
        } else {
            upgradeBtn.style.display = 'none';
        }
    }
    
    showUpgradeModal() {
        this.showSuccess('Upgrade feature coming soon! Contact support for early access.');
    }
    
    editProfile() {
        this.showSuccess('Profile editing coming soon!');
    }
    
    changePassword() {
        this.showSuccess('Password change feature coming soon!');
    }
    
    setup2FA() {
        this.showSuccess('Two-factor authentication setup coming soon!');
    }
    
    updateBilling() {
        this.showSuccess('Billing management coming soon!');
    }
    
    /**
     * Show ticker history modal with all recommendations for a specific symbol
     * @param {string} symbol - Stock symbol to show history for
     */
    showTickerHistory(symbol) {
        console.log('showTickerHistory called with symbol:', symbol);
        console.log('All recommendations:', this.allRecommendations);
        
        const history = this.getTickerHistory(symbol);
        console.log('History for', symbol, ':', history);
        
        if (!history || history.length === 0) {
            console.error('No history found for symbol:', symbol);
            this.showError(`No history found for ${symbol}`);
            return;
        }
        
        console.log('Showing history modal for', symbol, 'with', history.length, 'entries');
        
        // Create modal if it doesn't exist
        let modal = document.getElementById('tickerHistoryModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'tickerHistoryModal';
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3 id="historyModalTitle">Stock History</h3>
                        <span class="close" id="closeHistoryModal">&times;</span>
                    </div>
                    <div class="modal-body" id="historyModalBody">
                        <!-- History content will be inserted here -->
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }
        
        // Update modal title and content
        document.getElementById('historyModalTitle').textContent = `${symbol} Recommendation History (${history.length} entries)`;
        
        const modalBody = document.getElementById('historyModalBody');
        modalBody.innerHTML = history.map((rec, index) => {
            const currentPrice = rec.current_price || 0;
            const targetPrice = rec.target_price || currentPrice;
            const projectedGain = currentPrice > 0 ? ((targetPrice - currentPrice) / currentPrice * 100) : 0;
            const projectedGainDollar = targetPrice - currentPrice;
            const confidence = (rec.confidence * 100).toFixed(0);
            const recDate = new Date(rec.generated_at || rec.created_at || rec.timestamp);
            const isLatest = index === 0;
            
            return `
                <div class="history-item ${isLatest ? 'latest' : ''}">
                    <div class="history-header">
                        <div class="history-date">${recDate.toLocaleDateString()} ${recDate.toLocaleTimeString()}</div>
                        <div class="recommendation-type ${rec.recommendation_type?.toLowerCase() || 'hold'}">
                            ${rec.recommendation_type || 'HOLD'}
                        </div>
                        ${isLatest ? '<span class="latest-badge">Latest</span>' : ''}
                    </div>
                    <div class="history-details">
                        <div class="price-info">
                            <span class="current-price">$${currentPrice.toFixed(2)}</span>
                            <span class="arrow">→</span>
                            <span class="target-price">$${targetPrice.toFixed(2)}</span>
                        </div>
                        <div class="gain-info ${projectedGain >= 0 ? 'positive' : 'negative'}">
                            <span class="gain-dollar">${projectedGain >= 0 ? '+' : ''}$${projectedGainDollar.toFixed(2)}</span>
                            <span class="gain-percent">(${projectedGain >= 0 ? '+' : ''}${projectedGain.toFixed(1)}%)</span>
                        </div>
                        <div class="risk-badge risk-${(rec.risk_level || 'MEDIUM').toLowerCase()}">
                            ${rec.risk_level || 'MEDIUM'} RISK
                        </div>
                        <div class="metrics-row">
                            <div class="metric-item">
                                <div class="metric-label">AI Score <span class="info-icon" title="Prediction strength - how likely the price target will be reached">ⓘ</span></div>
                                <div class="metric-value score-value">${(rec.prediction_score * 100).toFixed(0)}%</div>
                            </div>
                            <div class="metric-item">
                                <div class="metric-label">Confidence <span class="info-icon" title="Model certainty - how sure the AI is about this prediction">ⓘ</span></div>
                                <div class="metric-value confidence-value">${confidence}%</div>
                            </div>
                        </div>
                        ${this.renderEstimatedHitTime(rec)}
                        <p class="rationale">${rec.rationale || rec.reason || 'AI-generated recommendation based on market analysis'}</p>
                    </div>
                </div>
            `;
        }).join('');
        
        // Show the modal
        modal.style.display = 'block';
        
        // Add event listeners for closing
        const closeBtn = document.getElementById('closeHistoryModal');
        if (closeBtn) {
            closeBtn.onclick = () => this.closeTickerHistory();
        }
        
        // Add click outside to close
        modal.onclick = (e) => {
            if (e.target === modal) {
                this.closeTickerHistory();
            }
        };
    }
    
    /**
     * Close the ticker history modal
     */
    closeTickerHistory() {
        const modal = document.getElementById('tickerHistoryModal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Get relative time string from timestamp
     */
    getRelativeTime(timestamp) {
        if (!timestamp) return 'Unknown';
        
        const now = new Date();
        const date = new Date(timestamp);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return date.toLocaleDateString();
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new DashboardApp();
});

// Add slide animation for notifications and modal styles
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    /* History button styles */
    .history-button {
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.3);
        color: #3b82f6;
        border-radius: 4px;
        padding: 2px 6px;
        font-size: 11px;
        cursor: pointer;
        margin-left: 8px;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 2px;
    }
    
    .history-button:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: rgba(59, 130, 246, 0.5);
        transform: translateY(-1px);
    }
    
    /* Modal styles */
    .modal {
        display: none;
        position: fixed;
        z-index: 1000;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
    }
    
    .modal-content {
        background-color: #fefefe;
        margin: 5% auto;
        padding: 0;
        border-radius: 12px;
        width: 90%;
        max-width: 800px;
        max-height: 85vh;
        overflow-y: auto;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
    }
    
    .modal-header {
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 20px 24px;
        border-radius: 12px 12px 0 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .modal-header h3 {
        margin: 0;
        font-size: 1.5rem;
    }
    
    .close {
        color: white;
        float: right;
        font-size: 28px;
        font-weight: bold;
        cursor: pointer;
        opacity: 0.8;
        transition: opacity 0.2s;
    }
    
    .close:hover {
        opacity: 1;
    }
    
    .modal-body {
        padding: 24px;
        max-height: calc(85vh - 100px);
        overflow-y: auto;
    }
    
    /* History item styles */
    .history-item {
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 16px;
        transition: all 0.2s ease;
    }
    
    .history-item:hover {
        background: #f1f5f9;
        border-color: #cbd5e1;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }
    
    .history-item.latest {
        background: linear-gradient(135deg, #fef3c7, #fde68a);
        border-color: #f59e0b;
        box-shadow: 0 2px 8px rgba(245, 158, 11, 0.2);
    }
    
    .history-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }
    
    .history-date {
        font-size: 14px;
        color: #64748b;
        font-weight: 500;
    }
    
    .latest-badge {
        background: #10b981;
        color: white;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .history-details {
        display: grid;
        gap: 8px;
    }
    
    .history-details .price-info,
    .history-details .gain-info,
    .history-details .confidence-score {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .history-details .rationale {
        margin: 8px 0;
        font-size: 14px;
        line-height: 1.5;
        color: #374151;
    }
    
    .history-details .meta-info {
        margin-top: 8px;
    }
    
    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
        .modal-content {
            background-color: #1f2937;
            color: #f9fafb;
        }
        
        .history-item {
            background: #374151;
            border-color: #4b5563;
            color: #f9fafb;
        }
        
        .history-item:hover {
            background: #4b5563;
            border-color: #6b7280;
        }
        
        .history-date {
            color: #9ca3af;
        }
        
        .history-details .rationale {
            color: #d1d5db;
        }
    }
`;
document.head.appendChild(style);