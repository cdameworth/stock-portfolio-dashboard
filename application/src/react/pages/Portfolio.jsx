import React, { useState, useEffect } from 'react';
import {
  Paper,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Autocomplete,
  CircularProgress,
  Tabs,
  Tab,
  Menu,
  MenuItem,
  IconButton
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Add, TrendingUp, TrendingDown, MoreVert, FolderOpen, Edit, Delete, TrendingFlat } from '@mui/icons-material';
import { usePortfolioTracing, usePerformanceTracing } from '../utils/useTracing.js';
import { browserTracer } from '../services/browser-tracing.js';

function Portfolio() {
  const [portfolios, setPortfolios] = useState([{ id: 'default', name: 'Main Portfolio', positions: [] }]);
  const [activePortfolio, setActivePortfolio] = useState(0);
  const [loading, setLoading] = useState(true);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [createPortfolioOpen, setCreatePortfolioOpen] = useState(false);
  const [searchSymbol, setSearchSymbol] = useState('');
  const [shares, setShares] = useState('');
  const [symbolOptions, setSymbolOptions] = useState([]);
  const [newPortfolioName, setNewPortfolioName] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState(null);
  const [editShares, setEditShares] = useState('');
  const [requestingPredictions, setRequestingPredictions] = useState(new Set());

  // Tracing hooks
  const { trackPortfolioView, trackPortfolioApiCall } = usePortfolioTracing();
  const { trackPageLoad } = usePerformanceTracing();

  useEffect(() => {
    // Track page load
    trackPageLoad('Portfolio');
    fetchPortfolio();
  }, [trackPageLoad]);

  const fetchPortfolio = async () => {
    // Start portfolio view journey
    const traceId = trackPortfolioView('all');

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');

      // First, get the list of user portfolios
      const portfoliosResponse = await trackPortfolioApiCall('/api/portfolios', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (portfoliosResponse.ok) {
        const userPortfolios = await portfoliosResponse.json();

        // If user has portfolios, use them; otherwise create a default
        if (userPortfolios.length > 0) {
          const portfoliosWithPositions = await Promise.all(
            userPortfolios.map(async (portfolio) => {
              try {
                const positionsResponse = await fetch(`/api/portfolios/${portfolio.id}/positions`, {
                  headers: { 'Authorization': `Bearer ${token}` }
                });
                const positions = positionsResponse.ok ? await positionsResponse.json() : [];
                return { ...portfolio, positions };
              } catch (error) {
                console.error(`Failed to fetch positions for portfolio ${portfolio.id}:`, error);
                return { ...portfolio, positions: [] };
              }
            })
          );
          setPortfolios(portfoliosWithPositions);
        } else {
          // No portfolios exist, keep the default one we initialized with
          const portfolioId = portfolios[activePortfolio].id;
          const positionsResponse = await fetch(`/api/portfolios/${portfolioId}/positions`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });

          if (positionsResponse.ok) {
            const positions = await positionsResponse.json();
            const updatedPortfolios = [...portfolios];
            updatedPortfolios[activePortfolio].positions = positions;
            setPortfolios(updatedPortfolios);
          }
        }
      }

      // End portfolio view journey successfully
      browserTracer.endJourney(traceId, {
        'portfolio.count': portfolios.length,
        'portfolio.load_success': true
      });

    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
      // End journey with error
      browserTracer.endJourney(traceId, {
        'portfolio.load_success': false,
        'error.message': error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPosition = async () => {
    if (!searchSymbol || !shares) {return;}

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch(`/api/portfolios/${portfolios[activePortfolio].id}/positions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          symbol: typeof searchSymbol === 'string' ? searchSymbol.toUpperCase() : searchSymbol.symbol,
          shares: parseInt(shares)
        })
      });

      if (response.ok) {
        setAddDialogOpen(false);
        setSearchSymbol('');
        setShares('');
        setSymbolOptions([]);
        fetchPortfolio();
      }
    } catch (error) {
      console.error('Failed to add position:', error);
    }
  };

  const handleCreatePortfolio = async () => {
    if (!newPortfolioName.trim()) {return;}

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch('/api/portfolios', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newPortfolioName.trim(),
          description: `Portfolio created on ${new Date().toLocaleDateString()}`
        })
      });

      if (response.ok) {
        // Refresh the portfolio list
        await fetchPortfolio();
        setActivePortfolio(portfolios.length); // Set to the new portfolio
        setCreatePortfolioOpen(false);
        setNewPortfolioName('');
      }
    } catch (error) {
      console.error('Failed to create portfolio:', error);
    }
  };

  const handleEditPosition = (position) => {
    setEditingPosition(position);
    setEditShares(position.shares.toString());
    setEditDialogOpen(true);
  };

  const handleUpdatePosition = async () => {
    if (!editingPosition || !editShares) return;

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch(`/api/portfolios/${portfolios[activePortfolio].id}/positions/${editingPosition.symbol}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          shares: parseInt(editShares)
        })
      });

      if (response.ok) {
        setEditDialogOpen(false);
        setEditingPosition(null);
        setEditShares('');
        fetchPortfolio();
      }
    } catch (error) {
      console.error('Failed to update position:', error);
    }
  };

  const handleDeletePosition = async (position) => {
    if (!window.confirm(`Are you sure you want to remove ${position.symbol} from your portfolio?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch(`/api/portfolios/${portfolios[activePortfolio].id}/positions/${position.symbol}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        fetchPortfolio();
      }
    } catch (error) {
      console.error('Failed to delete position:', error);
    }
  };

  const handleRequestPredictions = async (position) => {
    const symbol = position.symbol;

    // Add to requesting set to show loading state
    setRequestingPredictions(prev => new Set(prev).add(symbol));

    try {
      const token = localStorage.getItem('authToken') || localStorage.getItem('token');
      const response = await fetch(`/api/stocks/${symbol}/request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          analysisType: 'full_analysis',
          timeframe: '30_days',
          priority: 'normal'
        })
      });

      const result = await response.json();

      if (result.success) {
        // Show success message
        alert(`✅ Prediction request submitted for ${symbol}!\n\nRequest ID: ${result.request_id}\nStatus: ${result.status}\n\n${result.message}`);
      } else {
        // Show error or queued message
        alert(`⚠️ ${result.message || `Failed to request predictions for ${symbol}`}`);
      }

    } catch (error) {
      console.error(`Failed to request predictions for ${symbol}:`, error);
      alert(`❌ Error requesting predictions for ${symbol}. Please try again later.`);
    } finally {
      // Remove from requesting set
      setRequestingPredictions(prev => {
        const newSet = new Set(prev);
        newSet.delete(symbol);
        return newSet;
      });
    }
  };

  const searchStocks = async (query) => {
    if (query.length < 2) {
      setSymbolOptions([]);
      return;
    }
    
    setSearchLoading(true);
    
    try {
      const response = await fetch(`/api/stocks/search?q=${query}`);
      if (response.ok) {
        const data = await response.json();
        // Ensure we get the results array from the API response
        const results = Array.isArray(data) ? data : (data.results || []);
        setSymbolOptions(results);
      } else {
        // Fallback to popular stocks if API fails
        const popularStocks = [
          { symbol: 'AAPL', name: 'Apple Inc.' },
          { symbol: 'GOOGL', name: 'Alphabet Inc.' },
          { symbol: 'MSFT', name: 'Microsoft Corporation' },
          { symbol: 'AMZN', name: 'Amazon.com Inc.' },
          { symbol: 'TSLA', name: 'Tesla Inc.' },
          { symbol: 'NVDA', name: 'NVIDIA Corporation' },
          { symbol: 'META', name: 'Meta Platforms Inc.' },
          { symbol: 'NFLX', name: 'Netflix Inc.' },
          { symbol: 'AMD', name: 'Advanced Micro Devices' },
          { symbol: 'INTC', name: 'Intel Corporation' }
        ];
        
        const filtered = popularStocks.filter(stock => 
          stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
          stock.name.toLowerCase().includes(query.toLowerCase())
        );
        setSymbolOptions(filtered);
      }
    } catch (error) {
      console.error('Search failed, using fallback data:', error);
      // Provide fallback popular stocks
      const popularStocks = [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corporation' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.' },
        { symbol: 'TSLA', name: 'Tesla Inc.' }
      ];
      
      const filtered = popularStocks.filter(stock => 
        stock.symbol.toLowerCase().includes(query.toLowerCase()) ||
        stock.name.toLowerCase().includes(query.toLowerCase())
      );
      setSymbolOptions(filtered);
    } finally {
      setSearchLoading(false);
    }
  };

  const columns = [
    {
      field: 'symbol',
      headerName: 'Symbol',
      width: 100,
      fontWeight: 'bold'
    },
    {
      field: 'companyName',
      headerName: 'Company',
      width: 200,
      flex: 1
    },
    {
      field: 'shares',
      headerName: 'Shares',
      width: 100,
      align: 'right',
      headerAlign: 'right'
    },
    {
      field: 'currentPrice',
      headerName: 'Price',
      width: 100,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => `$${params.value?.toFixed(2) || '0.00'}`
    },
    {
      field: 'marketValue',
      headerName: 'Market Value',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => `$${params.value?.toFixed(2) || '0.00'}`
    },
    {
      field: 'dailyChange',
      headerName: 'Day Change',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const value = params.value || 0;
        const positive = value >= 0;
        return (
          <Box sx={{ display: 'flex', alignItems: 'center', color: positive ? 'success.main' : 'error.main' }}>
            {positive ? <TrendingUp fontSize="small" /> : <TrendingDown fontSize="small" />}
            <span style={{ marginLeft: 4 }}>{positive ? '+' : ''}${value.toFixed(2)}</span>
          </Box>
        );
      }
    },
    {
      field: 'totalGainLoss',
      headerName: 'Total P&L',
      width: 120,
      align: 'right',
      headerAlign: 'right',
      renderCell: (params) => {
        const value = params.value || 0;
        const positive = value >= 0;
        return (
          <Typography color={positive ? 'success.main' : 'error.main'} fontWeight="bold">
            {positive ? '+' : ''}${value.toFixed(2)}
          </Typography>
        );
      }
    },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 180,
      align: 'center',
      headerAlign: 'center',
      sortable: false,
      renderCell: (params) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton
            size="small"
            onClick={() => handleEditPosition(params.row)}
            sx={{ color: 'primary.main' }}
            title="Edit Position"
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleDeletePosition(params.row)}
            sx={{ color: 'error.main' }}
            title="Remove Position"
          >
            <Delete fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleRequestPredictions(params.row)}
            sx={{ color: 'info.main' }}
            title="Request AI Predictions"
            disabled={requestingPredictions.has(params.row.symbol)}
          >
            {requestingPredictions.has(params.row.symbol) ?
              <CircularProgress size={16} /> :
              <TrendingFlat fontSize="small" />
            }
          </IconButton>
        </Box>
      )
    }
  ];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h3" sx={{ fontFamily: '"Playfair Display", serif' }}>
          Portfolio Management
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            startIcon={<FolderOpen />}
            onClick={() => setCreatePortfolioOpen(true)}
          >
            Create Portfolio
          </Button>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setAddDialogOpen(true)}
          >
            Add Position
          </Button>
        </Box>
      </Box>

      <Paper sx={{ mb: 2 }}>
        <Tabs 
          value={activePortfolio} 
          onChange={(e, newValue) => setActivePortfolio(newValue)}
          sx={{ px: 2 }}
        >
          {portfolios.map((portfolio, index) => (
            <Tab key={portfolio.id} label={portfolio.name} />
          ))}
        </Tabs>
      </Paper>

      <Paper sx={{ height: 600, width: '100%' }}>
        <DataGrid
          rows={portfolios[activePortfolio]?.positions || []}
          columns={columns}
          loading={loading}
          pageSizeOptions={[25, 50, 100]}
          initialState={{
            pagination: {
              paginationModel: { pageSize: 25 }
            }
          }}
          sx={{
            border: 'none',
            '& .MuiDataGrid-cell': {
              borderBottom: '1px solid rgba(58, 58, 60, 0.5)',
            },
            '& .MuiDataGrid-columnHeaders': {
              backgroundColor: 'rgba(45, 45, 45, 0.6)',
              borderBottom: '1px solid rgba(58, 58, 60, 0.8)',
            }
          }}
        />
      </Paper>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Position to {portfolios[activePortfolio]?.name}</DialogTitle>
        <DialogContent>
          <Autocomplete
            options={Array.isArray(symbolOptions) ? symbolOptions : []}
            getOptionLabel={(option) => `${option.symbol} - ${option.name}`}
            loading={searchLoading}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Search Stock Symbol"
                fullWidth
                margin="normal"
                autoFocus
                placeholder="Type to search (e.g., AAPL, Tesla, Microsoft)"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {searchLoading ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
            onInputChange={(event, newInputValue) => {
              setSearchSymbol(newInputValue);
              searchStocks(newInputValue);
            }}
            onChange={(event, newValue) => {
              setSearchSymbol(newValue || '');
            }}
            filterOptions={(options) => options} // Don't filter on client side
            noOptionsText={searchSymbol.length < 2 ? "Type 2+ characters to search" : "No stocks found"}
          />
          
          <TextField
            label="Number of Shares"
            type="number"
            fullWidth
            margin="normal"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            inputProps={{ min: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleAddPosition}
            variant="contained"
            disabled={!searchSymbol || !shares}
          >
            Add Position
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={createPortfolioOpen} onClose={() => setCreatePortfolioOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Create New Portfolio</DialogTitle>
        <DialogContent>
          <TextField
            label="Portfolio Name"
            fullWidth
            margin="normal"
            value={newPortfolioName}
            onChange={(e) => setNewPortfolioName(e.target.value)}
            autoFocus
            placeholder="e.g., Growth Portfolio, Dividend Stocks"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreatePortfolioOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleCreatePortfolio}
            variant="contained"
            disabled={!newPortfolioName.trim()}
          >
            Create Portfolio
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Edit Position - {editingPosition?.symbol}</DialogTitle>
        <DialogContent>
          <TextField
            label="Number of Shares"
            type="number"
            fullWidth
            margin="normal"
            value={editShares}
            onChange={(e) => setEditShares(e.target.value)}
            inputProps={{ min: 1 }}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleUpdatePosition}
            variant="contained"
            disabled={!editShares}
          >
            Update Position
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Portfolio;