class LandingPage {
    constructor() {
        this.checkingAuth = false; // Prevent multiple auth checks
        this.initializeEventListeners();
        this.checkExistingAuth();
    }

    initializeEventListeners() {
        // Modal triggers
        document.getElementById('loginBtn').addEventListener('click', () => this.showModal('loginModal'));
        document.getElementById('signupBtn').addEventListener('click', () => this.showModal('signupModal'));
        document.getElementById('getStartedBtn').addEventListener('click', () => this.showModal('signupModal'));
        
        // Add event listener for new join now button
        const joinNowBtn = document.getElementById('joinNowBtn');
        if (joinNowBtn) {
            joinNowBtn.addEventListener('click', () => this.showModal('signupModal'));
        }
        document.getElementById('forgotPasswordLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.hideModal('loginModal');
            this.showModal('forgotModal');
        });

        // Modal close buttons
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.hideModal(modal.id);
            });
        });

        // Click outside modal to close
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });

        // Form submissions
        document.getElementById('loginForm').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('signupForm').addEventListener('submit', (e) => this.handleSignup(e));
        document.getElementById('forgotForm').addEventListener('submit', (e) => this.handleForgotPassword(e));

        // Password confirmation validation
        const signupPassword = document.getElementById('signupPassword');
        const signupPasswordConfirm = document.getElementById('signupPasswordConfirm');
        
        signupPasswordConfirm.addEventListener('input', () => {
            if (signupPassword.value !== signupPasswordConfirm.value) {
                signupPasswordConfirm.setCustomValidity('Passwords do not match');
            } else {
                signupPasswordConfirm.setCustomValidity('');
            }
        });
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
            // Clear any existing error messages
            const errorMsg = modal.querySelector('.error');
            if (errorMsg) errorMsg.remove();
        }
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
            // Reset forms
            const form = modal.querySelector('form');
            if (form) form.reset();
        }
    }

    showError(form, message) {
        // Remove existing error messages
        const existingError = form.querySelector('.error');
        if (existingError) existingError.remove();

        // Add new error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error';
        errorDiv.textContent = message;
        form.insertBefore(errorDiv, form.firstChild);
    }

    showSuccess(form, message) {
        // Remove existing messages
        const existingMsg = form.querySelector('.error, .success');
        if (existingMsg) existingMsg.remove();

        // Add success message
        const successDiv = document.createElement('div');
        successDiv.className = 'success';
        successDiv.textContent = message;
        form.insertBefore(successDiv, form.firstChild);
    }

    setLoading(form, loading) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (loading) {
            form.classList.add('loading');
            submitBtn.textContent = 'Please wait...';
            submitBtn.disabled = true;
        } else {
            form.classList.remove('loading');
            submitBtn.disabled = false;
            // Reset button text based on form
            if (form.id === 'loginForm') {
                submitBtn.textContent = 'Sign In';
            } else if (form.id === 'signupForm') {
                submitBtn.textContent = 'Create Account';
            } else if (form.id === 'forgotForm') {
                submitBtn.textContent = 'Send Reset Link';
            }
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        const form = e.target;
        const formData = new FormData(form);
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        this.setLoading(form, true);

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Login failed');
            }

            // Store the token
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Redirect to dashboard
            window.location.href = '/dashboard';

        } catch (error) {
            console.error('Login error:', error);
            this.showError(form, error.message);
        } finally {
            this.setLoading(form, false);
        }
    }

    async handleSignup(e) {
        e.preventDefault();
        const form = e.target;
        
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const passwordConfirm = document.getElementById('signupPasswordConfirm').value;

        if (password !== passwordConfirm) {
            this.showError(form, 'Passwords do not match');
            return;
        }

        this.setLoading(form, true);

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Registration failed');
            }

            // Store the token
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));

            // Redirect to dashboard
            window.location.href = '/dashboard';

        } catch (error) {
            console.error('Signup error:', error);
            this.showError(form, error.message);
        } finally {
            this.setLoading(form, false);
        }
    }

    async handleForgotPassword(e) {
        e.preventDefault();
        const form = e.target;
        
        const email = document.getElementById('forgotEmail').value;

        this.setLoading(form, true);

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send reset link');
            }

            this.showSuccess(form, 'Password reset link sent to your email!');
            setTimeout(() => {
                this.hideModal('forgotModal');
                this.showModal('loginModal');
            }, 2000);

        } catch (error) {
            console.error('Forgot password error:', error);
            this.showError(form, error.message);
        } finally {
            this.setLoading(form, false);
        }
    }

    checkExistingAuth() {
        // Prevent checking auth multiple times
        if (this.checkingAuth) return;
        this.checkingAuth = true;
        
        const token = localStorage.getItem('authToken');
        const user = localStorage.getItem('user');
        
        console.log('Landing page auth check - token present:', !!token, 'user present:', !!user);
        
        if (token && user) {
            console.log('Found existing token, verifying...');
            // Verify the token is still valid
            fetch('/api/auth/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            .then(response => {
                console.log('Auth verify response status:', response.status);
                if (response.ok) {
                    // User is already logged in, redirect to dashboard
                    console.log('Token valid, redirecting to dashboard');
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 100);
                } else {
                    // Token is invalid, clear it completely
                    console.warn('Token invalid (status: ' + response.status + '), clearing auth');
                    this.clearAllAuthData();
                    this.checkingAuth = false;
                }
            })
            .catch(error => {
                // Network error or token invalid
                console.error('Auth check failed:', error);
                this.clearAllAuthData();
                this.checkingAuth = false;
            });
        } else {
            console.log('No complete auth data found, staying on landing page');
            this.checkingAuth = false;
        }
    }
    
    clearAllAuthData() {
        console.log('Clearing all authentication data');
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        sessionStorage.removeItem('authToken');
        sessionStorage.removeItem('user');
    }
}

// Initialize the landing page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LandingPage();
});