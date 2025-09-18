import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Chip,
  Button,
  Paper,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Slider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  Alert
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Psychology,
  Timeline,
  Star,
  History,
  ShowChart,
  FilterList,
  Sort,
  ExpandMore,
  Clear,
  Warning
} from '@mui/icons-material';
import { stockApi } from '../utils/api.js';

function RecommendationCard({ recommendation, onViewHistory }) {
  // Helper function to safely format prices
  const formatPrice = (price) => {
    if (typeof price === 'number') {
      return price.toFixed(2);
    }
    const numPrice = Number(price);
    return !isNaN(numPrice) ? numPrice.toFixed(2) : 'N/A';
  };

  // Helper function to safely parse price to number
  const parsePrice = (price) => {
    if (typeof price === 'number') {
      return price;
    }
    const numPrice = Number(price);
    return !isNaN(numPrice) ? numPrice : null;
  };

  const getActionColor = (action) => {
    switch (action) {
      case 'BUY':
        return 'success';
      case 'SELL':
        return 'error';
      case 'HOLD':
        return 'info';
      default:
        return 'default';
    }
  };

  const getActionIcon = (action) => {
    switch (action) {
      case 'BUY':
        return <TrendingUp />;
      case 'SELL':
        return <TrendingDown />;
      default:
        return <Timeline />;
    }
  };

  const calculateGainLoss = () => {
    const currentPrice = parsePrice(recommendation.current_price);
    const targetPrice = parsePrice(recommendation.target_price);

    if (currentPrice && targetPrice && currentPrice > 0) {
      const percentChange = ((targetPrice - currentPrice) / currentPrice) * 100;
      return {
        value: percentChange.toFixed(2),
        positive: percentChange >= 0
      };
    }
    return null;
  };

  const gainLoss = calculateGainLoss();

  // Safe confidence calculation
  const getConfidence = () => {
    if (recommendation.prediction_strength) {
      return recommendation.prediction_strength;
    }
    const confidence = parsePrice(recommendation.confidence);
    return confidence ? (confidence * 100).toFixed(0) : '50';
  };

  const predictionStrength = getConfidence();

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="h6" fontWeight="bold">
              {recommendation.symbol}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              AI Recommendation
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <Chip
              icon={getActionIcon(recommendation.recommendation_type)}
              label={recommendation.recommendation_type}
              color={getActionColor(recommendation.recommendation_type)}
              size="small"
              sx={{ mb: 1 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Star fontSize="small" sx={{ color: 'primary.main', mr: 0.5 }} />
              <Typography variant="body2" fontWeight="bold">
                {Math.round((parsePrice(recommendation.confidence) || 0.5) * 10)}/10
              </Typography>
            </Box>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Target Price
            </Typography>
            <Typography variant="h6" fontWeight="bold">
              ${formatPrice(recommendation.target_price)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Current Price
            </Typography>
            <Typography variant="h6" fontWeight="bold">
              ${formatPrice(recommendation.current_price)}
            </Typography>
          </Box>
        </Box>

        {gainLoss && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            p: 2,
            backgroundColor: gainLoss.positive ? 'rgba(46, 125, 50, 0.1)' : 'rgba(211, 47, 47, 0.1)',
            border: `1px solid ${gainLoss.positive ? '#2e7d32' : '#d32f2f'}`,
            borderRadius: 1,
            mb: 2
          }}>
            {gainLoss.positive ? 
              <TrendingUp sx={{ mr: 1, color: 'success.main' }} /> : 
              <TrendingDown sx={{ mr: 1, color: 'error.main' }} />
            }
            <Typography variant="h6" fontWeight="bold" 
              color={gainLoss.positive ? 'success.main' : 'error.main'}>
              {gainLoss.positive ? '+' : ''}{gainLoss.value}%
            </Typography>
            <Typography variant="body2" sx={{ ml: 1, color: 'text.primary' }}>
              potential
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2, mb: 2 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Prediction Strength
            </Typography>
            <Typography variant="h6" fontWeight="bold" color="primary.main">
              {predictionStrength}%
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Risk Level
            </Typography>
            <Typography variant="h6" fontWeight="bold" 
              color={recommendation.risk_level === 'HIGH' ? 'error.main' : 
                    recommendation.risk_level === 'MEDIUM' ? 'warning.main' : 'success.main'}>
              {recommendation.risk_level || 'MEDIUM'}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <Psychology sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
          AI Analysis
        </Typography>

        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
          {recommendation.rationale || 'AI analysis indicates market conditions favor this position.'}
        </Typography>

        {recommendation.time_to_hit_prediction && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              Timeline Prediction:
            </Typography>
            <Typography variant="body2" color="info.main">
              {recommendation.time_to_hit_prediction.timing_summary || 
               recommendation.time_to_hit_prediction.expected_timeline}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Generated: {formatTimestamp(recommendation.timestamp || recommendation.created_at || recommendation.generated_at)}
          </Typography>
          <Button
            size="small"
            startIcon={<History />}
            onClick={() => onViewHistory?.(recommendation.symbol)}
            sx={{ textTransform: 'none' }}
          >
            History
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
}

// Helper function to format timestamps safely
const formatTimestamp = (timestamp) => {
  if (!timestamp) return 'Unknown';

  const date = new Date(timestamp);
  // Check if date is valid and not the Unix epoch (1970)
  if (isNaN(date.getTime()) || date.getFullYear() === 1970) {
    return 'Recent';
  }

  return date.toLocaleDateString();
};

// Helper function to check if recommendation is valid/current
const isValidRecommendation = (recommendation) => {
  // Check if current price is reasonable (not 0 or negative)
  const currentPrice = parseFloat(recommendation.current_price);
  const targetPrice = parseFloat(recommendation.target_price);

  if (!currentPrice || currentPrice <= 0) return false;
  if (!targetPrice || targetPrice <= 0) return false;

  // Check if price difference is reasonable (not more than 500% difference)
  const priceDiff = Math.abs(targetPrice - currentPrice) / currentPrice;
  if (priceDiff > 5.0) return false; // More than 500% difference seems unrealistic

  // Check if recommendation is not too old (older than 90 days)
  const timestamp = recommendation.timestamp || recommendation.created_at || recommendation.generated_at;
  if (timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const daysDiff = (now - date) / (1000 * 60 * 60 * 24);
    if (daysDiff > 90) return false;
  }

  return true;
};

function Recommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [predictionHistory, setPredictionHistory] = useState([]);

  // Filter and sort states
  const [filterType, setFilterType] = useState('ALL');
  const [filterRisk, setFilterRisk] = useState('ALL');
  const [sortBy, setSortBy] = useState('confidence');
  const [sortOrder, setSortOrder] = useState('desc');
  const [minConfidence, setMinConfidence] = useState(0);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [showExpired, setShowExpired] = useState(false);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  // Apply filters and sorting whenever recommendations or filter criteria change
  useEffect(() => {
    applyFiltersAndSort();
  }, [recommendations, filterType, filterRisk, sortBy, sortOrder, minConfidence, searchSymbol, showExpired]);

  const applyFiltersAndSort = () => {
    let filtered = [...recommendations];

    // Filter out invalid recommendations unless showExpired is true
    if (!showExpired) {
      filtered = filtered.filter(isValidRecommendation);
    }

    // Filter by recommendation type
    if (filterType !== 'ALL') {
      filtered = filtered.filter(rec => rec.recommendation_type === filterType);
    }

    // Filter by risk level
    if (filterRisk !== 'ALL') {
      filtered = filtered.filter(rec => rec.risk_level === filterRisk);
    }

    // Filter by minimum confidence
    filtered = filtered.filter(rec => {
      const confidence = parseFloat(rec.confidence) || 0;
      return confidence >= minConfidence / 100;
    });

    // Filter by symbol search
    if (searchSymbol) {
      filtered = filtered.filter(rec =>
        rec.symbol.toLowerCase().includes(searchSymbol.toLowerCase())
      );
    }

    // Sort recommendations
    filtered.sort((a, b) => {
      let aValue, bValue;

      switch (sortBy) {
        case 'confidence':
          aValue = parseFloat(a.confidence) || 0;
          bValue = parseFloat(b.confidence) || 0;
          break;
        case 'potential':
          const aPrice = parseFloat(a.current_price) || 0;
          const aTarget = parseFloat(a.target_price) || 0;
          const bPrice = parseFloat(b.current_price) || 0;
          const bTarget = parseFloat(b.target_price) || 0;
          aValue = aPrice > 0 ? ((aTarget - aPrice) / aPrice) * 100 : 0;
          bValue = bPrice > 0 ? ((bTarget - bPrice) / bPrice) * 100 : 0;
          break;
        case 'symbol':
          aValue = a.symbol;
          bValue = b.symbol;
          break;
        case 'price':
          aValue = parseFloat(a.current_price) || 0;
          bValue = parseFloat(b.current_price) || 0;
          break;
        case 'date':
          aValue = new Date(a.timestamp || a.created_at || a.generated_at || 0).getTime();
          bValue = new Date(b.timestamp || b.created_at || b.generated_at || 0).getTime();
          break;
        default:
          aValue = 0;
          bValue = 0;
      }

      if (typeof aValue === 'string') {
        return sortOrder === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }

      return sortOrder === 'asc' ? aValue - bValue : bValue - aValue;
    });

    setFilteredRecommendations(filtered);
  };

  const clearFilters = () => {
    setFilterType('ALL');
    setFilterRisk('ALL');
    setSortBy('confidence');
    setSortOrder('desc');
    setMinConfidence(0);
    setSearchSymbol('');
    setShowExpired(false);
  };

  const getFilterSummary = () => {
    const total = recommendations.length;
    const filtered = filteredRecommendations.length;
    const invalid = recommendations.filter(rec => !isValidRecommendation(rec)).length;

    return { total, filtered, invalid };
  };

  // Helper function to deduplicate recommendations by symbol (keep most recent)
  const deduplicateRecommendations = (recommendations) => {
    const seen = new Map();

    recommendations.forEach(rec => {
      const symbol = rec.symbol;
      const timestamp = new Date(rec.timestamp || rec.created_at || rec.generated_at || Date.now()).getTime();

      if (!seen.has(symbol) || seen.get(symbol).timestamp < timestamp) {
        seen.set(symbol, { ...rec, timestamp });
      }
    });

    return Array.from(seen.values());
  };

  const fetchRecommendations = async () => {
    try {
      const data = await stockApi.getRecommendations();
      if (data?.recommendations) {
        // Deduplicate recommendations by symbol (keep most recent per symbol)
        const deduplicatedRecommendations = deduplicateRecommendations(data.recommendations);
        setRecommendations(deduplicatedRecommendations);
      }
    } catch (error) {
      console.error('Failed to fetch recommendations:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateNewRecommendations = async () => {
    setGenerating(true);
    try {
      // Refresh recommendations from the API
      await fetchRecommendations();
    } catch (error) {
      console.error('Failed to refresh recommendations:', error);
    } finally {
      setGenerating(false);
    }
  };

  const handleViewHistory = async (symbol) => {
    setSelectedSymbol(symbol);
    setHistoryDialogOpen(true);
    
    // Mock history data for now - in real implementation this would fetch from API
    const mockHistory = [
      { date: '2024-01-15', action: 'BUY', targetPrice: 145.20, actualPrice: 143.10, accuracy: 'Hit target in 5 days' },
      { date: '2024-01-08', action: 'HOLD', targetPrice: 142.00, actualPrice: 141.85, accuracy: 'Target achieved' },
      { date: '2024-01-01', action: 'BUY', targetPrice: 138.50, actualPrice: 135.20, accuracy: 'Hit target in 3 days' }
    ];
    setPredictionHistory(mockHistory);
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h3" sx={{ fontFamily: '"Playfair Display", serif' }}>
          AI Investment Insights
        </Typography>
        <Button
          variant="contained"
          startIcon={generating ? <CircularProgress size={20} /> : <Psychology />}
          onClick={generateNewRecommendations}
          disabled={generating}
        >
          {generating ? 'Generating...' : 'Generate New Insights'}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <Psychology sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6">
            AI-Powered Investment Analysis
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Our sophisticated AI algorithms analyze market trends, financial data, and macroeconomic indicators 
          to provide personalized investment recommendations tailored to your portfolio strategy.
        </Typography>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress size={60} />
        </Box>
      ) : recommendations.length > 0 ? (
        <Box>
          {/* Filter and Sort Controls */}
          <Accordion sx={{ mb: 3 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <FilterList sx={{ color: 'primary.main' }} />
                <Typography variant="h6">Filters & Sorting</Typography>
                <Chip
                  label={`${getFilterSummary().filtered} of ${getFilterSummary().total}`}
                  size="small"
                  color="primary"
                />
                {getFilterSummary().invalid > 0 && (
                  <Chip
                    icon={<Warning />}
                    label={`${getFilterSummary().invalid} filtered out`}
                    size="small"
                    color="warning"
                  />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={3}>
                {/* Search */}
                <Grid item xs={12} md={4}>
                  <TextField
                    fullWidth
                    label="Search Symbol"
                    value={searchSymbol}
                    onChange={(e) => setSearchSymbol(e.target.value)}
                    placeholder="e.g., AAPL, TSLA"
                    size="small"
                  />
                </Grid>

                {/* Recommendation Type Filter */}
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Recommendation Type</InputLabel>
                    <Select
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                      label="Recommendation Type"
                    >
                      <MenuItem value="ALL">All Types</MenuItem>
                      <MenuItem value="BUY">Buy</MenuItem>
                      <MenuItem value="SELL">Sell</MenuItem>
                      <MenuItem value="HOLD">Hold</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Risk Level Filter */}
                <Grid item xs={12} md={4}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Risk Level</InputLabel>
                    <Select
                      value={filterRisk}
                      onChange={(e) => setFilterRisk(e.target.value)}
                      label="Risk Level"
                    >
                      <MenuItem value="ALL">All Risk Levels</MenuItem>
                      <MenuItem value="LOW">Low Risk</MenuItem>
                      <MenuItem value="MEDIUM">Medium Risk</MenuItem>
                      <MenuItem value="HIGH">High Risk</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Sort By */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Sort By</InputLabel>
                    <Select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      label="Sort By"
                    >
                      <MenuItem value="confidence">Confidence</MenuItem>
                      <MenuItem value="potential">Potential %</MenuItem>
                      <MenuItem value="symbol">Symbol</MenuItem>
                      <MenuItem value="price">Current Price</MenuItem>
                      <MenuItem value="date">Date</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Sort Order */}
                <Grid item xs={12} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Order</InputLabel>
                    <Select
                      value={sortOrder}
                      onChange={(e) => setSortOrder(e.target.value)}
                      label="Order"
                    >
                      <MenuItem value="desc">Highest First</MenuItem>
                      <MenuItem value="asc">Lowest First</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>

                {/* Minimum Confidence Slider */}
                <Grid item xs={12} md={4}>
                  <Typography gutterBottom>Minimum Confidence: {minConfidence}%</Typography>
                  <Slider
                    value={minConfidence}
                    onChange={(e, value) => setMinConfidence(value)}
                    min={0}
                    max={100}
                    step={5}
                    marks={[
                      { value: 0, label: '0%' },
                      { value: 50, label: '50%' },
                      { value: 100, label: '100%' }
                    ]}
                  />
                </Grid>

                {/* Show Expired Toggle */}
                <Grid item xs={12} md={1}>
                  <Button
                    variant={showExpired ? "contained" : "outlined"}
                    color="primary"
                    onClick={() => setShowExpired(!showExpired)}
                    startIcon={<Warning />}
                    size="small"
                    fullWidth
                  >
                    {showExpired ? 'Hide' : 'Show'} Expired
                  </Button>
                </Grid>

                {/* Clear Filters */}
                <Grid item xs={12} md={1}>
                  <Button
                    variant="outlined"
                    color="primary"
                    onClick={clearFilters}
                    startIcon={<Clear />}
                    size="small"
                    fullWidth
                  >
                    Clear
                  </Button>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>

          {/* Summary Alert */}
          {getFilterSummary().invalid > 0 && (
            <Alert severity="info" sx={{ mb: 3 }}>
              {getFilterSummary().invalid} recommendations were automatically filtered out due to invalid/expired data.
              Toggle "Show Expired" to view all recommendations.
            </Alert>
          )}

          {/* Recommendations Grid */}
          {filteredRecommendations.length > 0 ? (
            <Grid container spacing={3}>
              {filteredRecommendations.map((rec) => (
                <Grid item xs={12} md={6} lg={4} key={rec.symbol || rec.recommendation_id || Math.random()}>
                  <RecommendationCard recommendation={rec} onViewHistory={handleViewHistory} />
                </Grid>
              ))}
            </Grid>
          ) : (
            <Paper sx={{ p: 4, textAlign: 'center' }}>
              <FilterList sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
                No recommendations match your filters
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Try adjusting your filter criteria or clearing all filters.
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                onClick={clearFilters}
                startIcon={<Clear />}
              >
                Clear All Filters
              </Button>
            </Paper>
          )}
        </Box>
      ) : (
        <Paper sx={{ p: 6, textAlign: 'center' }}>
          <Psychology sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mb: 2 }}>
            No recommendations available
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Generate AI-powered insights based on current market conditions and your portfolio.
          </Typography>
          <Button
            variant="contained"
            startIcon={<Psychology />}
            onClick={generateNewRecommendations}
            disabled={generating}
          >
            Generate Insights
          </Button>
        </Paper>
      )}

      {/* Prediction History Dialog */}
      <Dialog 
        open={historyDialogOpen} 
        onClose={() => setHistoryDialogOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <History sx={{ mr: 1 }} />
            Prediction History for {selectedSymbol}
          </Box>
        </DialogTitle>
        <DialogContent>
          {predictionHistory.length > 0 ? (
            <List>
              {predictionHistory.map((item, index) => (
                <ListItem key={index} sx={{ px: 0 }}>
                  <Card sx={{ width: '100%' }}>
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                        <Box>
                          <Typography variant="subtitle2" fontWeight="bold">
                            {item.date}
                          </Typography>
                          <Chip 
                            label={item.action}
                            size="small"
                            color={getActionColor(item.action)}
                            sx={{ mt: 1 }}
                          />
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" color="text.secondary">
                            Target: ${item.targetPrice.toFixed(2)}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Entry: ${item.actualPrice.toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                      <Typography variant="body2" color="success.main" fontWeight="bold">
                        {item.accuracy}
                      </Typography>
                    </CardContent>
                  </Card>
                </ListItem>
              ))}
            </List>
          ) : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <ShowChart sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography color="text.secondary">
                No prediction history available for {selectedSymbol}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// Helper function for history dialog
function getActionColor(action) {
    switch (action) {
      case 'BUY':
        return 'success';
      case 'SELL':
        return 'error';
      case 'HOLD':
        return 'info';
      default:
        return 'default';
    }
  }

export default Recommendations;