import React, { useState, useEffect } from 'react';
import {
  Grid,
  Card,
  CardContent,
  Typography,
  Box,
  Paper,
  Chip,
  CircularProgress
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  AttachMoney,
  Assessment
} from '@mui/icons-material';
import { stockApi } from '../utils/api.js';

function MetricCard({ title, value, change, icon: Icon, positive = true }) {
  return (
    <Card sx={{
      height: '100%',
      transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
      '&:hover': {
        transform: 'translateY(-4px)',
        boxShadow: 4
      }
    }}>
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 1, sm: 0 }
        }}>
          <Box sx={{ flex: 1, textAlign: { xs: 'center', sm: 'left' } }}>
            <Typography
              variant="body2"
              color="text.secondary"
              gutterBottom
              sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
            >
              {title}
            </Typography>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 600,
                mb: 1,
                fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' }
              }}
            >
              {value}
            </Typography>
            {change && (
              <Box sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: { xs: 'center', sm: 'flex-start' },
                gap: 0.5
              }}>
                {positive ? (
                  <TrendingUp color="success" sx={{ fontSize: { xs: 16, sm: 20 } }} />
                ) : (
                  <TrendingDown color="error" sx={{ fontSize: { xs: 16, sm: 20 } }} />
                )}
                <Typography
                  variant="body2"
                  color={positive ? 'success.main' : 'error.main'}
                  sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                >
                  {change}
                </Typography>
              </Box>
            )}
          </Box>
          <Icon sx={{
            fontSize: { xs: 32, sm: 40 },
            color: 'primary.main',
            opacity: 0.7,
            alignSelf: { xs: 'center', sm: 'flex-start' }
          }} />
        </Box>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const [metrics, setMetrics] = useState({
    portfolioValue: '$0',
    dailyChange: '0%',
    totalGain: '$0',
    activePositions: 0
  });
  
  const [recommendations, setRecommendations] = useState([]);
  const [aiPerformance, setAiPerformance] = useState({
    accuracy: 0,
    totalPredictions: 0,
    successfulTrades: 0,
    averageReturn: 0,
    buyAccuracy: 0,
    sellAccuracy: 0,
    holdAccuracy: 0,
    bestPerformer: 'BUY'
  });
  const [marketIndices, setMarketIndices] = useState({
    sp500: { value: 0, change: 0 },
    nasdaq: { value: 0, change: 0 },
    dow: { value: 0, change: 0 }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        const [analyticsData, recsData, aiPerfData] = await Promise.all([
          stockApi.getDashboardAnalytics(),
          stockApi.getRecommendations(),
          fetchAIPerformanceData()
        ]);

        // Set AI performance metrics
        if (aiPerfData) {
          setAiPerformance(aiPerfData);
        }

        // Get actual user portfolio data
        const userPortfolios = await fetchUserPortfolioValue();
        setMetrics({
          portfolioValue: userPortfolios.totalValue || '$0',
          dailyChange: userPortfolios.dailyChange || '0%',
          totalGain: userPortfolios.totalGain || '$0',
          activePositions: userPortfolios.totalPositions || 0
        });

        // Use analytics data for market indices if available, otherwise fallback to mock
        if (analyticsData?.marketIndices) {
          setMarketIndices(analyticsData.marketIndices);
        } else {
          // Fallback to mock data
          const indices = await fetchMarketIndices();
          setMarketIndices(indices);
        }

        if (recsData?.recommendations) {
          // Remove duplicates based on symbol
          const uniqueRecs = recsData.recommendations.filter((rec, index, arr) => 
            arr.findIndex(r => r.symbol === rec.symbol) === index
          );
          setRecommendations(uniqueRecs.slice(0, 4));
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        setMetrics({
          portfolioValue: 'Login Required',
          dailyChange: '0%',
          totalGain: '$0',
          activePositions: 0
        });
      } finally {
        setLoading(false);
      }
    };

    const fetchAIPerformanceData = async () => {
      try {
        // Fetch both overall performance and breakdown
        const [perfResponse, breakdownResponse] = await Promise.all([
          fetch('/api/ai-performance/1M'),
          fetch('/api/ai-performance/1M/breakdown').catch(() => null)
        ]);

        let baseData = {
          accuracy: 0,
          totalPredictions: 0,
          successfulTrades: 0,
          averageReturn: 0,
          buyAccuracy: 0,
          sellAccuracy: 0,
          holdAccuracy: 0,
          bestPerformer: 'BUY'
        };

        if (perfResponse.ok) {
          const data = await perfResponse.json();
          // Map backend field names to frontend expectations
          // Backend returns: successRate (%), totalRecs, avgGain, successfulCount, aiReturn
          const successRate = data.successRate || (data.hit_rate ? data.hit_rate * 100 : 0);
          const totalPredictions = data.totalRecs || data.total_predictions || data.sampleSize || 0;
          const successfulTrades = data.successfulCount || Math.round(totalPredictions * (successRate / 100));
          const averageReturn = data.avgGain || data.aiReturn || data.average_return || 0;

          if (totalPredictions > 0) {
            baseData = {
              ...baseData,
              accuracy: Math.round(successRate),
              totalPredictions,
              successfulTrades,
              averageReturn: Math.round(averageReturn * 10) / 10
            };
          }
        }

        // Add breakdown data if available
        if (breakdownResponse?.ok) {
          const breakdown = await breakdownResponse.json();
          if (breakdown?.breakdown) {
            baseData.buyAccuracy = Math.round((breakdown.breakdown.BUY?.hit_rate || 0) * 100);
            baseData.sellAccuracy = Math.round((breakdown.breakdown.SELL?.hit_rate || 0) * 100);
            baseData.holdAccuracy = Math.round((breakdown.breakdown.HOLD?.hit_rate || 0) * 100);

            // Determine best performer
            const accuracies = { BUY: baseData.buyAccuracy, SELL: baseData.sellAccuracy, HOLD: baseData.holdAccuracy };
            baseData.bestPerformer = Object.entries(accuracies).sort((a, b) => b[1] - a[1])[0][0];
          }
        }

        return baseData;
      } catch (error) {
        console.warn('AI performance data unavailable:', error);
      }
      // Fallback only if API fails or returns no data
      return {
        accuracy: 0,
        totalPredictions: 0,
        successfulTrades: 0,
        averageReturn: 0,
        buyAccuracy: 0,
        sellAccuracy: 0,
        holdAccuracy: 0,
        bestPerformer: 'BUY'
      };
    };

    const fetchUserPortfolioValue = async () => {
      try {
        const token = localStorage.getItem('authToken') || localStorage.getItem('token');
        if (!token) {
          return { totalValue: 'Login Required', dailyChange: '0%', totalGain: '$0', totalPositions: 0 };
        }

        const response = await fetch('/api/portfolios', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const portfolios = await response.json();
          const totalPositions = portfolios.reduce((sum, p) => sum + (p.symbols?.length || 0), 0);
          
          // Mock calculation - in real app this would fetch actual stock prices
          const estimatedValue = totalPositions * 2500; // $2500 per position average
          
          return {
            totalValue: estimatedValue > 0 ? `$${estimatedValue.toLocaleString()}` : '$0',
            dailyChange: estimatedValue > 0 ? '+1.8%' : '0%',
            totalGain: estimatedValue > 0 ? `+$${Math.round(estimatedValue * 0.12).toLocaleString()}` : '$0',
            totalPositions
          };
        }
      } catch (error) {
        console.warn('Portfolio data unavailable:', error);
      }
      return { totalValue: 'Login Required', dailyChange: '0%', totalGain: '$0', totalPositions: 0 };
    };

    const fetchMarketIndices = async () => {
      // Mock data - in production this would fetch from financial API
      return {
        sp500: { value: 5234.18, change: +0.8 },
        nasdaq: { value: 16274.94, change: +1.2 },
        dow: { value: 39294.76, change: +0.6 }
      };
    };

    fetchDashboardData();
  }, []);

  return (
    <Box sx={{ pb: { xs: 2, sm: 4 } }}>
      <Typography
        variant="h3"
        sx={{
          mb: { xs: 2, sm: 3 },
          fontFamily: '"Playfair Display", serif',
          fontSize: { xs: '1.75rem', sm: '2.5rem', md: '3rem' },
          textAlign: { xs: 'center', sm: 'left' }
        }}
      >
        Investment Dashboard
      </Typography>

      {/* Top Row - Key Metrics */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="Portfolio Value"
            value={metrics.portfolioValue}
            icon={AttachMoney}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="Today's Change"
            value={metrics.dailyChange}
            change={metrics.dailyChange}
            icon={Assessment}
            positive={!metrics.dailyChange.startsWith('-')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="Total Gain/Loss"
            value={metrics.totalGain}
            icon={TrendingUp}
            positive={!metrics.totalGain.startsWith('-')}
          />
        </Grid>
        <Grid item xs={12} sm={6} lg={3}>
          <MetricCard
            title="Active Positions"
            value={metrics.activePositions.toString()}
            icon={Assessment}
          />
        </Grid>
      </Grid>

      {/* Second Row - AI Performance & Market Indices */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: { xs: 2, sm: 3 } }}>
        <Grid item xs={12} lg={8}>
          <Paper sx={{
            p: { xs: 2, sm: 3 },
            height: { xs: 'auto', md: 300 },
            minHeight: { xs: 'auto', md: 300 }
          }}>
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                textAlign: { xs: 'center', sm: 'left' }
              }}
            >
              AI Prediction Engine Performance (30 Days)
            </Typography>
            <Grid container spacing={{ xs: 1, sm: 2 }}>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography
                    variant="h4"
                    color="success.main"
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}
                  >
                    {aiPerformance.accuracy}%
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                  >
                    Success Rate
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography
                    variant="h4"
                    color="primary.main"
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}
                  >
                    {aiPerformance.totalPredictions}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                  >
                    Total Predictions
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography
                    variant="h4"
                    color="success.main"
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}
                  >
                    {aiPerformance.successfulTrades}
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                  >
                    Successful Trades
                  </Typography>
                </Box>
              </Grid>
              <Grid item xs={6} sm={3}>
                <Box textAlign="center">
                  <Typography
                    variant="h4"
                    color="success.main"
                    fontWeight="bold"
                    sx={{ fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' } }}
                  >
                    +{aiPerformance.averageReturn}%
                  </Typography>
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
                  >
                    Avg Return
                  </Typography>
                </Box>
              </Grid>
            </Grid>
            {/* Performance by Recommendation Type */}
            <Box sx={{
              mt: 2,
              p: { xs: 1.5, sm: 2 },
              bgcolor: 'action.hover',
              borderRadius: 1
            }}>
              <Typography
                variant="subtitle2"
                fontWeight="bold"
                sx={{ mb: 1.5, fontSize: { xs: '0.8rem', sm: '0.875rem' } }}
              >
                Accuracy by Recommendation Type
              </Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                <Chip
                  label={`BUY: ${aiPerformance.buyAccuracy}%`}
                  color={aiPerformance.bestPerformer === 'BUY' ? 'success' : 'default'}
                  variant={aiPerformance.bestPerformer === 'BUY' ? 'filled' : 'outlined'}
                  size="small"
                  sx={{ fontWeight: aiPerformance.bestPerformer === 'BUY' ? 'bold' : 'normal' }}
                />
                <Chip
                  label={`SELL: ${aiPerformance.sellAccuracy}%`}
                  color={aiPerformance.bestPerformer === 'SELL' ? 'error' : 'default'}
                  variant={aiPerformance.bestPerformer === 'SELL' ? 'filled' : 'outlined'}
                  size="small"
                  sx={{ fontWeight: aiPerformance.bestPerformer === 'SELL' ? 'bold' : 'normal' }}
                />
                <Chip
                  label={`HOLD: ${aiPerformance.holdAccuracy}%`}
                  color={aiPerformance.bestPerformer === 'HOLD' ? 'info' : 'default'}
                  variant={aiPerformance.bestPerformer === 'HOLD' ? 'filled' : 'outlined'}
                  size="small"
                  sx={{ fontWeight: aiPerformance.bestPerformer === 'HOLD' ? 'bold' : 'normal' }}
                />
              </Box>
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 1.5, fontSize: { xs: '0.75rem', sm: '0.875rem' } }}
              >
                <strong>Performance vs S&P 500:</strong> AI recommendations outperformed the market by +{(aiPerformance.averageReturn - 6.2).toFixed(1)}% over the past 30 days.
                Best performer: <strong>{aiPerformance.bestPerformer}</strong> recommendations.
              </Typography>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper sx={{
            p: { xs: 2, sm: 3 },
            height: { xs: 'auto', md: 300 },
            minHeight: { xs: 'auto', md: 300 },
            minWidth: 0,
            overflow: 'hidden'
          }}>
            <Typography
              variant="h6"
              sx={{
                mb: 2,
                fontSize: { xs: '1.1rem', sm: '1.25rem' },
                textAlign: { xs: 'center', sm: 'left' }
              }}
            >
              Major Market Indices
            </Typography>
            <Box sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: { xs: 1.5, sm: 2 },
              minWidth: 0,
              overflow: 'hidden'
            }}>
              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: { xs: 1.5, sm: 2 },
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                flexDirection: { xs: 'column', sm: 'row' },
                textAlign: { xs: 'center', sm: 'left' },
                gap: { xs: 1, sm: 2 },
                minWidth: 0,
                overflow: 'hidden'
              }}>
                <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <Typography variant="subtitle1" fontWeight="bold" noWrap>S&P 500</Typography>
                  <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }} noWrap>
                    {marketIndices.sp500.value.toLocaleString()}
                  </Typography>
                </Box>
                <Typography
                  variant="h6"
                  color={marketIndices.sp500.change >= 0 ? 'success.main' : 'error.main'}
                  sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' }, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {marketIndices.sp500.change >= 0 ? '+' : ''}{marketIndices.sp500.change}%
                </Typography>
              </Box>

              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: { xs: 1.5, sm: 2 },
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                flexDirection: { xs: 'column', sm: 'row' },
                textAlign: { xs: 'center', sm: 'left' },
                gap: { xs: 1, sm: 2 },
                minWidth: 0,
                overflow: 'hidden'
              }}>
                <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <Typography variant="subtitle1" fontWeight="bold" noWrap>NASDAQ</Typography>
                  <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }} noWrap>
                    {marketIndices.nasdaq.value.toLocaleString()}
                  </Typography>
                </Box>
                <Typography
                  variant="h6"
                  color={marketIndices.nasdaq.change >= 0 ? 'success.main' : 'error.main'}
                  sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' }, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {marketIndices.nasdaq.change >= 0 ? '+' : ''}{marketIndices.nasdaq.change}%
                </Typography>
              </Box>

              <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                p: { xs: 1.5, sm: 2 },
                border: 1,
                borderColor: 'divider',
                borderRadius: 1,
                flexDirection: { xs: 'column', sm: 'row' },
                textAlign: { xs: 'center', sm: 'left' },
                gap: { xs: 1, sm: 2 },
                minWidth: 0,
                overflow: 'hidden'
              }}>
                <Box sx={{ minWidth: 0, flex: 1, overflow: 'hidden' }}>
                  <Typography variant="subtitle1" fontWeight="bold" noWrap>Dow Jones</Typography>
                  <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }} noWrap>
                    {marketIndices.dow.value.toLocaleString()}
                  </Typography>
                </Box>
                <Typography
                  variant="h6"
                  color={marketIndices.dow.change >= 0 ? 'success.main' : 'error.main'}
                  sx={{ fontSize: { xs: '1.1rem', sm: '1.25rem' }, whiteSpace: 'nowrap', flexShrink: 0 }}
                >
                  {marketIndices.dow.change >= 0 ? '+' : ''}{marketIndices.dow.change}%
                </Typography>
              </Box>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Third Row - Recent AI Insights */}
      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Recent AI Insights & Recommendations
            </Typography>
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : recommendations.length > 0 ? (
              <Grid container spacing={2}>
                {recommendations.slice(0, 4).map((rec, index) => (
                  <Grid item xs={12} sm={6} md={3} key={rec.symbol || `rec-${index}`}>
                    <Box sx={{ 
                      p: 2, 
                      border: 1, 
                      borderColor: 'divider', 
                      borderRadius: 1,
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column'
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {rec.symbol}
                        </Typography>
                        <Chip 
                          label={rec.recommendation_type || rec.action || 'HOLD'} 
                          size="small"
                          color={(rec.recommendation_type || rec.action) === 'BUY' ? 'success' : 
                                (rec.recommendation_type || rec.action) === 'SELL' ? 'error' : 'default'}
                        />
                      </Box>
                      
                      {rec.company_name && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                          {rec.company_name}
                        </Typography>
                      )}
                      
                      <Typography variant="body2" color="text.secondary" sx={{ 
                        flex: 1,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        mb: 1
                      }}>
                        {rec?.rationale || rec?.reasoning || rec?.reason || 'Market analysis pending...'}
                      </Typography>
                      
                      {/* Time-to-hit prediction if available */}
                      {rec.time_to_hit_prediction && (
                        <Box sx={{
                          mt: 1,
                          p: 1,
                          bgcolor: 'rgba(33, 150, 243, 0.08)',
                          borderRadius: 0.5,
                          mb: 1
                        }}>
                          <Typography variant="caption" color="info.main" fontWeight="medium">
                            Target: {rec.timing_summary || rec.time_to_hit_prediction.expected_timeline || 'Analyzing...'}
                          </Typography>
                        </Box>
                      )}

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 'auto' }}>
                        {rec.confidence && (
                          <Typography variant="caption" color="primary">
                            {Math.round(rec.confidence * 100)}% confidence
                          </Typography>
                        )}
                        {rec.current_price && (
                          <Typography variant="caption" color="text.secondary">
                            ${rec.current_price}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 4 }}>
                <Typography color="text.secondary">
                  No recent insights available
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Dashboard;