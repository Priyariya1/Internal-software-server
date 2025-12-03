import express from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js'; //  Import the User model
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Register new user (Corrected)
router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name } = req.body;

    // 1. Validation
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Email, password, and full name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // 2. Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    // 3. Hash the password
    const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds

    // 4. Create the new user in the database
    // I'll show you how below this code block.
    const userId = await User.create({
      email,
      password: hashedPassword,
      full_name
    });

    // 5. Fetch the newly created user to get all details (like role)
    const newUser = await User.findById(userId);

    // 6. Generate a real JWT
    const token = User.generateToken(newUser);

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: newUser.id,
        email: newUser.email,
        full_name: newUser.full_name,
        role: newUser.role,
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//  Login user 
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Validation
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // 2. Find the user by email
    const user = await User.findByEmail(email);
    if (!user) {
      // Use a generic message for security
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await User.verifyPassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 4. Generate a real JWT
    const token = User.generateToken(user);

    // 5. Send response (don't send the password back)
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// This route is mostly fine, but let's select specific fields
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // req.user is already populated by the authenticateToken middleware
    const user = req.user;

    res.json({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      avatar_url: user.avatar_url,
      role: user.role,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update profile
router.put('/me', authenticateToken, async (req, res) => {
  try {
    const { email, password, old_password, full_name } = req.body;
    const userId = req.user.id;

    const updates = {};
    if (email) updates.email = email;
    if (full_name) updates.full_name = full_name;

    // If user wants to change password, verify old password first
    if (password) {
      if (!old_password) {
        return res.status(400).json({ error: 'Old password is required to set a new password' });
      }

      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long' });
      }

      // Verify old password
      const user = await User.findById(userId);
      const isOldPasswordValid = await User.verifyPassword(old_password, user.password);

      if (!isOldPasswordValid) {
        return res.status(401).json({ error: 'Old password is incorrect' });
      }

      updates.password = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    await User.update(userId, updates);

    // Fetch updated user
    const updatedUser = await User.findById(userId);

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        role: updatedUser.role,
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// This route is fine as is
router.post('/logout', authenticateToken, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

// Forgot Password - Request OTP
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if user exists
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({ message: 'If the email exists, an OTP has been sent' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in database
    const { v4: uuidv4 } = await import('uuid');
    const pool = (await import('../config/database.js')).default;
    const otpId = uuidv4();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await pool.query(
      'INSERT INTO password_reset_otps (id, user_id, otp, expires_at) VALUES (?, ?, ?, ?)',
      [otpId, user.id, otp, expiresAt]
    );

    // Send OTP via email
    const { sendOTPEmail } = await import('../services/emailService.js');
    await sendOTPEmail(email, otp);

    res.json({ message: 'If the email exists, an OTP has been sent' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid OTP' });
    }

    // Check OTP
    const pool = (await import('../config/database.js')).default;
    const [otpRecords] = await pool.query(
      `SELECT * FROM password_reset_otps 
       WHERE user_id = ? AND otp = ? AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, otp]
    );

    if (otpRecords.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    res.json({ message: 'OTP verified successfully', valid: true });
  } catch (error) {
    console.error('Verify OTP error:', error);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

// Reset Password with OTP
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, new_password } = req.body;

    if (!email || !otp || !new_password) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    if (new_password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Find user
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid request' });
    }

    // Verify OTP
    const pool = (await import('../config/database.js')).default;
    const [otpRecords] = await pool.query(
      `SELECT * FROM password_reset_otps 
       WHERE user_id = ? AND otp = ? AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [user.id, otp]
    );

    if (otpRecords.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    // Mark OTP as used
    await pool.query(
      'UPDATE password_reset_otps SET used = TRUE WHERE id = ?',
      [otpRecords[0].id]
    );

    // Update password
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await User.update(user.id, { password: hashedPassword });

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;