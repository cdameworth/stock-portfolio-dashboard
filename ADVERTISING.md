# Advertising System - Freemium Model

## Overview
The Stock Portfolio Dashboard now includes a comprehensive advertising system to support a freemium business model. Free users see ads, while premium users get an ad-free experience.

## Features

### Ad Types
- **Banner Ads** (728x90) - Top of pages
- **Sidebar Ads** (300x250) - Right sidebar 
- **Inline Ads** (336x280) - Within content

### User Plans & Ad Display
- **Free Plan**: All ad types displayed
- **Basic Plan**: Reduced ads (sidebar only)
- **Premium/Pro Plans**: No ads

### Ad Providers Supported
1. **Google AdSense** - Primary ad network
2. **Carbon Ads** - Developer/finance focused ads
3. **Fallback Ads** - Internal promotional content when external ads fail

### Key Features
- Ad blocker detection with upgrade prompts
- Natural ad display without artificial refresh
- Responsive ad layouts for mobile
- Dark theme support
- Performance optimized with lazy loading
- Analytics tracking for impressions and clicks

## Implementation

### Server-Side Components

#### AdvertisingService (`/services/advertising-service.js`)
- Manages ad configuration based on user plans
- Generates ad HTML for different providers
- Tracks ad metrics and performance
- Provides fallback ads when needed

#### API Endpoints
- `GET /api/ads/config` - Get ad configuration for user
- `GET /api/ads/placements/:page` - Get ad placements for specific page
- `POST /api/ads/metrics` - Track ad events (impressions, clicks)

### Client-Side Components

#### Advertising.js (`/public/js/advertising.js`)
- Handles ad initialization and placement
- Manages ad refresh cycles
- Detects ad blockers
- Tracks user interactions
- Updates ads when user plan changes

#### CSS Styles (`/public/css/advertising.css`)
- Responsive ad container styles
- Ad loading animations
- Ad blocker notice styling
- Dark theme support

## Configuration

### Environment Variables
Add to your `.env` file:
```env
# Advertising Configuration
GOOGLE_AD_PUBLISHER_ID=ca-pub-YOUR_PUBLISHER_ID
CARBON_ZONE_ID=YOUR_CARBON_ZONE_ID
```

### User Plan Configuration
The system automatically detects user plans from the authentication service:
- Free users see all ads
- Basic users see reduced ads
- Premium/Pro users see no ads

## Revenue Optimization

### Ad Display
- Ads display naturally without artificial refresh
- Viewability tracking for legitimate impressions
- Performance optimized loading

### Placement Strategy
- **Dashboard**: Banner top, sidebar right
- **Recommendations**: Banner, inline middle, sidebar
- **Portfolio**: Sidebar, inline bottom
- **Landing**: Banner top only

## Ad Blocker Handling

When an ad blocker is detected:
1. Shows a polite notice to users
2. Offers option to continue anyway
3. Promotes upgrade to premium for ad-free experience
4. Auto-dismisses after 10 seconds

## Testing

To test the advertising system:

1. **As Free User**: Register/login with a free account to see all ads
2. **As Premium User**: Upgrade account to verify ads are hidden
3. **Ad Blocker**: Enable ad blocker to test detection and fallback
4. **Responsive**: Test on mobile to verify responsive ad layouts

## Analytics Integration

The system tracks:
- Ad impressions
- Click-through rates
- Ad blocker usage
- Revenue per user segment

Events are sent to:
- Internal metrics service
- Google Analytics (if configured)
- Custom analytics endpoints

## Future Enhancements

- [ ] A/B testing for ad placements
- [ ] Geo-targeted advertising
- [ ] Native ad formats
- [ ] Video ad support
- [ ] Programmatic ad exchange integration
- [ ] Real-time bidding support

## Compliance

Ensure compliance with:
- GDPR (EU users)
- CCPA (California users)  
- Google AdSense policies
- FTC disclosure requirements

Add privacy policy and cookie consent as needed for your jurisdiction.

## Support

For issues with the advertising system:
1. Check browser console for errors
2. Verify ad provider credentials
3. Test with ad blocker disabled
4. Review server logs for API errors

## Revenue Sharing

Consider implementing:
- Referral bonuses for upgrades
- Content creator revenue sharing
- Affiliate marketing integration
- Sponsored content opportunities