import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  Link,
  Alert,
  CircularProgress
} from '@mui/material';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

const loginSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().required('Password is required')
});

const registerSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string()
    .min(8, 'Password must be at least 8 characters')
    .required('Password is required'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Please confirm your password')
});

const forgotPasswordSchema = yup.object({
  email: yup.string().email('Invalid email').required('Email is required')
});

function AuthDialog({ open, type, onClose, onSuccess, onSwitchType }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const getSchema = () => {
    switch (type) {
      case 'register':
        return registerSchema;
      case 'forgot':
        return forgotPasswordSchema;
      default:
        return loginSchema;
    }
  };

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(getSchema())
  });

  const getTitle = () => {
    switch (type) {
      case 'register':
        return 'Apply for Membership';
      case 'forgot':
        return 'Reset Password';
      default:
        return 'Member Access';
    }
  };

  const handleClose = () => {
    reset();
    setError('');
    setLoading(false);
    
    // Proper focus management to prevent aria-hidden issues
    // Move focus to body element before dialog closes
    setTimeout(() => {
      if (document.body && document.body.focus) {
        document.body.focus();
      }
      // Alternative: blur any active element
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    }, 0);
    
    onClose();
  };

  const onSubmit = async (data) => {
    setLoading(true);
    setError('');

    try {
      const endpoint = type === 'register' ? '/api/auth/register' : 
                      type === 'forgot' ? '/api/auth/forgot-password' : '/api/auth/login';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok) {
        if (type === 'forgot') {
          setError('');
          alert('Password reset email sent successfully');
          handleClose();
        } else {
          localStorage.setItem('authToken', result.token);
          localStorage.setItem('user', JSON.stringify(result.user || { email: data.email }));
          
          // Proper focus management before dialog closes
          setTimeout(() => {
            if (document.body && document.body.focus) {
              document.body.focus();
            }
            if (document.activeElement && document.activeElement !== document.body) {
              document.activeElement.blur();
            }
          }, 0);
          
          onSuccess();
        }
      } else {
        setError(result.error || 'Authentication failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      disableRestoreFocus={true}
      PaperProps={{
        sx: {
          borderRadius: 2,
          backdropFilter: 'blur(20px)',
        }
      }}
    >
      <DialogTitle sx={{ textAlign: 'center', pb: 1 }}>
        {getTitle()}
      </DialogTitle>
      
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <TextField
            {...register('email')}
            label="Email Address"
            type="email"
            fullWidth
            margin="normal"
            error={!!errors.email}
            helperText={errors.email?.message}
            autoFocus
          />

          {type !== 'forgot' && (
            <TextField
              {...register('password')}
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              error={!!errors.password}
              helperText={errors.password?.message}
            />
          )}

          {type === 'register' && (
            <TextField
              {...register('confirmPassword')}
              label="Confirm Password"
              type="password"
              fullWidth
              margin="normal"
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword?.message}
            />
          )}

          <Box sx={{ mt: 2, textAlign: 'center' }}>
            {type === 'login' && (
              <Typography variant="body2">
                <Link
                  component="button"
                  type="button"
                  onClick={() => onSwitchType('forgot')}
                  sx={{ textDecoration: 'none' }}
                >
                  Forgot your password?
                </Link>
              </Typography>
            )}
            
            {type !== 'forgot' && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {type === 'login' ? "Don't have an account? " : "Already have an account? "}
                <Link
                  component="button"
                  type="button"
                  onClick={() => onSwitchType(type === 'login' ? 'register' : 'login')}
                  sx={{ textDecoration: 'none' }}
                >
                  {type === 'login' ? 'Apply for membership' : 'Sign in here'}
                </Link>
              </Typography>
            )}

            {type === 'forgot' && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                <Link
                  component="button"
                  type="button"
                  onClick={() => onSwitchType('login')}
                  sx={{ textDecoration: 'none' }}
                >
                  Back to sign in
                </Link>
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={loading}
            startIcon={loading ? <CircularProgress size={20} /> : undefined}
          >
            {loading ? 'Processing...' : 
             type === 'register' ? 'Apply' :
             type === 'forgot' ? 'Send Reset Email' : 'Sign In'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default AuthDialog;