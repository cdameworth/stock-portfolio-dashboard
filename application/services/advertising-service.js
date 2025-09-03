/**
 * Advertising Service - Manages ad placement and revenue for freemium model
 */

const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'advertising-service' },
  transports: [
    new winston.transports.Console()
  ]
});

class AdvertisingService {
  constructor() {
    this.adProviders = {
      google: {
        enabled: true,
        publisher_id: process.env.GOOGLE_AD_PUBLISHER_ID || 'ca-pub-1234567890123456',
        slots: {
          banner: 'slot-1234567890',
          sidebar: 'slot-2345678901', 
          inline: 'slot-3456789012'
        }
      },
      carbon: {
        enabled: true,
        zone_id: process.env.CARBON_ZONE_ID || 'CE7I52QE'
      }
    };
  }

  /**
   * Get ad configuration for a user based on their plan
   */
  getAdConfig(userPlan = 'free') {
    const adConfig = {
      showAds: userPlan === 'free',
      adTypes: [],
      frequency: 'normal'
    };

    if (userPlan === 'free') {
      adConfig.adTypes = ['banner', 'sidebar', 'inline'];
      adConfig.frequency = 'high';
    } else if (userPlan === 'basic') {
      // Basic plan shows reduced ads
      adConfig.showAds = true;
      adConfig.adTypes = ['sidebar'];
      adConfig.frequency = 'low';
    } else {
      // Premium/Pro plans show no ads
      adConfig.showAds = false;
    }

    return adConfig;
  }

  /**
   * Generate Google AdSense ad unit HTML
   */
  generateGoogleAd(slotType = 'banner', responsive = true) {
    if (!this.adProviders.google.enabled) {
      return '';
    }

    const publisherId = this.adProviders.google.publisher_id;
    const slotId = this.adProviders.google.slots[slotType];
    
    const adStyles = {
      banner: 'display: block; width: 728px; height: 90px;',
      sidebar: 'display: block; width: 300px; height: 250px;',
      inline: 'display: block; width: 336px; height: 280px;'
    };

    const style = responsive ? 'display: block;' : adStyles[slotType];

    return `
      <div class="ad-container ad-${slotType}" data-ad-type="google">
        <div class="ad-label">Advertisement</div>
        <ins class="adsbygoogle"
             style="${style}"
             data-ad-client="${publisherId}"
             data-ad-slot="${slotId}"
             ${responsive ? 'data-ad-format="auto" data-full-width-responsive="true"' : ''}></ins>
        <script>
          (adsbygoogle = window.adsbygoogle || []).push({});
        </script>
      </div>
    `;
  }

  /**
   * Generate Carbon Ads ad unit HTML (good for developer/finance audiences)
   */
  generateCarbonAd() {
    if (!this.adProviders.carbon.enabled) {
      return '';
    }

    return `
      <div class="ad-container ad-carbon" data-ad-type="carbon">
        <div class="ad-label">Advertisement</div>
        <script async type="text/javascript" src="//cdn.carbonads.com/carbon.js?serve=${this.adProviders.carbon.zone_id}&placement=stockportfolionet" id="_carbonads_js"></script>
      </div>
    `;
  }

  /**
   * Get fallback promotional content when ads fail to load
   */
  getFallbackAd(adType = 'banner') {
    const fallbackAds = {
      banner: {
        title: 'Upgrade to Premium',
        description: 'Remove ads and unlock advanced features',
        cta: 'Upgrade Now',
        link: '/pricing'
      },
      sidebar: {
        title: 'Pro Analytics',
        description: 'Get real-time alerts and portfolio insights',
        cta: 'Learn More',
        link: '/pricing'
      },
      inline: {
        title: 'Beat the Market',
        description: 'Join thousands of successful investors',
        cta: 'Get Started',
        link: '/pricing'
      }
    };

    const ad = fallbackAds[adType];
    return `
      <div class="ad-container ad-fallback ad-${adType}" data-ad-type="fallback">
        <div class="ad-content">
          <h4>${ad.title}</h4>
          <p>${ad.description}</p>
          <a href="${ad.link}" class="btn btn-primary btn-sm">${ad.cta}</a>
        </div>
      </div>
    `;
  }

