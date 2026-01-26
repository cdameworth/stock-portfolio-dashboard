/**
 * Pricing Page
 * Displays subscription plans and handles upgrade flow via Stripe
 *
 * @version 1.0.0
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  CardActions,
  Button,
  Grid,
  Chip,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  FormControlLabel,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Divider,
} from '@mui/material';
import {
  Check,
  Star,
  Rocket,
  WorkspacePremium,
  CreditCard,
  Receipt,
  Schedule,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AppContext.jsx';
import { loadStripe } from '@stripe/stripe-js';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken') || localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };
};

const billingApi = {
  getPlans: async () => {
    const response = await fetch('/api/billing/plans', { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch plans');
    return response.json();
  },

  getSubscription: async () => {
    const response = await fetch('/api/billing/subscription', { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch subscription');
    return response.json();
  },

  getBillingHistory: async () => {
    const response = await fetch('/api/billing/history', { headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to fetch billing history');
    return response.json();
  },

  createCheckout: async (plan, billingPeriod) => {
    const response = await fetch('/api/billing/checkout', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ plan, billingPeriod }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create checkout session');
    }
    return response.json();
  },

  createPortalSession: async () => {
    const response = await fetch('/api/billing/portal', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to create portal session');
    return response.json();
  },

  cancelSubscription: async () => {
    const response = await fetch('/api/billing/cancel', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to cancel subscription');
    return response.json();
  },

  reactivateSubscription: async () => {
    const response = await fetch('/api/billing/reactivate', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!response.ok) throw new Error('Failed to reactivate subscription');
    return response.json();
  },

  applyPromoCode: async (code) => {
    const response = await fetch('/api/billing/promo', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ code }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Invalid promo code');
    }
    return response.json();
  },
};

const planIcons = {
  free: Star,
  pro: Rocket,
  premium: WorkspacePremium,
};

const planColors = {
  free: 'default',
  pro: 'primary',
  premium: 'secondary',
};

function PlanCard({ plan, currentPlan, isYearly, onSelect, loading }) {
  const Icon = planIcons[plan.id] || Star;
  const isCurrentPlan = currentPlan === plan.id;
  const isFree = plan.id === 'free';
  const price = isYearly ? plan.priceYearly : plan.priceMonthly;
  const monthlyEquivalent = isYearly ? (plan.priceYearly / 12).toFixed(2) : plan.priceMonthly;

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        border: isCurrentPlan ? 2 : 1,
        borderColor: isCurrentPlan ? 'primary.main' : 'divider',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 6,
        },
      }}
    >
      {isCurrentPlan && (
        <Chip
          label="Current Plan"
          color="primary"
          size="small"
          sx={{
            position: 'absolute',
            top: -12,
            left: '50%',
            transform: 'translateX(-50%)',
          }}
        />
      )}

      <CardContent sx={{ flexGrow: 1, pt: 4 }}>
        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Icon sx={{ fontSize: 48, color: `${planColors[plan.id]}.main`, mb: 1 }} />
          <Typography variant="h5" fontWeight="bold">
            {plan.name}
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'center', mb: 3 }}>
          <Typography variant="h3" fontWeight="bold" color="primary">
            ${isFree ? '0' : monthlyEquivalent}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isFree ? 'Forever free' : `per month${isYearly ? ' (billed yearly)' : ''}`}
          </Typography>
          {!isFree && isYearly && (
            <Chip
              label={`Save $${((plan.priceMonthly * 12 - plan.priceYearly)).toFixed(0)}/year`}
              color="success"
              size="small"
              sx={{ mt: 1 }}
            />
          )}
        </Box>

        <List dense>
          {plan.features.map((feature, index) => (
            <ListItem key={index} sx={{ py: 0.5 }}>
              <ListItemIcon sx={{ minWidth: 32 }}>
                <Check color="success" fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={feature}
                primaryTypographyProps={{ variant: 'body2' }}
              />
            </ListItem>
          ))}
        </List>
      </CardContent>

      <CardActions sx={{ p: 2, pt: 0 }}>
        {isFree ? (
          <Button fullWidth variant="outlined" disabled={isCurrentPlan}>
            {isCurrentPlan ? 'Current Plan' : 'Downgrade'}
          </Button>
        ) : (
          <Button
            fullWidth
            variant={isCurrentPlan ? 'outlined' : 'contained'}
            color={planColors[plan.id]}
            onClick={() => onSelect(plan.id)}
            disabled={loading || isCurrentPlan}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : isCurrentPlan ? (
              'Current Plan'
            ) : currentPlan === 'free' ? (
              'Upgrade Now'
            ) : (
              'Switch Plan'
            )}
          </Button>
        )}
      </CardActions>
    </Card>
  );
}

function BillingHistory({ history }) {
  if (!history || history.length === 0) {
    return (
      <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
        No billing history yet
      </Typography>
    );
  }

  return (
    <List>
      {history.map((item) => (
        <ListItem
          key={item.id}
          sx={{
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            mb: 1,
          }}
        >
          <ListItemIcon>
            <Receipt />
          </ListItemIcon>
          <ListItemText
            primary={item.description}
            secondary={new Date(item.paidAt).toLocaleDateString()}
          />
          <Typography variant="body1" fontWeight="bold">
            ${item.amount.toFixed(2)}
          </Typography>
          {item.invoiceUrl && (
            <Button
              size="small"
              href={item.invoiceUrl}
              target="_blank"
              sx={{ ml: 2 }}
            >
              View
            </Button>
          )}
        </ListItem>
      ))}
    </List>
  );
}

function Pricing() {
  const { user, isAuthenticated } = useAuth();
  const [plans, setPlans] = useState([]);
  const [subscription, setSubscription] = useState(null);
  const [billingHistory, setBillingHistory] = useState([]);
  const [isYearly, setIsYearly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState(null);
  const [promoDialogOpen, setPromoDialogOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState(null);
  const [appliedPromo, setAppliedPromo] = useState(null);

  useEffect(() => {
    fetchData();
  }, [isAuthenticated]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [plansData, subscriptionData, historyData] = await Promise.all([
        billingApi.getPlans(),
        isAuthenticated ? billingApi.getSubscription() : Promise.resolve(null),
        isAuthenticated ? billingApi.getBillingHistory() : Promise.resolve({ history: [] }),
      ]);

      setPlans(plansData.plans || []);
      setSubscription(subscriptionData);
      setBillingHistory(historyData?.history || []);
    } catch (err) {
      console.error('Error fetching billing data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPlan = async (planId) => {
    if (!isAuthenticated) {
      setError('Please log in to upgrade your plan');
      return;
    }

    setCheckoutLoading(true);
    setError(null);

    try {
      const billingPeriod = isYearly ? 'yearly' : 'monthly';
      const { sessionId, url } = await billingApi.createCheckout(planId, billingPeriod);

      if (url) {
        window.location.href = url;
      } else if (sessionId) {
        const stripe = await stripePromise;
        if (stripe) {
          const { error } = await stripe.redirectToCheckout({ sessionId });
          if (error) {
            throw new Error(error.message);
          }
        }
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const { url } = await billingApi.createPortalSession();
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Portal error:', err);
      setError(err.message);
    }
  };

  const handleApplyPromo = async () => {
    setPromoError(null);
    try {
      const result = await billingApi.applyPromoCode(promoCode);
      setAppliedPromo(result);
      setPromoDialogOpen(false);
      setPromoCode('');
    } catch (err) {
      setPromoError(err.message);
    }
  };

  const currentPlan = subscription?.plan || user?.plan || 'free';

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg">
      <Box sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight="bold" textAlign="center" gutterBottom>
          Choose Your Plan
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          textAlign="center"
          sx={{ mb: 4, maxWidth: 600, mx: 'auto' }}
        >
          Unlock premium features to supercharge your investment strategy with AI-powered insights and real-time data.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {appliedPromo && (
          <Alert severity="success" sx={{ mb: 3 }}>
            Promo code applied! {appliedPromo.discountType === 'percent'
              ? `${appliedPromo.discountValue}% off`
              : `$${appliedPromo.discountValue / 100} off`} your subscription.
          </Alert>
        )}

        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', mb: 4, gap: 2 }}>
          <Typography color={!isYearly ? 'primary' : 'text.secondary'}>Monthly</Typography>
          <FormControlLabel
            control={
              <Switch
                checked={isYearly}
                onChange={(e) => setIsYearly(e.target.checked)}
                color="primary"
              />
            }
            label=""
          />
          <Typography color={isYearly ? 'primary' : 'text.secondary'}>
            Yearly
            <Chip label="Save 17%" color="success" size="small" sx={{ ml: 1 }} />
          </Typography>
        </Box>

        <Grid container spacing={3} sx={{ mb: 6 }}>
          {plans.map((plan) => (
            <Grid item xs={12} md={4} key={plan.id}>
              <PlanCard
                plan={plan}
                currentPlan={currentPlan}
                isYearly={isYearly}
                onSelect={handleSelectPlan}
                loading={checkoutLoading}
              />
            </Grid>
          ))}
        </Grid>

        {isAuthenticated && subscription?.hasSubscription && (
          <>
            <Divider sx={{ my: 4 }} />

            <Box sx={{ mb: 4 }}>
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                <CreditCard sx={{ mr: 1, verticalAlign: 'middle' }} />
                Subscription Details
              </Typography>

              <Card sx={{ p: 3, mt: 2 }}>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">
                      Current Plan
                    </Typography>
                    <Typography variant="h6" fontWeight="bold">
                      {subscription.plan?.charAt(0).toUpperCase() + subscription.plan?.slice(1)}
                    </Typography>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">
                      Status
                    </Typography>
                    <Chip
                      label={subscription.status}
                      color={subscription.status === 'active' ? 'success' : 'warning'}
                      size="small"
                    />
                  </Grid>
                  {subscription.currentPeriodEnd && (
                    <Grid item xs={12} sm={6}>
                      <Typography variant="body2" color="text.secondary">
                        <Schedule sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'middle' }} />
                        {subscription.cancelAtPeriodEnd ? 'Ends on' : 'Renews on'}
                      </Typography>
                      <Typography variant="body1">
                        {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                      </Typography>
                    </Grid>
                  )}
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      <Button
                        variant="outlined"
                        onClick={handleManageSubscription}
                        startIcon={<CreditCard />}
                      >
                        Manage Billing
                      </Button>
                      <Button
                        variant="text"
                        onClick={() => setPromoDialogOpen(true)}
                      >
                        Have a promo code?
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
              </Card>
            </Box>

            <Box>
              <Typography variant="h5" fontWeight="bold" gutterBottom>
                <Receipt sx={{ mr: 1, verticalAlign: 'middle' }} />
                Billing History
              </Typography>
              <Card sx={{ p: 2, mt: 2 }}>
                <BillingHistory history={billingHistory} />
              </Card>
            </Box>
          </>
        )}

        {!isAuthenticated && (
          <Alert severity="info" sx={{ mt: 4 }}>
            Sign in to upgrade your account and access premium features.
          </Alert>
        )}
      </Box>

      <Dialog open={promoDialogOpen} onClose={() => setPromoDialogOpen(false)}>
        <DialogTitle>Apply Promo Code</DialogTitle>
        <DialogContent>
          {promoError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {promoError}
            </Alert>
          )}
          <TextField
            autoFocus
            fullWidth
            label="Promo Code"
            value={promoCode}
            onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
            placeholder="Enter your promo code"
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPromoDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleApplyPromo}
            disabled={!promoCode.trim()}
          >
            Apply
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default Pricing;
