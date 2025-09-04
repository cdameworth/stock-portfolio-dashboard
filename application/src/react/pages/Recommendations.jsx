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
  ListItemText
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Psychology,
  Timeline,
  Star,
  History,
  ShowChart
} from '@mui/icons-material';
import { stockApi } from '../utils/api.js';

function RecommendationCard({ recommendation, onViewHistory }) {
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
    if (recommendation.current_price && recommendation.target_price) {
      const currentPrice = parseFloat(recommendation.current_price);
      const targetPrice = parseFloat(recommendation.target_price);
      const percentChange = ((targetPrice - currentPrice) / currentPrice) * 100;
      return {
        value: percentChange.toFixed(2),
        positive: percentChange >= 0
      };
    }
    return null;
  };

  const gainLoss = calculateGainLoss();
  const predictionStrength = recommendation.prediction_strength || (recommendation.confidence * 100).toFixed(0);

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
                {Math.round(recommendation.confidence * 10)}/10
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
              ${recommendation.target_price?.toFixed(2) || 'N/A'}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Current Price
            </Typography>
            <Typography variant="h6" fontWeight="bold">
              ${recommendation.current_price?.toFixed(2) || 'N/A'}
            </Typography>
          </Box>
        </Box>

        {gainLoss && (
          <Box sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            p: 2,
            backgroundColor: gainLoss.positive ? 'success.light' : 'error.light',
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
            <Typography variant="body2" sx={{ ml: 1 }} color="text.secondary">
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
            Generated: {new Date(recommendation.timestamp).toLocaleDateString()}
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

function Recommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('');
  const [predictionHistory, setPredictionHistory] = useState([]);

  useEffect(() => {
    fetchRecommendations();
  }, []);

  const fetchRecommendations = async () => {
    try {
      const data = await stockApi.getRecommendations();
      if (data?.recommendations) {
        setRecommendations(data.recommendations);
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
        <Grid container spacing={3}>
          {recommendations.map((rec, index) => (
            <Grid item xs={12} md={6} lg={4} key={index}>
              <RecommendationCard recommendation={rec} onViewHistory={handleViewHistory} />
            </Grid>
          ))}
        </Grid>
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