  /**
   * Get ad placement configuration for different page types
   */
  getAdPlacements(pageType, userPlan = 'free') {
    const adConfig = this.getAdConfig(userPlan);
    
    if (!adConfig.showAds) {
      return { placements: [], scripts: [] };
    }

    const placements = {
      dashboard: [
        { type: 'banner', position: 'top', priority: 1 },
        { type: 'sidebar', position: 'right', priority: 2 }
      ],
      recommendations: [
        { type: 'banner', position: 'top', priority: 1 },
        { type: 'inline', position: 'middle', priority: 2 },
        { type: 'sidebar', position: 'right', priority: 3 }
      ],
      portfolio: [
        { type: 'sidebar', position: 'right', priority: 1 },
        { type: 'inline', position: 'bottom', priority: 2 }
      ],
      landing: [
        { type: 'banner', position: 'top', priority: 1 }
      ]
    };

    const scripts = [];
    if (this.adProviders.google.enabled) {
      scripts.push('https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js');
    }

    return {
      placements: placements[pageType] || [],
      scripts: scripts,
      config: adConfig
    };
  }

  /**
   * Generate ad blocker detection script
   */
  generateAdBlockDetection() {
    return `
      <script>
        // Simple ad blocker detection
        window.AdBlockDetected = false;
        
        function detectAdBlock() {
          const adTest = document.createElement('div');
          adTest.innerHTML = '&nbsp;';
          adTest.className = 'adsbox';
          adTest.style.cssText = 'position: absolute; left: -9999px;';
          document.body.appendChild(adTest);
          
          setTimeout(() => {
            if (adTest.offsetHeight === 0) {
              window.AdBlockDetected = true;
              showAdBlockMessage();
            }
            document.body.removeChild(adTest);
          }, 100);
        }
        
        function showAdBlockMessage() {
          const message = document.createElement('div');
          message.className = 'adblock-notice';
          message.innerHTML = \`
            <div class="adblock-content">
              <h4>🚫 Ad Blocker Detected</h4>
              <p>We rely on ads to keep our free tools available. Please consider:</p>
              <div class="adblock-options">
                <button onclick="this.parentElement.parentElement.parentElement.style.display='none'" class="btn btn-sm btn-outline">
                  Continue Anyway
                </button>
                <a href="/pricing" class="btn btn-sm btn-primary">
                  Upgrade to Premium
                </a>
              </div>
            </div>
          \`;
          document.body.appendChild(message);
        }
        
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', detectAdBlock);
        } else {
          detectAdBlock();
        }
      </script>
    `;
  }

  /**
   * Track ad performance metrics
   */
  trackAdMetrics(adType, event, userId = null) {
    const metrics = {
      ad_type: adType,
      event: event, // 'impression', 'click', 'block'
      user_id: userId,
      timestamp: new Date().toISOString(),
      page: global.currentPage || 'unknown'
    };

    logger.info('Ad metrics', metrics);
    
    // In a real implementation, send to analytics service
    // await analyticsService.track('ad_event', metrics);
  }

  /**
   * Check if user should see ads based on plan and settings
   */
  shouldShowAds(userPlan = 'free', userPreferences = {}) {
    // Never show ads to premium users
    if (['premium', 'pro'].includes(userPlan)) {
      return false;
    }

    // Basic plan users might have reduced ads
    if (userPlan === 'basic' && userPreferences.minimal_ads) {
      return Math.random() < 0.3; // 30% chance
    }

    // Free users always see ads
    return true;
  }

  /**
   * Get revenue optimization settings
   */
  getRevenueSettings() {
    return {
      // Auto-refresh removed for AdSense compliance - ads refresh naturally
      lazy_loading: true,
      viewability_threshold: 0.5,
      max_ads_per_page: {
        free: 3,  // Reduced to comply with content ratio policies
        basic: 1,
        premium: 0,
        pro: 0
      }
    };
  }
}

module.exports = AdvertisingService;