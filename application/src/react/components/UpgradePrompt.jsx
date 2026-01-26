/**
 * Upgrade Prompt Component
 * Shows a message prompting users to upgrade for premium features
 */

import React from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Lock,
  Star,
  Check,
  TrendingUp,
  Psychology,
  Notifications,
  Download,
} from '@mui/icons-material';
import { useNavigation } from '../contexts/AppContext.jsx';

const planFeatures = {
  pro: {
    name: 'Pro',
    color: 'primary',
    icon: TrendingUp,
    features: [
      'Unlimited portfolios',
      'Real-time market data',
      'Price alerts',
      'Export data to CSV',
      'Priority support',
    ],
  },
  premium: {
    name: 'Premium',
    color: 'secondary',
    icon: Star,
    features: [
      'Everything in Pro',
      'Advanced AI insights',
      'Performance breakdown',
      'AI tuning history',
      'Dedicated account manager',
    ],
  },
};

function UpgradePrompt({
  feature = 'this feature',
  requiredPlan = 'pro',
  compact = false,
  showFeatures = true,
}) {
  const { setCurrentPage } = useNavigation();
  const planInfo = planFeatures[requiredPlan] || planFeatures.pro;
  const PlanIcon = planInfo.icon;

  const handleUpgrade = () => {
    setCurrentPage('pricing');
  };

  if (compact) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          p: 2,
          backgroundColor: 'action.hover',
          borderRadius: 1,
          border: '1px dashed',
          borderColor: 'divider',
        }}
      >
        <Lock color="action" />
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="body2">
            {feature} requires {planInfo.name} plan
          </Typography>
        </Box>
        <Button
          variant="contained"
          size="small"
          color={planInfo.color}
          onClick={handleUpgrade}
        >
          Upgrade
        </Button>
      </Box>
    );
  }

  return (
    <Paper
      sx={{
        p: 4,
        textAlign: 'center',
        background: `linear-gradient(135deg, ${
          requiredPlan === 'premium'
            ? 'rgba(156, 39, 176, 0.05)'
            : 'rgba(33, 150, 243, 0.05)'
        } 0%, rgba(255, 255, 255, 0) 100%)`,
        border: '1px solid',
        borderColor: requiredPlan === 'premium' ? 'secondary.main' : 'primary.main',
      }}
    >
      <Box
        sx={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          backgroundColor: `${planInfo.color}.main`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
        }}
      >
        <Lock sx={{ fontSize: 40, color: 'white' }} />
      </Box>

      <Chip
        icon={<PlanIcon />}
        label={`${planInfo.name} Plan Required`}
        color={planInfo.color}
        sx={{ mb: 2 }}
      />

      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Upgrade to Access {feature}
      </Typography>

      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500, mx: 'auto' }}>
        Unlock powerful features to supercharge your investment strategy with our {planInfo.name}{' '}
        plan.
      </Typography>

      {showFeatures && (
        <Box sx={{ maxWidth: 300, mx: 'auto', mb: 3 }}>
          <List dense>
            {planInfo.features.map((feat, index) => (
              <ListItem key={index} sx={{ py: 0.5 }}>
                <ListItemIcon sx={{ minWidth: 32 }}>
                  <Check color="success" fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={feat} primaryTypographyProps={{ variant: 'body2' }} />
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      <Button
        variant="contained"
        size="large"
        color={planInfo.color}
        onClick={handleUpgrade}
        startIcon={<Star />}
      >
        View Pricing Plans
      </Button>
    </Paper>
  );
}

export default UpgradePrompt;
