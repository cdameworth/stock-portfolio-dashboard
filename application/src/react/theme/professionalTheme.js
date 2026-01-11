import { createTheme } from '@mui/material/styles';

// Professional black-tie color palette
const colors = {
  // Primary Colors - Sophisticated Blacks and Grays
  deepCharcoal: '#1a1a1a',
  charcoal: '#2d2d2d',
  warmBlack: '#1c1c1e',
  professionalGray: '#3a3a3c',
  silverAccent: '#8e8e93',
  
  // Accent Colors - Refined Gold and White
  refinedGold: '#d4af37',
  mutedGold: '#c5a028',
  crispWhite: '#ffffff',
  warmWhite: '#f8f8f8',
  softGray: '#f2f2f7',
  
  // Status Colors
  success: '#30d158',
  warning: '#ff9f0a',
  danger: '#ff453a',
  info: '#007aff',
  
  // Border
  borderColor: '#3a3a3c',
  borderLight: '#48484a'
};

const professionalTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.refinedGold,
      dark: colors.mutedGold,
      light: '#e5c965',
      contrastText: colors.deepCharcoal,
    },
    secondary: {
      main: colors.silverAccent,
      dark: '#6d6d7a',
      light: '#a5a5ac',
      contrastText: colors.crispWhite,
    },
    background: {
      default: colors.deepCharcoal,
      paper: colors.charcoal,
    },
    text: {
      primary: colors.crispWhite,
      secondary: colors.silverAccent,
    },
    divider: colors.borderColor,
    success: {
      main: colors.success,
    },
    warning: {
      main: colors.warning,
    },
    error: {
      main: colors.danger,
    },
    info: {
      main: colors.info,
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontFamily: '"Playfair Display", Georgia, serif',
      fontWeight: 500,
      fontSize: '2.5rem',
      lineHeight: 1.2,
    },
    h2: {
      fontFamily: '"Playfair Display", Georgia, serif',
      fontWeight: 500,
      fontSize: '2rem',
      lineHeight: 1.3,
    },
    h3: {
      fontFamily: '"Playfair Display", Georgia, serif',
      fontWeight: 500,
      fontSize: '1.5rem',
      lineHeight: 1.4,
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.125rem',
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.6,
      fontWeight: 400,
    },
    body2: {
      fontSize: '0.875rem',
      lineHeight: 1.6,
      fontWeight: 400,
    },
    caption: {
      fontSize: '0.8125rem',
      lineHeight: 1.4,
      fontWeight: 400,
      color: colors.silverAccent,
    },
    button: {
      fontWeight: 600,
      textTransform: 'none',
      letterSpacing: '0.02em',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          padding: '10px 24px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
            transform: 'translateY(-1px)',
          },
        },
        containedPrimary: {
          background: `linear-gradient(135deg, ${colors.refinedGold}, ${colors.mutedGold})`,
          color: colors.deepCharcoal,
          fontWeight: 600,
          '&:hover': {
            background: colors.refinedGold,
          },
        },
        outlinedPrimary: {
          borderColor: colors.borderColor,
          color: colors.crispWhite,
          '&:hover': {
            backgroundColor: colors.charcoal,
            borderColor: colors.refinedGold,
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(26, 26, 26, 0.9)',
          border: `1px solid ${colors.borderColor}`,
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
          '&:hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 10px 15px rgba(0, 0, 0, 0.3)',
            transition: 'all 0.2s ease',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: colors.charcoal,
          border: `1px solid ${colors.borderColor}`,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(26, 26, 26, 0.8)',
            '& fieldset': {
              borderColor: colors.borderColor,
            },
            '&:hover fieldset': {
              borderColor: colors.borderLight,
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.refinedGold,
              boxShadow: `0 0 0 3px rgba(212, 175, 55, 0.1)`,
            },
          },
          '& .MuiInputLabel-root': {
            color: colors.silverAccent,
            fontWeight: 500,
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: colors.refinedGold,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.deepCharcoal,
          border: `1px solid ${colors.borderColor}`,
          borderRadius: 12,
          backdropFilter: 'blur(20px)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          backgroundColor: colors.charcoal,
          borderBottom: `1px solid ${colors.borderColor}`,
          fontFamily: '"Playfair Display", Georgia, serif',
          fontWeight: 500,
          color: colors.crispWhite,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: `1px solid ${colors.borderColor}`,
          boxShadow: 'none',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(26, 26, 26, 0.95)',
          borderRight: `1px solid ${colors.borderColor}`,
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderLeft: '3px solid transparent',
          padding: '12px 20px',
          '&:hover': {
            backgroundColor: 'rgba(45, 45, 45, 0.6)',
            borderLeftColor: colors.refinedGold,
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(45, 45, 45, 0.6)',
            borderLeftColor: colors.refinedGold,
            '&:hover': {
              backgroundColor: 'rgba(45, 45, 45, 0.8)',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          backgroundColor: `linear-gradient(135deg, ${colors.refinedGold}, ${colors.mutedGold})`,
          color: colors.deepCharcoal,
          fontWeight: 600,
          fontSize: '0.75rem',
          letterSpacing: '0.5px',
        },
      },
    },
  },
  shadows: [
    'none',
    '0 1px 3px rgba(0, 0, 0, 0.2)',
    '0 4px 6px rgba(0, 0, 0, 0.2)',
    '0 10px 15px rgba(0, 0, 0, 0.2)',
    '0 20px 25px rgba(0, 0, 0, 0.3)',
    ...Array(20).fill('0 20px 25px rgba(0, 0, 0, 0.3)'),
  ],
});

export default professionalTheme;